import type { Content } from "@xom/content";
import { seededRandom } from "./time.js";

// 🏗️ Phụ hồ công trình xóm (NGHE §3.4, UC-J6): thuần logic — Cai thầu giao mẻ vữa, chấm mẻ trộn theo định mức thật,
// khoản nhân công trích từ chi phí công trình, chỗ dựng công trường.

type Project = Content["data"]["projects"][number];

export interface MixOrder {
  mixId: string;
  /** Số bao xi măng của mẻ. */
  bags: number;
}

export interface MixInput {
  /** Bao xi măng, thùng cát, lít nước người chơi đổ vào. */
  cement: number;
  sand: number;
  water: number;
}

/** Cai thầu giao mẻ tiếp theo (cố định theo seed). */
export function mixOrder(content: Content, ...seed: (string | number)[]): MixOrder {
  const c = content.data.crew;
  const rand = seededRandom("mix", ...seed);
  const mix = c.mixes[Math.floor(rand() * c.mixes.length)] ?? c.mixes[0];
  const bags = c.bags[0] + Math.floor(rand() * (c.bags[1] - c.bags[0] + 1));
  return { mixId: mix?.id ?? "", bags };
}

/** Lượng đúng cho một mẻ: cát theo thùng, nước theo lít. */
export function mixTarget(content: Content, order: MixOrder) {
  const mix = content.data.crew.mixes.find((m) => m.id === order.mixId);
  if (!mix) throw new Error(`Không có loại vữa ${order.mixId}`);
  return {
    cement: order.bags,
    sand: order.bags * mix.sandPerBag,
    water: order.bags * mix.waterPerBag,
  };
}

/**
 * Chấm mẻ trộn: xi măng phải đúng số bao, cát đúng số thùng (lệch là sai mác), nước được lệch `waterTolerance` (cát ẩm/khô).
 * Trả về các lỗi bằng lời của Cai thầu (rỗng = đạt).
 */
export function checkMix(content: Content, order: MixOrder, input: MixInput): string[] {
  const t = mixTarget(content, order);
  const tol = content.data.crew.waterTolerance;
  const out: string[] = [];
  if (input.cement !== t.cement)
    out.push(input.cement > t.cement ? "dư xi măng, phí của" : "thiếu xi măng, vữa bở");
  if (input.sand !== t.sand)
    out.push(input.sand > t.sand ? "nhiều cát quá, vữa không dính" : "ít cát quá, vữa dễ nứt");
  if (input.water > t.water * (1 + tol)) out.push("nhão quá, chảy hết");
  else if (input.water < t.water * (1 - tol)) out.push("khô quá, trét không đi");
  return out;
}

/** Khoản nhân công trích từ chi phí công trình (làm tròn nghìn). */
export function laborBudget(content: Content, cost: number): number {
  return Math.round((cost * content.data.crew.laborShare) / 1000) * 1000;
}

/** Chỗ dựng công trường. */
export function siteOf(content: Content, project: Project): { x: number; z: number } {
  if (project.site) return project.site;
  const lotId = project.demand.lots[0] ?? "";
  const p = content.lot(lotId).position;
  return { x: p.x + 3.2, z: p.z };
}
