import { describe, expect, it } from "vitest";
import { content, loadContent } from "./index.js";

describe("content", () => {
  it("dữ liệu hiện tại hợp lệ", () => {
    expect(content.data.products.length).toBeGreaterThan(0);
    expect(content.equipment("xe_banh_mi").products).toContain("banh_mi");
  });

  it("báo lỗi món quán cơm dùng thứ không có trong khay", () => {
    const broken = structuredClone(content.data) as typeof content.data;
    broken.restaurant.dishes[0]?.items.push("pho");
    expect(() => loadContent(broken)).toThrow(/pho/);
  });

  it("quầy dạng lưới phải phủ mọi bước công thức, đúng loại khu", () => {
    const broken = structuredClone(content.data) as typeof content.data;
    const tea = broken.products.find((p) => p.id === "tra_sua");
    tea?.counter?.zones.pop();
    expect(() => loadContent(broken)).toThrow(/bước lac chưa có chỗ/);
    const wrong = structuredClone(content.data) as typeof content.data;
    const z = wrong.products.find((p) => p.id === "tra_sua")?.counter?.zones[0];
    if (z) z.zone = "grid";
    expect(() => loadContent(wrong)).toThrow(/không hợp bước ly/);
  });

  it("báo lỗi tham chiếu sai", () => {
    const broken = structuredClone(content.data) as typeof content.data;
    broken.equipment[0]?.products.push("khong_ton_tai");
    expect(() => loadContent(broken)).toThrow(/khong_ton_tai/);
  });
});
