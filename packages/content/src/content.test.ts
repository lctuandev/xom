import { describe, expect, it } from "vitest";
import { content, loadContent } from "./index.js";

describe("content", () => {
  it("dữ liệu hiện tại hợp lệ", () => {
    expect(content.data.products.length).toBeGreaterThan(0);
    expect(content.equipment("xe_banh_mi").products).toContain("banh_mi");
  });

  it("báo lỗi tham chiếu sai", () => {
    const broken = structuredClone(content.data);
    broken.equipment[0]?.products.push("khong_ton_tai");
    expect(() => loadContent(broken)).toThrow(/khong_ton_tai/);
  });
});
