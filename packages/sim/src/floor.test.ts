import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import {
  admit,
  apologize,
  callBack,
  calm,
  FLOOR,
  type Floor,
  type FloorConfig,
  type FloorLayout,
  floorTick,
  newFloor,
  paid,
  payingOf,
  plated,
  queueOf,
  type Role,
  tableStates,
  waiterCanReach,
} from "./floor.js";
import { seededRandom } from "./time.js";

const layout: FloorLayout = {
  door: { x: -6, z: -2 },
  queue: { x: -0.2, z: -0.9 },
  queueStep: { x: -0.7, z: -0.2 },
  pass: { x: -2.3, z: -0.6 },
  cashier: { x: 2.2, z: -0.9 },
  cashierStep: { x: 0.6, z: -0.4 },
  tables: [
    { x: -2.8, z: -3.6 },
    { x: 0, z: -3.6 },
    { x: 2.8, z: -3.6 },
  ],
};
// Không có khách tự tới: test tự cho khách vào bằng admit().
const quiet = { ...content.data.restaurant, customersPerHour: { 0: 0 } };

function setup(role: Role) {
  let n = 0;
  const cfg: FloorConfig = {
    r: quiet,
    scale: 1,
    layout,
    role,
    names: ["Chú Tư"],
    newId: () => `id${n++}`,
  };
  const f = newFloor(layout, 0);
  const clock = { now: 0, minute: 8 * 60 + 30, rand: seededRandom("floor") };
  /** Chạy thời gian thật `ms`, mỗi giây là một phút game. */
  const run = (ms: number, rand?: () => number) => {
    const events = [];
    for (let t = 0; t < ms; t += 500) {
      clock.now += 500;
      if (clock.now % 1000 === 0) clock.minute++;
      events.push(...floorTick(f, cfg, { ...clock, rand: rand ?? clock.rand }, 0));
    }
    return events;
  };
  return { cfg, f, clock, run };
}

const only = (f: Floor) => {
  const d = f.diners[0];
  if (!d) throw new Error("không có khách");
  return d;
};

describe("vòng đời khách trong quán (UC-W8)", () => {
  it("vào cửa → xếp hàng → Cô Tư múc → ngồi → bé Út bưng → ăn → trả tiền → ra về có đánh giá", () => {
    const { cfg, f, clock, run } = setup("thu_ngan");
    admit(f, cfg, clock);
    const d = only(f);
    expect(d.stage).toBe("entering");
    expect(tableStates(f, cfg)[d.table - 1]).toBe("waiting"); // bàn đã giữ
    run(FLOOR.enterMs);
    expect(d.stage).toBe("queue");
    expect(d.say?.text).toBe(d.order.text); // gọi món
    run(FLOOR.npcPlateMs + 500);
    expect(d.stage).toBe("to_table");
    expect(f.pass).toHaveLength(1);
    run(FLOOR.toTableMs + FLOOR.npcCarryMs + 1000);
    expect(d.stage).toBe("eating");
    run(FLOOR.eatMinutes * 1000 + 500, () => 0.99); // không quỵt
    expect(tableStates(f, cfg)[d.table - 1]).toBe("dirty");
    run(FLOOR.toCashierMs);
    expect(payingOf(f)[0]).toBe(d);
    // Người chơi là thu ngân: không ai tính tiền thay.
    run(3000);
    expect(d.stage).toBe("paying");
    const review = paid(f, cfg, d, clock.now, () => 0.9);
    expect(review).toMatchObject({ kind: "review", stars: 5 });
    expect(d.stage).toBe("leaving");
    run(FLOOR.leaveMs + FLOOR.goneMs + 500);
    expect(f.diners).toHaveLength(0);
    expect(f.stats).toMatchObject({ reviews: 1, stars: 5 });
  });

  it("đứng quầy chậm: khách than, xin lỗi thì chờ thêm; bỏ mặc thì bỏ về 1 sao", () => {
    const { cfg, f, clock, run } = setup("dung_quay");
    admit(f, cfg, clock);
    admit(f, cfg, clock);
    run(FLOOR.enterMs + FLOOR.queuePatienceMs * FLOOR.complainAt + 500);
    const [a, b] = queueOf(f);
    if (!a || !b) throw new Error("thiếu khách");
    expect(a.complained && a.say?.tone).toBe("bad");
    expect(apologize(a, clock.now)).toBe(true);
    expect(apologize(a, clock.now)).toBe(false); // xin lỗi một lần thôi
    const events = run(FLOOR.queuePatienceMs * 0.5);
    // b không được xin lỗi → bỏ về; a còn chờ.
    expect(events).toContainEqual({ kind: "walked", dinerId: b.id });
    expect(b.review?.stars).toBe(1);
    expect(a.stage).toBe("queue");
    plated(f, a, clock.now, cfg);
    expect(a.stage).toBe("to_table");
  });

  it("quỵt tiền: gọi lại kịp thì khách quay lại trả; không kịp thì quán mất tiền", () => {
    const { cfg, f, clock, run } = setup("bung_be");
    for (const d of [admit(f, cfg, clock), admit(f, cfg, clock)]) {
      if (!d) throw new Error();
      d.stage = "eating";
      d.eatUntil = clock.minute;
    }
    run(500, () => 0.01); // cả hai tính đi luôn
    const [x, y] = f.diners;
    if (!x || !y) throw new Error();
    expect(x.incident).toBe("dash");
    expect(callBack(cfg, x, clock.now)).toBe(true);
    expect(x.stage).toBe("to_cashier");
    const events = run(FLOOR.dashMs + 500, () => 0.99);
    expect(events).toContainEqual({ kind: "dashed", dinerId: y.id, amount: y.order.total });
    expect(callBack(cfg, y, clock.now)).toBe(false);
    expect(f.stats.lostMoney).toBe(y.order.total);
  });

  it("gây lộn: không can thì hai bàn bỏ về; can kịp thì yên", () => {
    const { cfg, f, clock, run } = setup("bung_be");
    const a = admit(f, cfg, clock);
    const b = admit(f, cfg, clock);
    if (!a || !b) throw new Error();
    for (const d of [a, b]) {
      d.stage = "eating";
      d.eatUntil = clock.minute + 999;
    }
    f.lastIncidentHour = -1;
    clock.minute = 10 * 60; // sang giờ mới
    run(500, () => 0.05);
    const loud = [a, b].find((d) => d.incident === "argue");
    if (!loud) throw new Error("không có ai gây lộn");
    expect(calm(loud, clock.now)).toBe(true);
    expect(run(FLOOR.argueMs, () => 0.99).filter((e) => e.kind === "walked")).toHaveLength(0);

    loud.incident = "argue";
    loud.incidentAt = clock.now;
    const events = run(FLOOR.argueMs + 500, () => 0.99);
    expect(events.filter((e) => e.kind === "walked")).toHaveLength(2);
  });

  it("hết bàn sạch thì khách không vào; bưng bê phải đi bộ tới bàn", () => {
    const { cfg, f, clock } = setup("bung_be");
    for (let i = 0; i < 3; i++) expect(admit(f, cfg, clock)).not.toBeNull();
    expect(admit(f, cfg, clock)).toBeNull();
    const far = layout.tables[2];
    if (!far) throw new Error();
    expect(waiterCanReach(f, cfg, far, 100)).toBe(false);
    expect(waiterCanReach(f, cfg, far, 5000)).toBe(true);
    // Đồng hồ tăng tốc gấp 4: đi bộ cũng nhanh gấp 4.
    expect(waiterCanReach(f, { ...cfg, scale: 0.25 }, far, 1300)).toBe(true);
  });
});
