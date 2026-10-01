import { MAP_WALKABLE } from "@xom/content";
import type { Pt } from "./floor.js";

// Đi lại trong xóm theo đường xá (docs/USECASES.md UC-B6): lưới ô từ bản đồ, tìm đường A* qua các ô đi được
// (vỉa hè, đường, hẻm, công viên…), rồi nắn thẳng những đoạn không vướng nhà. Thuần logic: web dùng để đi,
// server có thể dùng để kiểm tra.

export interface MapDef {
  tile: number;
  origin: { x: number; z: number };
  rows: string[];
}

export class Grid {
  readonly cols: number;
  readonly rows: number;
  private readonly walk: Uint8Array;

  constructor(readonly map: MapDef) {
    this.rows = map.rows.length;
    this.cols = map.rows[0]?.length ?? 0;
    this.walk = new Uint8Array(this.rows * this.cols);
    map.rows.forEach((row, r) => {
      for (let c = 0; c < this.cols; c++)
        this.walk[r * this.cols + c] = MAP_WALKABLE.includes(row[c] ?? ".") ? 1 : 0;
    });
  }

  cellOf(p: Pt): { c: number; r: number } {
    return {
      c: Math.round((p.x - this.map.origin.x) / this.map.tile),
      r: Math.round((p.z - this.map.origin.z) / this.map.tile),
    };
  }

  center(c: number, r: number): Pt {
    return { x: this.map.origin.x + c * this.map.tile, z: this.map.origin.z + r * this.map.tile };
  }

  charAt(c: number, r: number): string {
    return this.map.rows[r]?.[c] ?? ".";
  }

  walkable(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.walk[r * this.cols + c] === 1;
  }

  canStand(p: Pt): boolean {
    const { c, r } = this.cellOf(p);
    return this.walkable(c, r);
  }

  /** Ô đi được gần nhất (chạm vào nhà thì đi tới vỉa hè trước nhà). */
  nearest(p: Pt): Pt {
    if (this.canStand(p)) return p;
    const { c, r } = this.cellOf(p);
    let best: Pt | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (let rad = 1; rad < Math.max(this.cols, this.rows) && !best; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad || !this.walkable(c + dc, r + dr))
            continue;
          const q = this.center(c + dc, r + dr);
          // Mép ô gần điểm chạm nhất, không phải tâm ô.
          const half = this.map.tile / 2 - 0.3;
          const e = {
            x: Math.max(q.x - half, Math.min(q.x + half, p.x)),
            z: Math.max(q.z - half, Math.min(q.z + half, p.z)),
          };
          const d = Math.hypot(e.x - p.x, e.z - p.z);
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        }
      }
    }
    return best ?? p;
  }

  /** Đoạn thẳng a→b không đi qua ô cấm (lấy mẫu mỗi 0,5 m); `avoid`: loại ô không được cắt ngang khi nắn thẳng. */
  clear(a: Pt, b: Pt, avoid?: ReadonlySet<string>): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(d / 0.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      if (!this.canStand(p)) return false;
      if (avoid) {
        const { c, r } = this.cellOf(p);
        if (avoid.has(this.charAt(c, r))) return false;
      }
    }
    return true;
  }

  /** Chiều dài (mét) đi từ `from` qua các điểm rẽ. */
  static length(from: Pt, pts: readonly Pt[]): number {
    let d = 0;
    let cur = from;
    for (const p of pts) {
      d += Math.hypot(p.x - cur.x, p.z - cur.z);
      cur = p;
    }
    return d;
  }

  /**
   * Đường đi từ `from` tới `to`: các điểm rẽ (không gồm `from`, điểm cuối là `to` đã kéo vào ô đi được).
   * Đi thẳng được thì chỉ một điểm.
   */
  path(from: Pt, to: Pt, weights?: Readonly<Record<string, number>>): Pt[] {
    const goal = this.nearest(to);
    const start = this.canStand(from) ? from : this.nearest(from);
    // Đi theo loại đường (xe ôm: đường lớn / hẻm): ô đắt (≥ 2) thì né, không nắn thẳng cắt qua.
    const weight = (c: number, r: number) => weights?.[this.charAt(c, r)] ?? 1;
    const avoid = weights
      ? new Set(
          Object.entries(weights)
            .filter(([, w]) => w >= 2)
            .map(([ch]) => ch),
        )
      : undefined;
    if (this.clear(start, goal, avoid)) return start === from ? [goal] : [start, goal];
    const s = this.cellOf(start);
    const g = this.cellOf(goal);
    const key = (c: number, r: number) => r * this.cols + c;
    const came = new Map<number, number>();
    const cost = new Map<number, number>([[key(s.c, s.r), 0]]);
    const open: [number, number, number][] = [[0, s.c, s.r]];
    const h = (c: number, r: number) => Math.hypot(c - g.c, r - g.r);
    let found = false;
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [, c, r] = open.shift() as [number, number, number];
      if (c === g.c && r === g.r) {
        found = true;
        break;
      }
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ] as const) {
        const nc = c + dc;
        const nr = r + dr;
        if (!this.walkable(nc, nr)) continue;
        // Đi chéo không được cắt góc nhà.
        if (dc && dr && (!this.walkable(c + dc, r) || !this.walkable(c, r + dr))) continue;
        const k = key(nc, nr);
        const g2 = (cost.get(key(c, r)) ?? 0) + (dc && dr ? Math.SQRT2 : 1) * weight(nc, nr);
        if (g2 < (cost.get(k) ?? Number.POSITIVE_INFINITY)) {
          cost.set(k, g2);
          came.set(k, key(c, r));
          open.push([g2 + h(nc, nr), nc, nr]);
        }
      }
    }
    if (!found) return [goal];
    const cells: Pt[] = [];
    for (
      let k: number | undefined = key(g.c, g.r);
      k !== undefined && k !== key(s.c, s.r);
      k = came.get(k)
    )
      cells.unshift(this.center(k % this.cols, Math.floor(k / this.cols)));
    cells[cells.length - 1] = goal;
    // Nắn thẳng: bỏ điểm giữa nếu đi thẳng được từ điểm trước tới điểm sau.
    const out: Pt[] = [];
    let cur = start;
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.clear(cur, cells[j] as Pt, avoid)) j--;
      const next = cells[j] as Pt;
      out.push(next);
      cur = next;
      i = j + 1;
    }
    return start === from ? out : [start, ...out];
  }
}
