import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import { baseSpec } from "./recipe.js";
import { shiftAt, staffShift, staffWage } from "./staff.js";

const banhMi = content.product("banh_mi").recipe;
const menu = banhMi.variants.map((v) => ({ variantId: v.id, price: v.refPrice }));
const full = new Map<string, number>(
  [
    "banh_mi_phoi",
    "pate",
    "thit_nguoi",
    "xiu_mai",
    "trung",
    "dua_leo",
    "do_chua",
    "hanh",
    "ngo",
    "ot",
    "sot",
    "giay_goi",
  ].map((id) => [id, 200]),
);
const person = (id: string) => {
  const p = content.data.staff.people.find((x) => x.id === id);
  if (!p) throw new Error(id);
  return p;
};
const run = (over: Partial<Parameters<typeof staffShift>[0]> = {}) =>
  staffShift({
    content,
    staff: person("thu"),
    productId: "banh_mi",
    lotId: "dau_hem",
    menu,
    stock: full,
    reputation: 0.6,
    priceRatio: 1,
    day: 3,
    fromMinute: 6 * 60,
    toMinute: 11 * 60,
    demandCarry: 0,
    seed: "biz",
    ...over,
  });

describe("nhân viên bán thay (KIENTRUC §2)", () => {
  it("bán được trong ca, trả lương theo giờ, dùng nguyên liệu trong kho", () => {
    const r = run();
    expect(r.served).toBeGreaterThan(0);
    expect(r.revenue).toBeGreaterThan(0);
    expect(r.wages).toBe(staffWage(person("thu"), 300));
    expect(r.wages).toBe(75_000);
    expect(r.used.get("banh_mi_phoi")).toBeGreaterThan(0);
  });

  it("hết hàng thì dọn quầy về sớm — doanh thu có trần theo kho, lương chỉ tới lúc về", () => {
    const few = new Map(full);
    few.set("banh_mi_phoi", 3);
    const r = run({ stock: few });
    expect(r.served + r.wrong).toBeLessThanOrEqual(3);
    expect(r.soldOut).toBe(true);
    expect(r.minutes).toBeLessThan(300);
    expect(r.wages).toBe(staffWage(person("thu"), r.minutes));
  });

  it("người kỹ (Dì Sáu) ít sai hơn người lanh tay (Khoa)", () => {
    const di = run({ staff: person("di_sau"), toMinute: 22 * 60 });
    const khoa = run({ staff: person("khoa_phu"), toMinute: 22 * 60 });
    const rate = (r: { served: number; wrong: number }) =>
      r.wrong / Math.max(1, r.served + r.wrong);
    expect(rate(di)).toBeLessThan(rate(khoa));
  });

  it("chạy từng nhịp 5 phút (bán trực tiếp) vẫn bán được — sức làm dồn qua nhịp", () => {
    let capacity: number | undefined;
    let carry = 0;
    let served = 0;
    for (let t = 7 * 60; t < 9 * 60; t += 5) {
      const r = run({ fromMinute: t, toMinute: t + 5, capacity, demandCarry: carry });
      capacity = r.capacity;
      carry = r.demandCarry;
      served += r.served + r.wrong;
    }
    const whole = run({ fromMinute: 7 * 60, toMinute: 9 * 60 });
    expect(served).toBeGreaterThan(0);
    expect(served).toBeGreaterThanOrEqual(Math.floor((whole.served + whole.wrong) * 0.6));
  });

  it("ca làm theo giờ", () => {
    expect(shiftAt(content, "sang", 7 * 60)).toBe(true);
    expect(shiftAt(content, "sang", 12 * 60)).toBe(false);
    expect(baseSpec(banhMi, "banh_mi_thit")).toBeTruthy();
  });
});
