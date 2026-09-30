/** Giá trị theo giờ, nội suy tuyến tính giữa các mốc đã khai báo; ngoài khoảng thì giữ giá trị mốc gần nhất. */
export function valueAt(byHour: Record<string, number>, minuteOfDay: number): number {
  const points = Object.entries(byHour)
    .map(([h, v]) => [Number(h) * 60, v] as const)
    .sort((a, b) => a[0] - b[0]);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 0;
  if (minuteOfDay <= first[0]) return first[1];
  if (minuteOfDay >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [m1, v1] = points[i] as readonly [number, number];
    const [m0, v0] = points[i - 1] as readonly [number, number];
    if (minuteOfDay <= m1) return v0 + ((v1 - v0) * (minuteOfDay - m0)) / (m1 - m0);
  }
  return last[1];
}

export function formatClock(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60) % 24;
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Số ngẫu nhiên tất định từ các khóa (mulberry32 trên hash chuỗi) — cùng input luôn ra cùng kết quả. */
export function seededRandom(...keys: (string | number)[]): () => number {
  let h = 1779033703;
  for (const ch of keys.join("|")) {
    h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
