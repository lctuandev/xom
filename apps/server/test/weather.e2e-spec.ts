import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type {
  Ack,
  ClientToServerEvents,
  ClockView,
  ServerToClientEvents,
  Snapshot,
  WorkResult,
} from "@xom/shared";
import { io, type Socket } from "socket.io-client";
import { register, startApp } from "./helpers.js";

// Thời tiết (docs/USECASES.md UC-B4): server phát trời cùng đồng hồ, báo trước khi sắp đổi; bão thì giao hàng có phụ phí.

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

async function join(url: string): Promise<{ socket: Client; snap: Snapshot }> {
  const { body } = await register(url);
  return new Promise((resolve, reject) => {
    const socket: Client = io(url, {
      path: "/socket.io",
      addTrailingSlash: false,
      transports: ["websocket"],
      auth: { token: body.accessToken },
    });
    socket.once("snapshot", (snap) => resolve({ socket, snap }));
    socket.once("connect_error", reject);
  });
}

function emit<T = WorkResult>(
  socket: Client,
  event: keyof ClientToServerEvents,
  payload: unknown,
): Promise<Ack<T>> {
  return new Promise((resolve) => {
    // biome-ignore lint/suspicious/noExplicitAny: emit generic qua union event
    (socket.emit as any)(event, payload, resolve);
  });
}

function nextClock(socket: Client, pred: (c: ClockView) => boolean): Promise<ClockView> {
  return new Promise((resolve) => {
    const on = (c: ClockView) => {
      if (!pred(c)) return;
      socket.off("clock", on);
      resolve(c);
    };
    socket.on("clock", on);
  });
}

const KINDS = content.data.weather.kinds.map((k) => k.id);

describe("Thời tiết (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  it("đồng hồ mang theo trời hiện tại; sắp đổi trời thì báo trước", async () => {
    const { socket, snap } = await join(url);
    expect(KINDS).toContain(snap.clock.weather.now);

    expect((await emit(socket, "debug:weather", { kind: "rain", minutes: 240 })).ok).toBe(true);
    const rain = await nextClock(socket, (c) => c.weather.now === "rain");
    expect(rain.weather.now).toBe("rain");

    // Bão kéo tới sau 40 phút game: dải tin được báo trước (trong khoảng dự báo).
    await emit(socket, "debug:weather", { kind: "storm", after: 40, minutes: 60 });
    const warned = await nextClock(socket, (c) => c.weather.next?.kind === "storm");
    expect(warned.weather.now).toBe("rain");
    expect((warned.weather.next?.at ?? 0) - warned.minute).toBeLessThanOrEqual(40);
    const storm = await nextClock(socket, (c) => c.weather.now === "storm");
    expect(storm.minute).toBeGreaterThanOrEqual(warned.weather.next?.at ?? 0);
    socket.disconnect();
  });

  it("lệnh ép thời tiết bị từ chối ở production", async () => {
    const { socket } = await join(url);
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await emit(socket, "debug:weather", { kind: "storm", minutes: 60 });
      expect(res).toMatchObject({ ok: false, error: "invalid_state" });
    } finally {
      process.env.NODE_ENV = env;
    }
    socket.disconnect();
  });

  it("bão: giao hàng xong được cộng phụ phí bão vào tiền chuyến", async () => {
    const { socket: s } = await join(url);
    await emit(s, "debug:weather", { kind: "storm", minutes: 960 });
    await emit(s, "work:start", { jobId: "giao_hang", role: "giao_hang" });
    const taken = await emit(s, "work:act", { kind: "take" });
    const orders = (taken.ok && taken.data.shift?.deliveries) || [];
    for (const d of orders) await emit(s, "work:act", { kind: "pick", taskId: d.id, code: d.code });
    await emit(s, "work:act", { kind: "ride", fast: false });

    let delivered = 0;
    let handed = 0;
    let surchargeLines = 0;
    for (const d of orders) {
      const call = await emit(s, "work:act", {
        kind: "call",
        taskId: d.id,
        addressId: d.addressId,
      });
      const cur = call.ok ? call.data.shift?.deliveries.find((x) => x.id === d.id) : undefined;
      if (cur?.stage === "absent") {
        if (d.cod > 0) {
          await emit(s, "work:act", { kind: "absent", taskId: d.id, choice: "return" });
        } else {
          await emit(s, "work:act", { kind: "absent", taskId: d.id, choice: "neighbor" });
          delivered++;
        }
        continue;
      }
      const door = cur?.door;
      if (!door || door.relation === "stranger") continue;
      const change = door.pay?.kind === "cash" ? door.pay.bill - d.cod : null;
      const done = await emit(s, "work:act", {
        kind: "handover",
        taskId: d.id,
        accept: true,
        change,
      });
      handed++;
      if (done.ok && /phụ phí/.test(done.data.line)) surchargeLines++;
      delivered++;
    }
    const settle = await emit(s, "work:act", { kind: "settle" });
    if (delivered > 0) {
      // Tiền chuyến tối thiểu 12k/đơn, bão cộng thêm 50%.
      expect(settle.ok && settle.data.pay).toBeGreaterThanOrEqual(18_000 * delivered);
    }
    // Khách ký nhận tận tay thì gửi kèm phụ phí bão.
    expect(surchargeLines).toBe(handed);
    await emit(s, "work:stop", {});
    s.disconnect();
  });
});
