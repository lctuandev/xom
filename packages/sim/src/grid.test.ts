import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import { Grid } from "./grid.js";

const grid = new Grid(content.data.map);

describe("đi lại theo đường xá (UC-B6)", () => {
  it("vỉa hè, đường đi được; nhà thì không", () => {
    expect(grid.canStand({ x: 0, z: 4 })).toBe(true); // vỉa hè phố chính
    expect(grid.canStand({ x: -8, z: -8 })).toBe(false); // nhà phố
    expect(grid.canStand({ x: -28, z: -12 })).toBe(true); // đường dọc
  });

  it("chạm vào nhà thì đi tới vỉa hè trước nhà", () => {
    const p = grid.nearest({ x: -8, z: -9 });
    expect(grid.canStand(p)).toBe(true);
    expect(p.z).toBeGreaterThan(-8); // ra phía phố chính
  });

  it("từ phố chính ra phố sau phải vòng qua đường dọc hoặc hẻm, không xuyên nhà", () => {
    const path = grid.path({ x: -12, z: 4 }, { x: -12, z: -24 });
    expect(path.length).toBeGreaterThan(1);
    let prev = { x: -12, z: 4 };
    for (const p of path) {
      expect(grid.clear(prev, p)).toBe(true);
      prev = p;
    }
    expect(prev).toEqual({ x: -12, z: -24 });
    // Đi qua hẻm x = 0 hoặc đường dọc x = −28.
    expect(path.some((p) => Math.abs(p.x) < 2.5 || Math.abs(p.x + 28) < 2.5)).toBe(true);
  });

  it("đi thẳng được thì chỉ một điểm", () => {
    expect(grid.path({ x: -20, z: 4 }, { x: 20, z: 4 })).toEqual([{ x: 20, z: 4 }]);
  });
});
