import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import { composeMap, nextChunkSlot, type OpenedChunk } from "./chunks.js";
import { Grid } from "./grid.js";

const base = content.data.map;
const tpl = content.data.chunks;
const chunk = (id: string) => {
  const t = tpl.find((x) => x.id === id);
  if (!t) throw new Error(id);
  return t;
};

describe("bản đồ mở: ghép khu (docs/BANDO.md §3)", () => {
  it("chưa mở khu nào thì giữ nguyên bản đồ gốc", () => {
    expect(composeMap(base, tpl, [])).toBe(base);
  });

  it("khu kế tiếp nối tiếp theo phía", () => {
    const opened: OpenedChunk[] = [];
    opened.push(nextChunkSlot(chunk("khu_dong"), opened));
    opened.push(nextChunkSlot(chunk("khu_dong"), opened));
    opened.push(nextChunkSlot(chunk("khu_bac"), opened));
    expect(opened.map((o) => [o.gx, o.gz])).toEqual([
      [1, 0],
      [2, 0],
      [0, -1],
    ]);
  });

  it("ghép đông + tây + bắc: kích thước, gốc toạ độ, toạ độ cũ giữ nguyên", () => {
    const opened: OpenedChunk[] = [];
    for (const id of ["khu_dong", "khu_tay", "khu_bac", "khu_nam"])
      opened.push(nextChunkSlot(chunk(id), opened));
    const m = composeMap(base, tpl, opened);
    const w = (id: string) => chunk(id).rows[0]?.length ?? 0;
    const h = (id: string) => chunk(id).rows.length;
    expect(m.rows[0]?.length).toBe((base.rows[0]?.length ?? 0) + w("khu_dong") + w("khu_tay"));
    expect(m.rows.length).toBe(base.rows.length + h("khu_bac") + h("khu_nam"));
    expect(m.rows.every((r) => r.length === m.rows[0]?.length)).toBe(true);
    // Một điểm của bản đồ gốc vẫn cùng loại ô ở cùng toạ độ thế giới.
    const before = new Grid(base);
    const after = new Grid(m);
    for (const p of [
      { x: 0, z: 4 },
      { x: -8, z: -8 },
      { x: -28, z: -12 },
    ])
      expect(after.canStand(p)).toBe(before.canStand(p));
    // Góc chéo là đất trống.
    expect(m.rows[0]?.[0]).toBe(".");
  });

  it("đi bộ từ phố gốc sang khu đông theo đường nối", () => {
    const m = composeMap(base, tpl, [nextChunkSlot(chunk("khu_dong"), [])]);
    const g = new Grid(m);
    const baseRight = base.origin.x + ((base.rows[0]?.length ?? 0) - 1) * base.tile;
    const far = { x: baseRight + 8 * base.tile, z: 0 };
    expect(g.canStand(far)).toBe(true);
    const path = g.path({ x: 0, z: 4 }, far);
    expect(path.length).toBeGreaterThan(0);
    expect(path.at(-1)?.x).toBeCloseTo(far.x, 0);
  });
});
