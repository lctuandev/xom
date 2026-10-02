import type { Content } from "@xom/content";
import { seededRandom } from "./time.js";

// 📋 Việc người chơi đăng cho nhau + 📸 thợ ảnh (docs/KIENTRUC.md §3 — 1.20b, UC-M8): thuần logic — phí ghi sổ, cọc,
// khoảnh khắc đẹp trong buổi chụp, điểm từng tấm, chất lượng bộ ảnh, phân xử khi khiếu nại, hiệu ứng đăng ảnh lên nhóm xóm.

const round1000 = (n: number) => Math.round(n / 1000) * 1000;

/** Phí ghi sổ của người giữ bảng (vào quỹ xóm). */
export function gigFee(content: Content, reward: number): number {
  const g = content.data.gigs;
  return Math.max(g.feeMin, round1000(reward * g.feeRate));
}

/** Cọc người nhận đặt (cùng tỉ lệ việc NPC). */
export function gigDeposit(content: Content, reward: number): number {
  return Math.max(1000, round1000(reward * content.data.contracts.depositRate));
}

export interface PhotoMoment {
  /** Thời điểm đẹp nhất (ms kể từ lúc bắt đầu chụp). */
  at: number;
  /** Chỉ số trong `content.gigs.photo.kinds`. */
  kind: number;
}

/**
 * Khoảnh khắc đẹp trong một buổi chụp: chia đều thời gian thành từng khúc, mỗi khúc một khoảnh khắc rơi ngẫu nhiên ở giữa
 * khúc (không sát nhau, không sát đầu/cuối) — cố định theo `seed`.
 */
export function photoMoments(content: Content, ...seed: (string | number)[]): PhotoMoment[] {
  const p = content.data.gigs.photo;
  const rand = seededRandom("photo", ...seed);
  const lead = 1500;
  const span = p.sessionMs - lead - 1000;
  const slot = span / p.moments;
  return Array.from({ length: p.moments }, (_, i) => ({
    at: Math.round(lead + slot * i + slot * (0.25 + rand() * 0.5)),
    kind: Math.floor(rand() * p.kinds.length),
  }));
}

/** Điểm một tấm (0–100): bấm trong `perfectMs` quanh khoảnh khắc là 100, lệch dần tới `windowMs` thì về 0. */
export function shotScore(content: Content, moments: PhotoMoment[], t: number): number {
  const { windowMs, perfectMs } = content.data.gigs.photo;
  let best = 0;
  for (const m of moments) {
    const d = Math.abs(t - m.at);
    const s =
      d <= perfectMs ? 100 : Math.max(0, 100 * (1 - (d - perfectMs) / (windowMs - perfectMs)));
    best = Math.max(best, s);
  }
  return Math.round(best);
}

/** Chất lượng bộ ảnh nộp: trung bình `keep` tấm đẹp nhất (thiếu tấm tính 0). */
export function photoQuality(content: Content, scores: number[]): number {
  const keep = content.data.gigs.photo.keep;
  const top = [...scores].sort((a, b) => b - a).slice(0, keep);
  while (top.length < keep) top.push(0);
  return Math.round(top.reduce((a, b) => a + b, 0) / keep);
}

/** Ảnh đăng lên nhóm xóm: khách ghé quầy nhiều hơn theo chất lượng ảnh. */
export function adMultiplier(content: Content, quality: number): number {
  return 1 + content.data.gigs.photo.adBoost * (Math.max(0, Math.min(100, quality)) / 100);
}

/** Người giữ bảng phân xử khiếu nại: ảnh đạt chuẩn thì người nhận được tiền, không thì hoàn tiền người đăng. */
export function disputeVerdict(content: Content, quality: number): "taker" | "poster" {
  return quality >= content.data.gigs.photo.passQuality ? "taker" : "poster";
}
