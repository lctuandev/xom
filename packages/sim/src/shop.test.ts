import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import {
  landPrice,
  landRefund,
  needsFoodCert,
  nextShopStep,
  normalizeShopName,
  openDue,
  rentLateFee,
  rentOwed,
  rentPromiseOptions,
  rentShouldRemind,
  rentVerdict,
  shopEstimate,
  shopNameError,
} from "./shop.js";

describe("mở tiệm theo quy trình (UC-F12)", () => {
  it("dự toán: cọc 3 ngày thuê + dự phòng 2 ngày + lệ phí + tập huấn (quán ăn) + biển hiệu", () => {
    const e = shopEstimate(content, "nha_so_10", "banh_mi");
    expect(e.deposit).toBe(315_000);
    expect(e.reserve).toBe(210_000);
    expect(e.training).toBe(150_000);
    expect(e.total).toBe(315_000 + 210_000 + 100_000 + 150_000 + 200_000);
    // Sạp phụ kiện không bán đồ ăn: không cần ATTP.
    expect(shopEstimate(content, "nha_so_10", "phu_kien").training).toBe(0);
    expect(needsFoodCert(content, "tra_sua")).toBe(true);
    expect(needsFoodCert(content, "sua_xe")).toBe(false);
  });

  it("tên quán: độ dài, ký tự cho phép, chuẩn hoá khoảng trắng", () => {
    expect(shopNameError(content, "Bánh Mì Cô Ba")).toBeNull();
    expect(shopNameError(content, "Ab")).toMatch(/ít nhất/);
    expect(shopNameError(content, "x".repeat(30))).toMatch(/tối đa/);
    expect(shopNameError(content, "Quán <script>")).toMatch(/chỉ gồm/);
    expect(shopNameError(content, "123 456")).toMatch(/phải có chữ/);
    expect(normalizeShopName("  Trà   Sữa  Bé Su ")).toBe("Trà Sữa Bé Su");
  });

  it("bước tiếp theo đi đúng thứ tự: thuê nhà → hộ kinh doanh → ATTP → biển hiệu", () => {
    const base = {
      leased: false,
      licensed: false,
      needCert: true,
      certified: false,
      signed: false,
    };
    expect(nextShopStep(base)).toBe("lease");
    expect(nextShopStep({ ...base, leased: true })).toBe("license");
    expect(nextShopStep({ ...base, leased: true, licensed: true })).toBe("cert");
    expect(nextShopStep({ ...base, leased: true, licensed: true, needCert: false })).toBe("sign");
    expect(
      nextShopStep({ ...base, leased: true, licensed: true, certified: true, signed: true }),
    ).toBe("ready");
  });
});

describe("đòi tiền nhà (UC-F13)", () => {
  const rent = content.lot("nha_so_10").rentPerDay;
  const r = content.data.shopSetup.rent;
  const base = {
    day: 5,
    minute: r.dueMinute,
    rentPerDay: rent,
    paidDay: 4,
    promiseDay: null,
    strikes: 0,
    depositLeft: rent * 3,
    online: true,
  };

  it("nợ tính từ sau ngày đã trả tới hôm nay; phí trễ làm tròn lên nghìn", () => {
    expect(rentOwed(base)).toEqual({ days: 1, amount: rent });
    expect(rentOwed({ ...base, paidDay: 5 }).amount).toBe(0);
    expect(rentOwed({ ...base, paidDay: 2 }).days).toBe(3);
    expect(rentLateFee(content, 105_000)).toBe(11_000);
    expect(rentLateFee(content, 0)).toBe(0);
    // Hẹn càng xa phí trễ càng cao; không nợ thì không có gì để hẹn.
    expect(rentPromiseOptions(content, 5, 105_000)).toEqual([
      { day: 6, fee: 11_000 },
      { day: 7, fee: 22_000 },
    ]);
    expect(rentPromiseOptions(content, 5, 0)).toEqual([]);
  });

  it("chủ nhà tới nhắc từ giờ nhắc khi còn nợ; đang trong hẹn hoặc chủ tiệm vắng thì không", () => {
    const at = { ...base, minute: r.remindMinute };
    expect(rentShouldRemind(content, at)).toBe(true);
    expect(rentShouldRemind(content, { ...at, minute: r.remindMinute - 1 })).toBe(false);
    expect(rentShouldRemind(content, { ...at, paidDay: 5 })).toBe(false);
    expect(rentShouldRemind(content, { ...at, promiseDay: 6 })).toBe(false);
    // Tới ngày hẹn thì nhắc lại.
    expect(rentShouldRemind(content, { ...at, promiseDay: 5 })).toBe(true);
    expect(rentShouldRemind(content, { ...at, online: false })).toBe(false);
  });

  it("quá hạn: trừ cọc + phí trễ; trễ lần thứ 3 hoặc cọc không đủ thì dẹp tiệm", () => {
    expect(rentVerdict(content, { ...base, minute: r.dueMinute - 1 })).toEqual({ kind: "none" });
    expect(rentVerdict(content, base)).toEqual({ kind: "collect", owed: rent, fee: 11_000 });
    expect(rentVerdict(content, { ...base, strikes: r.evictAfterStrikes - 1 })).toEqual({
      kind: "evict",
      reason: "strikes",
    });
    expect(rentVerdict(content, { ...base, depositLeft: rent })).toEqual({
      kind: "evict",
      reason: "deposit",
    });
  });

  it("hẹn theo ngày: cả ngày hẹn vẫn trả được (không có giờ chót); qua ngày hẹn là thất hẹn, tính trễ dù chủ tiệm vắng", () => {
    expect(rentVerdict(content, { ...base, promiseDay: 6 }).kind).toBe("none");
    expect(rentVerdict(content, { ...base, promiseDay: 5, minute: 21 * 60 + 59 }).kind).toBe(
      "none",
    );
    expect(
      rentVerdict(content, { ...base, day: 6, minute: 6 * 60, promiseDay: 5, online: false }).kind,
    ).toBe("collect");
  });

  it("chủ tiệm vắng, chưa hẹn: nợ cộng dồn, không tính trễ — chỉ dẹp khi nợ vượt cọc", () => {
    expect(rentVerdict(content, { ...base, online: false })).toEqual({ kind: "wait" });
    expect(rentVerdict(content, { ...base, online: false, paidDay: 0 })).toEqual({
      kind: "evict",
      reason: "deposit",
    });
  });
});

describe("ô đất mua đứt (docs/BANDO.md bước D)", () => {
  const lotId = "khu_dong__sap_mai_a__1_0";
  it("chủ ô không trả tiền thuê, trả phí ngày + thuế đất", () => {
    const rented = openDue(content, lotId);
    const owned = openDue(content, lotId, true);
    expect(rented.rent).toBe(content.lot(lotId).rentPerDay);
    expect(owned.rent).toBe(0);
    expect(owned.fee).toBe(content.economy.fees.daily.stall + content.economy.land.taxPerDay);
    expect(owned.total).toBeLessThan(rented.total);
  });
  it("giá = tiền thuê × số ngày; bán lại theo tỉ lệ, làm tròn nghìn", () => {
    const price = landPrice(content, lotId);
    expect(price).toBe(content.lot(lotId).rentPerDay * content.economy.land.priceDays);
    expect(landRefund(content, price)).toBe(Math.round((price * 0.7) / 1000) * 1000);
  });
});
