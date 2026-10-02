import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import { marketMovesSince } from "./away.js";

describe("trong lúc bạn vắng (THEGIOI §4)", () => {
  const items = ["banh_mi_phoi", "pate", "thit_nguoi", "dua_leo", "hanh"];

  it("cùng ngày thì giá không đổi", () => {
    expect(marketMovesSince(content, items, 5, 5)).toEqual([]);
  });

  it("qua mấy ngày: liệt kê món đổi giá nhiều nhất trước, tối đa 3, trong biên dao động", () => {
    const moves = marketMovesSince(content, items, 1, 4);
    expect(moves.length).toBeLessThanOrEqual(3);
    const swing = content.economy.marketPriceSwing;
    for (const m of moves) {
      expect(Math.abs(m.change)).toBeGreaterThanOrEqual(0.03);
      expect(Math.abs(m.change)).toBeLessThan((2 * swing) / (1 - swing) + 0.05);
    }
    const abs = moves.map((m) => Math.abs(m.change));
    expect(abs).toEqual([...abs].sort((a, b) => b - a));
  });
});
