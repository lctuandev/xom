import { LOST_WEIGHT } from "@xom/sim";
import type { Tx } from "../economy/ledger.service.js";

export interface ReportAdd {
  revenue?: number;
  tips?: number;
  stockCost?: number;
  rent?: number;
  wages?: number;
  fees?: number;
  served?: number;
  lost?: number;
  wrong?: number;
  /** Độ hài lòng của một nhóm khách, gộp theo trung bình có trọng số. */
  satisfaction?: { value: number; weight: number };
}

export function emptyReport() {
  return {
    revenue: 0,
    tips: 0,
    stockCost: 0,
    rent: 0,
    wages: 0,
    fees: 0,
    spoiledQty: 0,
    spoiledValue: 0,
    served: 0,
    lost: 0,
    wrong: 0,
    satisfaction: 0,
    reputation: 0,
    moneyEnd: 0n,
  };
}

/** Cộng dồn số liệu trong ngày vào DailyReport (tạo mới nếu chưa có). */
export async function addToReport(tx: Tx, playerId: string, day: number, add: ReportAdd) {
  const current = await tx.dailyReport.findUnique({ where: { playerId_day: { playerId, day } } });
  let satisfaction = current?.satisfaction ?? 0;
  if (add.satisfaction && add.satisfaction.weight > 0) {
    const before = (current?.served ?? 0) + (current?.lost ?? 0) * LOST_WEIGHT;
    satisfaction =
      (satisfaction * before + add.satisfaction.value * add.satisfaction.weight) /
      (before + add.satisfaction.weight);
  }
  const inc = {
    revenue: add.revenue ?? 0,
    tips: add.tips ?? 0,
    stockCost: add.stockCost ?? 0,
    rent: add.rent ?? 0,
    wages: add.wages ?? 0,
    fees: add.fees ?? 0,
    served: add.served ?? 0,
    lost: add.lost ?? 0,
    wrong: add.wrong ?? 0,
  };
  await tx.dailyReport.upsert({
    where: { playerId_day: { playerId, day } },
    create: { ...emptyReport(), ...inc, satisfaction, playerId, day },
    update: {
      revenue: { increment: inc.revenue },
      tips: { increment: inc.tips },
      stockCost: { increment: inc.stockCost },
      rent: { increment: inc.rent },
      wages: { increment: inc.wages },
      fees: { increment: inc.fees },
      served: { increment: inc.served },
      lost: { increment: inc.lost },
      wrong: { increment: inc.wrong },
      satisfaction,
    },
  });
}
