import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { MeView, NotifyEvent, RideView, StoryEntryView } from "@xom/shared";
import { emit, join, next } from "./client.js";
import { startApp } from "./helpers.js";

// Xe ôm (docs/KIENTRUC.md §4, docs/USECASES.md UC-N1): thuê xe ở trạm → đứng đâu ngoài đường cũng chờ khách → trả giá → chọn đường → chạy thật tới
// nơi (server kiểm vị trí + thời gian) → thu tiền / thối → sao + boa, trừ xăng.

describe("Xe ôm (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  type Sock = Parameters<typeof emit>[0];
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const place = content.place(content.data.rides.stationPlaceId);
  const station = { x: place.position.x, z: place.position.z + 1.4 };
  const moveTo = async (socket: Sock, x: number, z: number) => {
    socket.emit("move", { x, z, yaw: 0, moving: false, inside: null });
    await wait(120);
  };
  const ride = async (socket: Sock, event: Parameters<typeof emit>[1], body: unknown = {}) => {
    const r = await emit<RideView>(socket, event, body);
    if (!r.ok) throw new Error(`${event}: ${r.message}`);
    return r.data;
  };
  const me = async (socket: Sock) => {
    const r = await emit<MeView>(socket, "biz:attend", { on: false });
    if (!r.ok) throw new Error(r.message);
    return r.data;
  };
  /** Chờ khách tới trạm (sự kiện "ride" ở bước offer). */
  const passenger = async (socket: Sock) => {
    const offered = next(socket, "ride", (r: RideView) => r.stage === "offer");
    await ride(socket, "ride:wait");
    return offered;
  };

  it("chưa thuê xe thì không chờ khách được; thuê xe phải ra trạm", async () => {
    const { socket } = await join(url);
    await moveTo(socket, station.x, station.z);
    const noBike = await emit(socket, "ride:wait", {});
    expect(noBike.ok).toBe(false);
    if (!noBike.ok) expect(noBike.message).toContain("Thuê xe");
    await moveTo(socket, 10, 0);
    const far = await emit(socket, "ride:rent", {});
    expect(far.ok).toBe(false);
    socket.disconnect();
  });

  it("thuê xe → khách hỏi giá → giá chuẩn → đường lớn → tới nơi → thu tiền, boa, trừ xăng, ghi Chuyện", async () => {
    const { socket } = await join(url);
    await emit(socket, "debug:clock", { minute: 13 * 60 });
    await emit(socket, "debug:weather", { kind: "sunny", minutes: 600 });
    await moveTo(socket, station.x, station.z);
    const start = await me(socket);
    const rented = await ride(socket, "ride:rent");
    expect(rented.bikeToday).toBe(true);
    const afterRent = await me(socket);
    expect(afterRent.money + afterRent.bank).toBe(
      start.money + start.bank - content.data.rides.bikeRentPerDay,
    );
    const again = await emit(socket, "ride:rent", {});
    expect(again.ok).toBe(false);

    const offer = await passenger(socket);
    expect(offer.passenger?.name).toBeTruthy();
    expect(offer.passenger?.line).toContain(offer.dest?.label ?? "?");
    expect(offer.fare).toBeGreaterThanOrEqual(content.data.rides.baseFare);

    const deal = await ride(socket, "ride:offer", { ratio: 1 });
    expect(deal.stage).toBe("route");
    expect(deal.price).toBe(offer.fare);
    expect(deal.routes?.road).toBeGreaterThan(0);
    const going = await ride(socket, "ride:go", { route: "road" });
    expect(going.stage).toBe("riding");
    expect(going.speed).toBeGreaterThan(0);

    // Tới nơi tức thì → server không tin (chạy nhanh hơn xe).
    const dest = going.dest;
    if (!dest) throw new Error("không có nơi tới");
    await moveTo(socket, dest.x, dest.z);
    const tooFast = await emit(socket, "ride:arrive", {});
    expect(tooFast.ok).toBe(false);
    if (!tooFast.ok) expect(tooFast.message).toContain("nhanh");

    // Chạy đủ thời gian rồi tới nơi.
    let arrived: RideView | null = null;
    for (let i = 0; i < 40 && !arrived; i++) {
      await wait(500);
      const r = await emit<RideView>(socket, "ride:arrive", {});
      if (r.ok) arrived = r.data;
    }
    if (!arrived) throw new Error("không tới nơi được");
    expect(arrived.stage).toBe("pay");
    expect(arrived.stars).toBeGreaterThanOrEqual(1);
    const pay = arrived.pay;
    const price = arrived.price ?? 0;
    const change = pay?.kind === "cash" && pay.bill !== price ? pay.bill - price : null;
    const before = await me(socket);
    const done = await ride(socket, "ride:pay", { change });
    expect(done.stage).toBe("idle");
    expect(done.today.rides).toBe(1);
    expect(done.rating.rides).toBe(1);
    const after = await me(socket);
    const fuel =
      after.money + after.bank - (before.money + before.bank) - price - (arrived.tip ?? 0);
    expect(fuel).toBeLessThan(0);
    expect(-fuel % 500).toBe(0);
    const story = await emit<StoryEntryView[]>(socket, "story:list", {});
    expect(
      story.ok &&
        story.data.some((s) =>
          s.text.startsWith(`Chạy cuốc xe ôm đầu tiên: chở ${offer.passenger?.name}`),
        ),
    ).toBe(true);
    socket.disconnect();
  });

  it("đã thuê xe thì đứng đâu cũng có khách vẫy: đón tại chỗ, báo bấm được, phải quay lại chỗ đón mới chạy", async () => {
    const { socket } = await join(url);
    await emit(socket, "debug:clock", { minute: 13 * 60 });
    await emit(socket, "debug:weather", { kind: "sunny", minutes: 600 });
    await moveTo(socket, station.x, station.z);
    await ride(socket, "ride:rent");
    // Chạy xe ra đường lớn giữa xóm, xa trạm.
    const spot = { x: 10, z: 0 };
    await moveTo(socket, spot.x, spot.z);
    const hail = next(socket, "notify", (n: NotifyEvent) => n.text.startsWith("🙋"));
    const offer = await passenger(socket);
    const n = await hail;
    expect(n.open).toBe("ride");
    expect(n.text).toContain(offer.passenger?.name ?? "?");
    expect(offer.passenger?.model).toBeTruthy();
    const dest = offer.dest;
    if (!dest) throw new Error("không có nơi tới");
    // Nơi tới tính từ chỗ đón, không phải từ trạm.
    expect(Math.hypot(dest.x - spot.x, dest.z - spot.z)).toBeGreaterThanOrEqual(
      content.data.rides.minMeters,
    );
    let deal = await ride(socket, "ride:offer", { ratio: 1 });
    for (let i = 0; i < 5 && deal.stage !== "route"; i++) {
      await ride(socket, "ride:quit");
      await passenger(socket);
      deal = await ride(socket, "ride:offer", { ratio: 1 });
    }
    expect(deal.stage).toBe("route");
    // Bỏ khách đứng đó mà chạy chỗ khác thì không xuất phát được.
    await moveTo(socket, station.x, station.z);
    const away = await emit(socket, "ride:go", { route: "road" });
    expect(away.ok).toBe(false);
    if (!away.ok) expect(away.message).toContain("chỗ khách");
    await moveTo(socket, spot.x, spot.z);
    const going = await ride(socket, "ride:go", { route: "road" });
    expect(going.stage).toBe("riding");
    socket.disconnect();
  });

  it("nói thách: khách không chịu thì đi bộ, mình chờ khách khác", async () => {
    const { socket } = await join(url);
    await emit(socket, "debug:clock", { minute: 13 * 60 });
    await emit(socket, "debug:weather", { kind: "sunny", minutes: 600 });
    await moveTo(socket, station.x, station.z);
    await ride(socket, "ride:rent");
    let refused: RideView | null = null;
    for (let i = 0; i < 6 && !refused; i++) {
      const offer = await passenger(socket);
      const r = await ride(socket, "ride:offer", { ratio: 1.6 });
      if (r.stage === "waiting") {
        refused = r;
        expect(r.comment).toContain(offer.passenger?.name ?? "?");
      } else await ride(socket, "ride:quit");
      await wait(300);
    }
    if (!refused) throw new Error("khách nào cũng chịu giá cắt cổ?");
    expect(refused.passenger).toBeUndefined();
    socket.disconnect();
  });
});
