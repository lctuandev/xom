import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import { seededRandom } from "./time.js";
import {
  decoyCodes,
  deliveryOrder,
  deliveryPay,
  linesOf,
  plateOrder,
  restaurantArrivals,
  ringTotal,
  sameItems,
} from "./work.js";

const r = content.data.restaurant;
const d = content.data.delivery;

describe("quán cơm", () => {
  it("phiếu gọi cơm khớp món + yêu cầu; tổng tiền = giá bấm đúng trên máy", () => {
    for (let i = 0; i < 200; i++) {
      const o = plateOrder(r, seededRandom("p", i));
      if (o.modIds.includes("them_com")) expect(o.items.filter((x) => x === "com")).toHaveLength(2);
      if (o.modIds.includes("khong_dua")) expect(o.items).not.toContain("dua");
      expect(ringTotal(r, linesOf(o))).toBe(o.total);
    }
  });
  it("dĩa đúng không kể thứ tự; thiếu/thừa là sai", () => {
    expect(sameItems(["com", "suon", "com"], ["com", "com", "suon"])).toBe(true);
    expect(sameItems(["com", "suon"], ["com", "suon", "dua"])).toBe(false);
    expect(sameItems(["com", "com"], ["com", "suon"])).toBe(false);
  });
  it("bấm món không có trên máy thì lỗi", () => {
    expect(() => ringTotal(r, { pho: 1 })).toThrow();
  });
  it("giờ trưa đông khách hơn giờ chiều", () => {
    const hour = (h: number) => {
      let total = 0;
      let carry = 0;
      for (let m = h * 60; m < (h + 1) * 60; m += 5) {
        const x = restaurantArrivals(r, m, 5, carry);
        total += x.arrivals;
        carry = x.carry;
      }
      return total;
    };
    expect(hour(11)).toBeGreaterThan(hour(15));
  });
});

describe("giao hàng", () => {
  it("đơn có mã, địa chỉ có thật, COD là số chẵn nghìn", () => {
    for (let i = 0; i < 100; i++) {
      const o = deliveryOrder(d, seededRandom("d", i));
      expect(o.code).toMatch(/^XM-\d{4}$/);
      expect(d.addresses.some((a) => a.id === o.addressId)).toBe(true);
      expect(o.cod % 1000).toBe(0);
    }
  });
  it("mã giả trên kệ khác mã thật, không trùng nhau", () => {
    const codes = decoyCodes("XM-4821", 5, seededRandom("k"));
    expect(new Set(codes).size).toBe(5);
    expect(codes).not.toContain("XM-4821");
  });
  it("đi xa thì tiền chuyến cao hơn", () => {
    expect(deliveryPay(12_000, 40)).toBeGreaterThan(deliveryPay(12_000, 10));
  });
});
