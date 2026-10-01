import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import {
  addSkill,
  fameOf,
  holdFactor,
  levelOf,
  maskText,
  patienceFactor,
  remembersOrders,
  reviewStars,
  reviewSummary,
  reviewTagOf,
  skillLevel,
  unlockLevel,
  XP,
  xpForLevel,
} from "./progression.js";

describe("tiến trình (DESIGN §4)", () => {
  it("cấp độ tăng chậm dần", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    const gaps = [2, 3, 4, 5, 6].map((l) => xpForLevel(l + 1) - xpForLevel(l));
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1] ?? 0);
  });

  it("KN trong cấp và KN cần lên cấp", () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, need: 100 });
    expect(levelOf(150)).toMatchObject({ level: 2, into: 50 });
    // Một phiên ~15 phút bán ~10 món là thấy thanh KN nhích rõ ở cấp đầu (luật 4.1).
    expect(10 * XP.serve).toBeGreaterThanOrEqual(levelOf(0).need);
  });

  it("danh tiếng cần cả số khách lẫn uy tín", () => {
    expect(fameOf(5, 1)).toBe("unknown");
    expect(fameOf(30, 0.3)).toBe("local");
    expect(fameOf(200, 0.5)).toBe("local");
    expect(fameOf(200, 0.7)).toBe("popular");
    expect(fameOf(800, 0.9)).toBe("famous");
  });
});

describe("kỹ năng & mở khoá (DESIGN §4, Luật 4.2)", () => {
  const tay = content.data.skills.find((s) => s.id === "tay_nhanh");
  it("làm thật mới lên bậc; có bậc tối đa", () => {
    if (!tay) throw new Error("thiếu kỹ năng");
    expect(skillLevel(tay, tay.per - 1)).toBe(0);
    expect(skillLevel(tay, tay.per)).toBe(1);
    let pts = {};
    for (let i = 0; i < 1000; i++) pts = addSkill(content, pts, "tay_nhanh");
    expect(skillLevel(tay, (pts as { tay_nhanh: number }).tay_nhanh)).toBe(tay.max);
  });
  it("tay nhanh giữ nút ngắn hơn; ăn nói khách kiên nhẫn hơn; nhớ món có gợi ý", () => {
    expect(holdFactor(content, {})).toBe(1);
    expect(holdFactor(content, { tay_nhanh: 1000 })).toBeLessThan(0.7);
    expect(patienceFactor(content, { an_noi: 1000 })).toBeGreaterThan(1.2);
    expect(remembersOrders(content, {})).toBe(false);
    expect(remembersOrders(content, { nho_mon: 10 })).toBe(true);
  });
  it("nhà mặt tiền mở ở cấp 3, khai trương ở cấp 2", () => {
    expect(unlockLevel(content, "lot_house")).toBe(3);
    expect(unlockLevel(content, "event_host")).toBe(2);
  });
});

describe("sổ đánh giá", () => {
  it("sao theo độ hài lòng", () => {
    expect(reviewStars(1)).toBe(5);
    expect(reviewStars(0.8)).toBe(4);
    expect(reviewStars(0.6)).toBe(3);
    expect(reviewStars(0.4)).toBe(2);
    expect(reviewStars(0)).toBe(1);
  });
  it("tình huống: lỗi nặng nhất trước", () => {
    expect(reviewTagOf({ served: false })).toBe("lost");
    expect(reviewTagOf({ served: true, correct: false, short: true, fast: true })).toBe("short");
    expect(reviewTagOf({ served: true, correct: false, fast: true })).toBe("wrong");
    expect(reviewTagOf({ served: true, correct: true, fast: true, priceRatio: 1.3 })).toBe(
      "pricey",
    );
    expect(reviewTagOf({ served: true, correct: true, fast: false })).toBe("slow");
    expect(reviewTagOf({ served: true, correct: true, fast: true, priceRatio: 0.8 })).toBe("cheap");
    expect(reviewTagOf({ served: true, correct: true, fast: true })).toBe("fast");
    expect(reviewTagOf({ served: true, correct: true, fast: true, vip: true })).toBe("vip_good");
  });
  it("che từ tục, không che chữ thường có chứa", () => {
    const banned = content.data.reviews.banned;
    expect(maskText("ngon vl luôn", banned)).toBe("ngon *** luôn");
    expect(maskText("xem vlog review", banned)).toBe("xem vlog review");
    expect(maskText("ĐM chờ lâu", banned)).toBe("*** chờ lâu");
  });
  it("điểm trung bình + phân bố", () => {
    expect(reviewSummary([5, 4, 4, 1])).toEqual({ avg: 3.5, count: 4, dist: [1, 0, 0, 2, 1] });
    expect(reviewSummary([])).toEqual({ avg: 0, count: 0, dist: [0, 0, 0, 0, 0] });
  });
  it("mỗi tình huống có câu", () => {
    for (const tag of [
      "fast",
      "ok",
      "slow",
      "wrong",
      "pricey",
      "cheap",
      "short",
      "lost",
      "vip_good",
      "vip_bad",
    ] as const)
      expect(content.data.reviews.lines[tag]?.length).toBeGreaterThan(1);
  });
});
