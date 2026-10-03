import type { MapDef } from "./grid.js";

// Bản đồ mở (docs/BANDO.md §3): lưới của một xóm = bản đồ gốc + các khu đã mở ghép bốn phía. Khu đông/tây xếp nối nhau theo
// hàng ngang (cao bằng bản đồ gốc), khu bắc/nam theo cột dọc (rộng bằng bản đồ gốc); góc chéo là đất trống ".".

export type ChunkSide = "east" | "west" | "north" | "south";

export interface ChunkDef {
  id: string;
  side: ChunkSide;
  rows: string[];
}

/** Một khu đã mở của xóm: mẫu nào, ở đâu (gx > 0 đông, gx < 0 tây, gz < 0 bắc, gz > 0 nam; khu gốc là 0,0). */
export interface OpenedChunk {
  chunkId: string;
  gx: number;
  gz: number;
}

const SIDE_STEP: Record<ChunkSide, { gx: number; gz: number }> = {
  east: { gx: 1, gz: 0 },
  west: { gx: -1, gz: 0 },
  north: { gx: 0, gz: -1 },
  south: { gx: 0, gz: 1 },
};

const sideOf = (o: OpenedChunk): ChunkSide | null =>
  o.gz === 0 && o.gx > 0
    ? "east"
    : o.gz === 0 && o.gx < 0
      ? "west"
      : o.gx === 0 && o.gz < 0
        ? "north"
        : o.gx === 0 && o.gz > 0
          ? "south"
          : null;

/** Chỗ kế tiếp để mở khu mẫu `chunk` (nối tiếp các khu đã mở cùng phía). */
export function nextChunkSlot(chunk: ChunkDef, opened: readonly OpenedChunk[]): OpenedChunk {
  const step = SIDE_STEP[chunk.side];
  const n = opened.filter((o) => sideOf(o) === chunk.side).length + 1;
  return { chunkId: chunk.id, gx: step.gx * n, gz: step.gz * n };
}

/** Khoá ổn định của tập khu đã mở (so sánh / cache lưới ghép). */
export function chunksKey(opened: readonly OpenedChunk[] | undefined): string {
  return (opened ?? []).map((o) => `${o.chunkId}@${o.gx},${o.gz}`).join("|");
}

/**
 * Ghép lưới: khu cùng phía xếp theo khoảng cách tới khu gốc (1, 2, …). Khu không đúng phía (chéo) hoặc mẫu không có thì bỏ qua.
 */
export function composeMap(
  base: MapDef,
  templates: readonly ChunkDef[],
  opened: readonly OpenedChunk[] | undefined,
): MapDef {
  if (!opened?.length) return base;
  const byId = new Map(templates.map((t) => [t.id, t]));
  const sides: Record<ChunkSide, ChunkDef[]> = { east: [], west: [], north: [], south: [] };
  for (const o of [...opened].sort((a, b) => Math.abs(a.gx + a.gz) - Math.abs(b.gx + b.gz))) {
    const side = sideOf(o);
    const t = byId.get(o.chunkId);
    if (side && t && t.side === side) sides[side].push(t);
  }
  const baseW = base.rows[0]?.length ?? 0;
  const baseH = base.rows.length;
  const width = (list: ChunkDef[]) => list.reduce((n, t) => n + (t.rows[0]?.length ?? 0), 0);
  const height = (list: ChunkDef[]) => list.reduce((n, t) => n + t.rows.length, 0);
  const westW = width(sides.west);
  const northH = height(sides.north);
  const cols = westW + baseW + width(sides.east);
  const total = northH + baseH + height(sides.south);
  const cells = Array.from({ length: total }, () => new Array<string>(cols).fill("."));
  const paste = (rows: readonly string[], c0: number, r0: number) =>
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const line = cells[r0 + r];
        if (line) line[c0 + c] = row[c] ?? ".";
      }
    });
  paste(base.rows, westW, northH);
  let c = westW + baseW;
  for (const t of sides.east) {
    paste(t.rows, c, northH);
    c += t.rows[0]?.length ?? 0;
  }
  c = westW;
  for (const t of sides.west) {
    c -= t.rows[0]?.length ?? 0;
    paste(t.rows, c, northH);
  }
  let r = northH + baseH;
  for (const t of sides.south) {
    paste(t.rows, westW, r);
    r += t.rows.length;
  }
  r = northH;
  for (const t of sides.north) {
    r -= t.rows.length;
    paste(t.rows, westW, r);
  }
  return {
    tile: base.tile,
    origin: { x: base.origin.x - westW * base.tile, z: base.origin.z - northH * base.tile },
    rows: cells.map((line) => line.join("")),
  };
}

/** Mẫu khu mở tiếp theo khi xóm lớn dần (bước F): xoay vòng theo thứ tự mẫu trong content (đông → tây → bắc → nam → …). */
export function nextChunkToOpen<T extends ChunkDef>(
  templates: readonly T[],
  opened: readonly OpenedChunk[],
): T | undefined {
  return templates.length ? templates[opened.length % templates.length] : undefined;
}

/** Xóm đủ đông để mở khu mới chưa: số chỗ có người / tổng số chỗ ≥ ngưỡng, chưa quá số khu tối đa. */
export function shouldGrow(
  taken: number,
  total: number,
  opened: number,
  rule: { at: number; maxChunks: number },
): boolean {
  return total > 0 && opened < rule.maxChunks && taken / total >= rule.at;
}
