import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import {
  atmAmountError,
  attractiveness,
  bankInterest,
  choosePayment,
  customerArrivals,
  menuPriceRatio,
  nextReputation,
  pinError,
  priceScore,
  repairCost,
  type ShopState,
  spoilage,
  takeFifo,
  wearAfter,
  wearDemand,
  wearState,
} from "./economy.js";
import { formatClock, valueAt } from "./time.js";

const banhMi = content.product("banh_mi");

function shop(over: Partial<ShopState> = {}): ShopState {
  return {
    id: "a",
    productId: "banh_mi",
    lotId: "cong_truong",
    priceRatio: 1,
    reputation: 0.5,
    demandCarry: 0,
    ...over,
  };
}

/** Cộng dồn khách tới trong giờ 7:00–8:00. */
function hour(shops: ShopState[]) {
  const totals = new Map<string, number>();
  let state = shops;
  for (let m = 7 * 60; m < 8 * 60; m += 5) {
    const res = customerArrivals({ content, shops: state, day: 1, minuteOfDay: m, minutes: 5 });
    state = state.map((s) => {
      const r = res.find((x) => x.id === s.id);
      if (!r) return s;
      totals.set(s.id, (totals.get(s.id) ?? 0) + r.arrivals);
      return { ...s, demandCarry: r.demandCarry };
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
  it("đắt hơn thì kém hấp dẫn và khách kém hài lòng", () => {
    expect(attractiveness(1.3, banhMi, 0.5)).toBeLessThan(attractiveness(1, banhMi, 0.5));
    expect(priceScore(1)).toBe(1);
    expect(priceScore(2)).toBeLessThan(0.5);
  });
  it("tỉ lệ giá thực đơn là trung bình các món", () => {
    const r = menuPriceRatio(banhMi, [
      { variantId: "banh_mi_thit", price: 16_000 },
      { variantId: "banh_mi_trung", price: 21_000 },
    ]);
    expect(r).toBeCloseTo(1.25, 2);
  });
});

describe("khách tới", () => {
  it("cổng trường giờ sáng có khách", () => {
    expect(hour([shop()]).get("a") ?? 0).toBeGreaterThan(5);
  });
  it("đối thủ rẻ hơn ở gần hút nhiều khách hơn", () => {
    const t = hour([shop({ id: "dat", priceRatio: 1.3 }), shop({ id: "re", priceRatio: 0.85 })]);
    expect(t.get("re") ?? 0).toBeGreaterThan(t.get("dat") ?? 0);
  });
  it("có đối thủ cùng loại thì ít khách hơn; khác loại thì không ảnh hưởng", () => {
    const alone = hour([shop()]).get("a") ?? 0;
    expect(hour([shop(), shop({ id: "b" })]).get("a") ?? 0).toBeLessThan(alone);
    expect(hour([shop(), shop({ id: "ts", productId: "tra_sua" })]).get("a")).toBe(alone);
  });
  it("rao hàng (boost) kéo thêm khách", () => {
    expect(hour([shop({ boost: 1.5 })]).get("a") ?? 0).toBeGreaterThan(
      hour([shop()]).get("a") ?? 0,
    );
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

describe("nguyên liệu trong kho", () => {
  it("hỏng theo hạn dùng từng loại", () => {
    const { kept, spoiled } = spoilage(
      content,
      [
        { itemId: "banh_mi_phoi", qty: 5, batchDay: 2 }, // 1 ngày → hỏng cuối ngày 2
        { itemId: "pate", qty: 5, batchDay: 2 }, // 3 ngày → còn
        { itemId: "sot", qty: 5, batchDay: 1 }, // không hỏng
      ],
      2,
    );
    expect(spoiled.map((b) => b.itemId)).toEqual(["banh_mi_phoi"]);
    expect(kept.map((b) => b.itemId)).toEqual(["pate", "sot"]);
  });
  it("xuất kho FIFO", () => {
    const { batches, taken } = takeFifo(
      [
        { itemId: "pate", qty: 2, batchDay: 3 },
        { itemId: "pate", qty: 4, batchDay: 1 },
      ],
      5,
    );
    expect(taken).toEqual([
      { itemId: "pate", qty: 4, batchDay: 1 },
      { itemId: "pate", qty: 1, batchDay: 3 },
    ]);
    expect(batches).toEqual([{ itemId: "pate", qty: 1, batchDay: 3 }]);
    expect(() => takeFifo(batches, 5)).toThrow();
  });
});

describe("ngân hàng (DESIGN §2, Luật 2.3)", () => {
  const bank = content.economy.bank;
  it("lãi rất nhỏ, có trần, không lẻ dưới 500đ; số dư thấp không có lãi", () => {
    expect(bankInterest(50_000, bank)).toBe(0);
    expect(bankInterest(400_000, bank)).toBe(500);
    expect(bankInterest(1_000_000, bank)).toBe(2_000);
    expect(bankInterest(100_000_000, bank)).toBe(bank.interestCap);
    // Gửi 1 triệu cả tháng chưa bằng một buổi làm thuê (≈80k): không sống bằng lãi được.
    expect(bankInterest(1_000_000, bank) * 30).toBeLessThan(80_000);
  });

  it("ATM chỉ nhận bội số mệnh giá", () => {
    expect(atmAmountError(50_000, 10_000)).toBeNull();
    expect(atmAmountError(15_000, 10_000)).toMatch(/bội số 10\.000đ/);
    expect(atmAmountError(0, 10_000)).not.toBeNull();
  });
});

describe("hao mòn xe/quầy (Luật 2.2)", () => {
  const m = content.economy.maintenance;
  it("bán nhiều thì mòn; ọp ẹp thì khách bớt ghé; mòn hết là hư", () => {
    expect(wearAfter(0, 10, m)).toBeCloseTo(0.06);
    expect(wearAfter(0.99, 10, m)).toBe(1);
    expect(wearState(0.2, m)).toBe("ok");
    expect(wearState(m.slowAt, m)).toBe("worn");
    expect(wearState(1, m)).toBe("broken");
    expect(wearDemand(0.2, m)).toBe(1);
    expect(wearDemand(0.8, m)).toBeLessThan(1);
  });
  it("tiền sửa theo độ mòn và giá xe, tròn nghìn", () => {
    expect(repairCost(1_200_000, 0.5, m)).toBe(72_000);
    expect(repairCost(1_200_000, 0, m)).toBe(0);
    expect(repairCost(1_300_000, 1, m) % 1000).toBe(0);
  });
});

describe("choosePayment — trả bằng gì", () => {
  const base = { cashFirstBelow: 200_000, cash: 100_000, bank: 2_000_000 };
  it("tự chọn: lặt vặt trả tiền mặt, khoản lớn chuyển khoản", () => {
    expect(choosePayment({ ...base, amount: 20_000, method: "auto" })).toBe("cash");
    expect(choosePayment({ ...base, amount: 1_200_000, method: "auto" })).toBe("bank");
  });
  it("tự chọn: ví ưu tiên thiếu thì dùng ví kia", () => {
    expect(choosePayment({ ...base, amount: 150_000, method: "auto" })).toBe("bank");
    expect(choosePayment({ ...base, bank: 0, amount: 90_000, method: "auto" })).toBe("cash");
    expect(choosePayment({ ...base, amount: 9_000_000, method: "auto" })).toEqual({
      error: "Không đủ tiền",
    });
  });
  it("chọn tay thì đúng ví đó; thiếu thì báo cách gỡ", () => {
    expect(choosePayment({ ...base, amount: 20_000, method: "bank" })).toBe("bank");
    expect(choosePayment({ ...base, amount: 150_000, method: "cash" })).toEqual({
      error: "Không đủ tiền mặt — chọn chuyển khoản hoặc ra cây ATM rút",
    });
    expect(choosePayment({ ...base, amount: 3_000_000, method: "bank" })).toEqual({
      error: "Tài khoản không đủ số dư",
    });
  });
  it("sạp chỉ nhận tiền mặt", () => {
    const stall = { ...base, cashOnly: true };
    expect(choosePayment({ ...stall, amount: 20_000, method: "bank" })).toEqual({
      error: "Sạp này chỉ nhận tiền mặt thôi con",
    });
    expect(choosePayment({ ...stall, cash: 0, amount: 20_000, method: "auto" })).toEqual({
      error: "Sạp chỉ nhận tiền mặt — ra cây ATM rút đã",
    });
  });
});

describe("PIN ATM", () => {
  it("đúng 6 số, không trùng hết, không dãy liên tiếp", () => {
    expect(pinError("12345")).toMatch(/6 chữ số/);
    expect(pinError("12a456")).toMatch(/6 chữ số/);
    expect(pinError("111111")).toMatch(/giống nhau/);
    expect(pinError("123456")).toMatch(/liên tiếp/);
    expect(pinError("654321")).toMatch(/liên tiếp/);
    expect(pinError("270915")).toBeNull();
  });
});
