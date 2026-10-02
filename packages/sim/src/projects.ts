import type { Content, Project } from "@xom/content";

// Quỹ xóm + công trình chung (docs/USECASES.md UC-J5): luật thuần để server và client dùng chung.

export type ProjectStatus = "VOTING" | "FUNDING" | "BUILDING" | "DONE" | "REJECTED";

/** Hệ số khách ở một chỗ bán nhờ các công trình đã xong (nhân dồn). */
export function projectDemand(c: Content, done: ReadonlySet<string>, lotId: string): number {
  let m = 1;
  for (const p of c.data.projects)
    if (done.has(p.id) && p.demand.lots.includes(lotId)) m *= p.demand.mult;
  return m;
}

/** Đề xuất được không (null = được): chưa xong, chưa đang làm, đã có công trình tiên quyết. */
export function canPropose(
  p: Project,
  done: ReadonlySet<string>,
  active: ReadonlySet<string>,
): string | null {
  if (done.has(p.id)) return "Công trình này xong rồi";
  if (active.has(p.id)) return "Công trình này đang được bàn hoặc đang làm";
  if (p.requires && !done.has(p.requires)) return "Phải làm công trình trước đó đã";
  return null;
}

/**
 * Kết quả bỏ phiếu khi hết hạn: qua nếu thuận > chống (người không bỏ phiếu không tính).
 * Xóm chỉ có một người thì người đề xuất tự quyết.
 */
export function tallyVotes(votes: Readonly<Record<string, boolean>>): {
  yes: number;
  no: number;
  passed: boolean;
} {
  const all = Object.values(votes);
  const yes = all.filter(Boolean).length;
  const no = all.length - yes;
  return { yes, no, passed: yes > no };
}

/** Phần phí chợ vào quỹ xóm (tròn 500đ), phần còn lại cho ban quản lý chợ. */
export function feeToFund(fee: number, share: number): number {
  return Math.round((fee * share) / 500) * 500;
}
