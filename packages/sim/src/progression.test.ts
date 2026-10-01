import { describe, expect, it } from "vitest";
import { fameOf, levelOf, XP, xpForLevel } from "./progression.js";

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
