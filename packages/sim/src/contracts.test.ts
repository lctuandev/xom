import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import {
  contractIngredients,
  contractOffers,
  contractPay,
  contractText,
  trustAfter,
  trustLevel,
} from "./contracts.js";

const tpl = (id: string) => {
  const t = content.data.contracts.templates.find((x) => x.id === id);
  if (!t) throw new Error(id);
  return t;
};

describe("bảng việc xóm (KIENTRUC §3)", () => {
  it("mỗi ngày đăng đủ số việc, khác nhau, cố định theo xóm + ngày", () => {
    const a = contractOffers(content, 3, "room-a");
    expect(a).toHaveLength(content.data.contracts.perDay);
    expect(new Set(a.map((o) => o.templateId)).size).toBe(a.length);
    expect(contractOffers(content, 3, "room-a")).toEqual(a);
    const days = [1, 2, 3, 4, 5, 6].map((d) => contractOffers(content, d, "room-a")[0]?.templateId);
    expect(new Set(days).size).toBeGreaterThan(1);
    for (const o of a) {
      const t = tpl(o.templateId);
      expect(o.qty).toBeGreaterThanOrEqual(t.qty[0]);
      expect(o.qty).toBeLessThanOrEqual(t.qty[1]);
    }
  });

  it("thưởng cao hơn bán lẻ (đặt số lượng + giao tận nơi), cọc ~20%, tiền chẵn nghìn", () => {
    const t = tpl("truong_banh_mi");
    const { reward, deposit } = contractPay(content, t, 6);
    expect(reward).toBe(120_000); // 6 × 16k × 1,25
    expect(deposit).toBe(24_000);
    expect(reward % 1000).toBe(0);
  });

  it("nguyên liệu = món chuẩn × số phần; câu ghi đủ số, món, chỗ, giờ", () => {
    const t = tpl("truong_banh_mi");
    expect(contractIngredients(content, t, 6).get("banh_mi_phoi")).toBe(6);
    expect(contractText(content, t, 6)).toBe(
      "Giao 6 bánh mì thịt cho đội bóng lớp 5 ở Cổng trường trước 11:00",
    );
  });

  it("tin cậy: giữ lời +, bỏ việc −, thối thiếu −; kẹp 0–100; mức thấp / khoá", () => {
    expect(trustAfter(content, 50, "done")).toBe(55);
    expect(trustAfter(content, 50, "fail")).toBe(35);
    expect(trustAfter(content, 50, "short")).toBe(48);
    expect(trustAfter(content, 98, "done")).toBe(100);
    expect(trustAfter(content, 5, "fail")).toBe(0);
    expect(trustLevel(content, 50)).toBe("ok");
    expect(trustLevel(content, 20)).toBe("low");
    expect(trustLevel(content, 10)).toBe("lock");
  });
});
