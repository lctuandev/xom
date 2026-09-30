import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import {
  attractiveness,
  marketPrice,
  nextReputation,
  priceScore,
  type ShopState,
  simulateTick,
  spoilage,
  takeFifo,
} from "./economy.js";
import { formatClock, valueAt } from "./time.js";

const banhMi = content.product("banh_mi");

function shop(over: Partial<ShopState> = {}): ShopState {
  return {
    id: "a",
    productId: "banh_mi",
    lotId: "cong_truong",
    price: 15_000,
    reputation: 0.5,
    stock: 1000,
    capacityPerHour: 1000,
    demandCarry: 0,
    ...over,
  };
}

/** Chạy nhiều tick liên tiếp (7:00–8:00) và cộng dồn số bán. */
function runHour(shops: ShopState[]) {
  const totals = new Map<string, { sold: number; lostStock: number; lostCapacity: number }>();
  let state = shops;
  for (let m = 7 * 60; m < 8 * 60; m += 5) {
    const res = simulateTick({ content, shops: state, day: 1, minuteOfDay: m, minutes: 5 });
    state = state.map((s) => {
      const r = res.find((x) => x.id === s.id);
      if (!r) return s;
      const t = totals.get(s.id) ?? { sold: 0, lostStock: 0, lostCapacity: 0 };
      totals.set(s.id, {
        sold: t.sold + r.sold,
        lostStock: t.lostStock + r.lostStock,
        lostCapacity: t.lostCapacity + r.lostCapacity,
      });
      return { ...s, stock: s.stock - r.sold, demandCarry: r.demandCarry };
    });
  }
  return totals;
}

describe("time", () => {
  it("nội suy theo giờ và giữ giá trị ở hai đầu", () => {
    const curve = { "6": 10, "8": 30 };
    expect(valueAt(curve, 5 * 60)).toBe(10);
    expect(valueAt(curve, 7 * 60)).toBe(20);
    expect(valueAt(curve, 23 * 60)).toBe(30);
  });

  it("định dạng giờ", () => {
    expect(formatClock(6 * 60 + 5)).toBe("06:05");
  });
});

describe("giá", () => {
  it("giá chợ tất định và nằm trong biên độ", () => {
    const a = marketPrice(banhMi, 3, 0.1);
    expect(marketPrice(banhMi, 3, 0.1)).toBe(a);
    expect(a).toBeGreaterThanOrEqual(banhMi.unitCost * 0.9 - 500);
    expect(a).toBeLessThanOrEqual(banhMi.unitCost * 1.1 + 500);
    expect(a % 500).toBe(0);
  });

  it("bán đắt hơn thì kém hấp dẫn và khách kém hài lòng", () => {
    expect(attractiveness(20_000, banhMi, 0.5)).toBeLessThan(attractiveness(15_000, banhMi, 0.5));
    expect(priceScore(15_000, 15_000)).toBe(1);
    expect(priceScore(30_000, 15_000)).toBeLessThan(0.5);
  });
});

describe("simulateTick", () => {
  it("cổng trường giờ sáng bán được bánh mì", () => {
    const sold = runHour([shop()]).get("a")?.sold ?? 0;
    expect(sold).toBeGreaterThan(5);
  });

  it("không bán quá tồn kho và ghi nhận khách hụt", () => {
    const t = runHour([shop({ stock: 3 })]).get("a");
    expect(t?.sold).toBe(3);
    expect(t?.lostStock).toBeGreaterThan(0);
  });

  it("không bán quá công suất", () => {
    const t = runHour([shop({ capacityPerHour: 12 })]).get("a");
    expect(t?.sold).toBeLessThanOrEqual(12);
    expect(t?.lostCapacity).toBeGreaterThan(0);
  });

  it("đối thủ rẻ hơn ở gần thì lấy nhiều khách hơn", () => {
    const t = runHour([shop({ id: "dat", price: 20_000 }), shop({ id: "re", price: 13_000 })]);
    expect(t.get("re")?.sold ?? 0).toBeGreaterThan(t.get("dat")?.sold ?? 0);
  });

  it("có đối thủ thì bán ít hơn khi độc quyền", () => {
    const alone = runHour([shop()]).get("a")?.sold ?? 0;
    const shared = runHour([shop(), shop({ id: "b" })]).get("a")?.sold ?? 0;
    expect(shared).toBeLessThan(alone);
  });

  it("shop khác danh mục không tranh khách", () => {
    const alone = runHour([shop()]).get("a")?.sold ?? 0;
    const withDrink = runHour([shop(), shop({ id: "ts", productId: "tra_sua", price: 25_000 })]);
    expect(withDrink.get("a")?.sold).toBe(alone);
  });
});

describe("reputation", () => {
  it("bám theo độ hài lòng và nằm trong [0,1]", () => {
    expect(nextReputation(0.5, 1, 20, 0.1)).toBeGreaterThan(0.5);
    expect(nextReputation(0.5, 0, 20, 0.1)).toBeLessThan(0.5);
    expect(nextReputation(0.5, 0.2, 0, 0.1)).toBe(0.5);
    expect(nextReputation(0.99, 1, 100, 1)).toBeLessThanOrEqual(1);
  });
});

describe("tồn kho", () => {
  it("đồ ăn hỏng cuối ngày, phụ kiện thì không", () => {
    const { kept, spoiled } = spoilage(
      content,
      [
        { productId: "banh_mi", qty: 5, batchDay: 2 },
        { productId: "phu_kien", qty: 5, batchDay: 1 },
      ],
      2,
    );
    expect(spoiled.map((b) => b.productId)).toEqual(["banh_mi"]);
    expect(kept.map((b) => b.productId)).toEqual(["phu_kien"]);
  });

  it("xuất kho FIFO", () => {
    const { batches, taken } = takeFifo(
      [
        { productId: "phu_kien", qty: 2, batchDay: 3 },
        { productId: "phu_kien", qty: 4, batchDay: 1 },
      ],
      5,
    );
    expect(taken).toEqual([
      { productId: "phu_kien", qty: 4, batchDay: 1 },
      { productId: "phu_kien", qty: 1, batchDay: 3 },
    ]);
    expect(batches).toEqual([{ productId: "phu_kien", qty: 1, batchDay: 3 }]);
    expect(() => takeFifo(batches, 5)).toThrow();
  });
});

describe("hài lòng khi hết hàng", () => {
  it("khách hụt kéo độ hài lòng xuống nhưng không về 0", () => {
    const [r] = simulateTick({
      content,
      shops: [shop({ stock: 1, demandCarry: 10 })],
      day: 1,
      minuteOfDay: 7 * 60,
      minutes: 5,
    });
    expect(r?.sold).toBe(1);
    expect(r?.satisfaction).toBeGreaterThan(0.1);
    expect(r?.satisfaction).toBeLessThan(0.5);
  });
});
