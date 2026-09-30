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
}

/** Trạng thái chạy của một xóm trong bộ nhớ; nguồn sự thật vẫn là DB. */
export class RoomRuntime {
  readonly members = new Map<string, Member>();
  timer?: NodeJS.Timeout;
  private queue: Promise<unknown> = Promise.resolve();
  private tickPending = false;

  constructor(
    readonly id: string,
    public day: number,
    public minute: number,
  ) {}

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
  runTick(fn: () => Promise<void>) {
    if (this.tickPending) return;
    this.tickPending = true;
    void this.run(fn).finally(() => {
      this.tickPending = false;
    });
  }
}
