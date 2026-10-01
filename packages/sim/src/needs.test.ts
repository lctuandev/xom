import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import { absMinute, eat, needsAlert, needsAt, needsHold } from "./needs.js";

describe("đói / khát", () => {
  const start = absMinute(1, 8 * 60);
  it("giảm dần theo giờ game", () => {
    const n = { food: 100, drink: 100, at: start };
    expect(needsAt(content, n, start + 60)).toEqual({ food: 90, drink: 86 });
    expect(needsAt(content, n, start + 12 * 60)).toEqual({ food: 0, drink: 0 });
  });
  it("ngủ qua đêm chỉ tính 4 giờ", () => {
    // 21:00 ngày 1 → 7:00 ngày 2: thức 1 + 1 giờ, ngủ tính 4 giờ = 6 giờ.
    const n = { food: 100, drink: 100, at: absMinute(1, 21 * 60) };
    expect(needsAt(content, n, absMinute(2, 7 * 60))).toEqual({ food: 40, drink: 16 });
  });
  it("ăn uống thì hồi, tối đa 100", () => {
    const n = { food: 50, drink: 50, at: start };
    expect(eat(content, n, start, { food: 70 })).toEqual({ food: 100, drink: 50, at: start });
  });
  it("đói thì tay chậm, không khoá gì", () => {
    expect(needsHold(content, { food: 80, drink: 80 })).toBe(1);
    expect(needsHold(content, { food: 20, drink: 80 })).toBe(content.data.needs.slowHold);
    expect(needsAlert(content, { food: 5, drink: 25 })).toEqual({ food: "empty", drink: "low" });
  });
  it("chưa có mốc thì coi như vừa ăn", () => {
    expect(needsAt(content, { food: 80, drink: 80, at: 0 }, start)).toEqual({
      food: 80,
      drink: 80,
    });
  });
});
