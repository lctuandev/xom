import { content } from "@xom/content";
import type { DishView, EventView, MovePayload, OrderEvent, WeatherView } from "@xom/shared";
import {
  dailyEvents,
  overrideWeather,
  upcomingWeather,
  type WeatherSpan,
  weatherAt,
  weatherPlan,
  weeklyEvents,
} from "@xom/sim";
import type { Shift } from "./work.js";

/** Lỗi nghiệp vụ trả về client qua Ack; message tiếng Việt hiển thị thẳng. */
export class GameError extends Error {
  constructor(
    readonly code: "invalid_state" | "insufficient_funds" | "invalid_payload",
    message: string,
  ) {
    super(message);
  }
}

export interface Member {
  playerId: string;
  displayName: string;
  sockets: Set<string>;
  /** Hẹn giờ dọn dẹp khi người chơi rời đi (cho phép vào lại trong thời gian ân hạn). */
  leaveTimer?: NodeJS.Timeout;
  /** Vị trí gần nhất client báo lên (để người khác thấy và để server kiểm đứng gần). */
  pos?: MovePayload;
  /** Lúc bắt đầu phiên chơi (đo thời lượng phiên). */
  sessionStart?: number;
}

/** Đơn khách đang ở quầy (chỉ sống trong bộ nhớ): chờ làm món → chờ tính tiền → đi. */
export interface PendingOrder {
  event: OrderEvent;
  /** Kiên nhẫn của khách (ms). */
  patienceMs: number;
  /** Món đã làm (lần gần nhất) và kết quả chấm. */
  dish: { build: DishView; score: number; mistakes: string[] } | null;
  /** Chủ quầy đã bắt tay làm món (chỉ cộng thêm kiên nhẫn một lần). */
  started?: boolean;
  /** Số lần kiểm tra bộ phận (sửa xe, UC-G3). */
  checks?: number;
  /** Khách VIP: hệ số boa, uy tín được/mất (từ content.events). */
  vip?: { minMods: number; patience: number; tipMult: number; repWin: number; repLose: number };
}

/** Trạng thái chạy của một xóm trong bộ nhớ; nguồn sự thật vẫn là DB. */
export class RoomRuntime {
  readonly members = new Map<string, Member>();
  /** Người chơi đang đứng ở quầy của mình — quầy chỉ bán khi có chủ. */
  readonly attending = new Set<string>();
  /** Chủ quầy giành tự đứng bán dù nhân viên đang trong ca (mặc định để nhân viên bán). */
  readonly selfSell = new Set<string>();
  readonly orders = new Map<string, PendingOrder>();
  /** Hàng xóm đã mua ở quầy ai hôm nay (`buyer:owner:day`) — mới được viết đánh giá (UC-F11). */
  readonly purchases = new Set<string>();
  /** Lần chat gần nhất của từng người (ms) — chống spam. */
  readonly chatAt = new Map<string, number>();
  /** Số lần nhập sai PIN ATM trong ngày (reset khi đúng / sang ngày). */
  readonly atmTries = new Map<string, number>();
  /** Mức đói/khát đã nhắc gần nhất của từng người ("low:ok"…) — nhắc một lần mỗi lần đổi mức. */
  readonly needsAlert = new Map<string, string>();
  /** Lần khách réo gần nhất ở từng quầy (phút game). */
  readonly calloutAt = new Map<string, number>();
  /** Rao hàng: businessId → hết hiệu lực ở phút game này (trong ngày). */
  readonly boostUntil = new Map<string, number>();
  /** Hồi chiêu rao hàng: playerId → được rao lại từ phút game này. */
  readonly shoutReadyAt = new Map<string, number>();
  /** Ca làm thuê đang diễn ra: playerId → ca (docs/USECASES.md nhóm W). */
  readonly shifts = new Map<string, Shift>();
  /** Người chơi vừa đổi vị trí, chờ phát cho cả xóm ở nhịp 10 Hz. */
  readonly dirtyPeers = new Set<string>();
  /** Thời tiết cả ngày hôm nay (tất định theo xóm + ngày; sự kiện có thể đè). */
  weather: WeatherSpan[] = [];
  /** Sự kiện hôm nay (theo ngày; khai trương do người chơi thêm vào). Sang ngày mới thì xoá. */
  events: EventView[] = [];
  timer?: NodeJS.Timeout;
  peerTimer?: NodeJS.Timeout;
  private queue: Promise<unknown> = Promise.resolve();
  private tickPending = false;

  constructor(
    readonly id: string,
    readonly code: string,
    public day: number,
    public minute: number,
  ) {
    this.planWeather();
  }

  /**
   * Lập thời tiết + sự kiện ngẫu nhiên cho ngày hiện tại (gọi khi nạp xóm và khi sang ngày mới).
   * Sự kiện đè thời tiết (mưa lớn toàn xóm) được chèn vào kế hoạch trời để dự báo báo trước được.
   */
  planWeather() {
    const eco = content.economy;
    this.weather = weatherPlan(
      content.data.weather,
      eco.dayStartMinute,
      eco.dayEndMinute,
      this.id,
      this.day,
    );
    this.events = [];
    // Sự kiện ngẫu nhiên trong ngày + sự kiện theo lịch tuần (chợ đêm thứ Bảy, THEGIOI §2).
    const today = [
      ...dailyEvents(content.data.events, this.id, this.day),
      ...weeklyEvents(content.data.events, content.weekday(this.day).index),
    ];
    for (const e of today) {
      const sky = content.event(e.eventId).effects.weather;
      if (sky) this.weather = overrideWeather(this.weather, { from: e.from, to: e.to, kind: sky });
      this.events.push({ key: `${e.eventId}:${this.day}`, ...e });
    }
  }

  /** Sự kiện đang diễn ra (lọc theo loại / quầy). */
  activeEvents(businessId?: string): EventView[] {
    return this.events.filter(
      (e) =>
        this.minute >= e.from &&
        this.minute < e.to &&
        (businessId === undefined || e.businessId === businessId),
    );
  }

  /** Kiểu trời đang có (content). */
  get sky() {
    return content.weatherKind(weatherAt(this.weather, this.minute).kind);
  }

  weatherView(): WeatherView {
    const next = upcomingWeather(this.weather, this.minute, content.data.weather.forecastMinutes);
    return {
      now: weatherAt(this.weather, this.minute).kind,
      next: next ? { kind: next.kind, at: next.from } : null,
    };
  }

  get channel() {
    return `room:${this.id}`;
  }

  /** Tuần tự hóa mọi thay đổi của xóm (intent + tick) để không có hai thao tác chen nhau. */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Tick bỏ qua nếu tick trước còn đang chạy — không để hàng đợi phình ra. */
  /** Đang tắt: không nhận nhịp / intent mới (tránh chạm DB sau khi Prisma đã đóng). */
  closing = false;

  /** Chờ mọi việc đang xếp hàng (tick, intent) chạy xong — gọi khi tắt server. */
  async drain() {
    this.closing = true;
    await this.queue;
  }

  runTick(fn: () => Promise<void>) {
    if (this.tickPending || this.closing) return;
    this.tickPending = true;
    // Lỗi trong một nhịp (vd. tắt server giữa chừng) không được thành unhandled rejection; nhịp sau chạy tiếp.
    void this.run(fn)
      .catch((err) => console.error(`[xóm ${this.id}] tick lỗi:`, err))
      .finally(() => {
        this.tickPending = false;
      });
  }
}

/** Ngữ cảnh một intent: xóm đang chạy + người gửi. */
export interface IntentContext {
  room: RoomRuntime;
  playerId: string;
}
