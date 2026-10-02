import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import {
  needsFoodCert,
  nextShopStep,
  normalizeShopName,
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
