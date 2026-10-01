import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import { storyText } from "./story.js";

describe("Chuyện của tôi (THEGIOI §1)", () => {
  it("điền đủ chỗ trống, thiếu biến thì để …", () => {
    expect(storyText("Mở quầy {product} ở {lot}", { product: "bánh mì", lot: "Đầu hẻm 12" })).toBe(
      "Mở quầy bánh mì ở Đầu hẻm 12",
    );
    expect(storyText("Góp {money} cho {project}", { money: "50.000đ" })).toBe("Góp 50.000đ cho …");
  });

  it("mốc trong content có id không trùng, câu không rỗng", () => {
    const ids = content.data.story.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of content.data.story) expect(b.text.length).toBeGreaterThan(5);
    expect(ids).toContain("join");
  });
});
