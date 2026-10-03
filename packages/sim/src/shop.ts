import type { Content } from "@xom/content";

// Mở tiệm trong nhà mặt tiền (docs/USECASES.md UC-F12): thuần logic — cọc, vốn dự phòng, dự toán, kiểm tên quán, các bước.

export interface ShopEstimate {
  deposit: number;
  reserve: number;
  license: number;
  training: number;
  sign: number;
  /** Tổng cần có trong tay để đi hết các bước (cọc + dự phòng + lệ phí + tập huấn + biển hiệu). */
  total: number;
}

/** Dự toán mở tiệm ở một căn nhà, cho một nghề (quán ăn uống thì có tập huấn ATTP). */
export function shopEstimate(content: Content, lotId: string, productId: string): ShopEstimate {
  const s = content.data.shopSetup;
  const rent = content.lot(lotId).rentPerDay;
  const deposit = rent * s.depositDays;
  const reserve = rent * s.reserveDays;
  const training = needsFoodCert(content, productId) ? s.foodCert.trainingFee : 0;
  const total = deposit + reserve + s.license.fee + training + s.signFee;
  return { deposit, reserve, license: s.license.fee, training, sign: s.signFee, total };
}

/** Quán ăn uống mới phải có giấy chứng nhận ATTP. */
export function needsFoodCert(content: Content, productId: string): boolean {
  return content.data.shopSetup.foodCert.templates.includes(content.product(productId).template);
}

/** Chuẩn hoá tên quán: bỏ khoảng trắng thừa. */
export function normalizeShopName(name: string): string {
  return name.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Lỗi tên quán (null = hợp lệ): độ dài, chỉ chữ / số / khoảng trắng / - ' & . */
export function shopNameError(content: Content, raw: string): string | null {
  const name = normalizeShopName(raw);
  const { min, max } = content.data.shopSetup.name;
  if (name.length < min) return `Tên quán ít nhất ${min} ký tự`;
  if (name.length > max) return `Tên quán tối đa ${max} ký tự`;
  if (!/^[\p{L}\p{N} '&.-]+$/u.test(name))
    return "Tên quán chỉ gồm chữ, số, khoảng trắng và - ' & .";
  if (!/\p{L}/u.test(name)) return "Tên quán phải có chữ";
  return null;
}

export type ShopStep = "lease" | "license" | "cert" | "sign" | "ready";

/** Bước tiếp theo phải làm (đã xong hết thì "ready"). */
export function nextShopStep(o: {
  leased: boolean;
  licensed: boolean;
  needCert: boolean;
  certified: boolean;
  signed: boolean;
}): ShopStep {
  if (!o.leased) return "lease";
  if (!o.licensed) return "license";
  if (o.needCert && !o.certified) return "cert";
  if (!o.signed) return "sign";
  return "ready";
}

/**
 * Tiền phải trả khi mở cửa lần đầu trong ngày: xe đẩy trả tiền chỗ vỉa hè + phí chợ; tiệm trong nhà chỉ trả thuế khoán
 * (tiền nhà đã tính theo hợp đồng mỗi cuối ngày — UC-F12), không bao giờ trả trùng.
 */
export function openDue(
  content: Content,
  lotId: string,
  /** Ô đất mình đã mua đứt (docs/BANDO.md bước D): không trả tiền thuê, trả thuế đất. */
  owned = false,
): { rent: number; fee: number; total: number } {
  const lot = content.lot(lotId);
  const rent = lot.kind === "house" || owned ? 0 : lot.rentPerDay;
  const fee = content.economy.fees.daily[lot.kind] + (owned ? content.economy.land.taxPerDay : 0);
  return { rent, fee, total: rent + fee };
}

/** Giá mua đứt một ô đất (chỉ ô sạp có mái). */
export function landPrice(content: Content, lotId: string): number {
  return content.lot(lotId).rentPerDay * content.economy.land.priceDays;
}

/** Tiền xóm trả lại khi bán ô (làm tròn nghìn). */
export function landRefund(content: Content, price: number): number {
  return Math.round((price * content.economy.land.sellBack) / 1000) * 1000;
}

// ───────────── Đòi tiền nhà (UC-F13) ─────────────

export interface RentState {
  day: number;
  minute: number;
  rentPerDay: number;
  /** Đã trả tiền nhà tới hết ngày này (ký hợp đồng ngày nào thì ngày đó không tính). */
  paidDay: number;
  /** Ngày đã hẹn trả (trả lúc nào trong ngày đó cũng được); null = chưa hẹn. */
  promiseDay: number | null;
  strikes: number;
  /** Cọc còn lại trong ví giữ hộ. */
  depositLeft: number;
  /** Chủ tiệm đang online (chủ nhà gặp / gọi được). */
  online: boolean;
}

/** Tiền nhà đang nợ: mỗi ngày từ sau ngày đã trả tới hôm nay (hôm nay cũng tính — trả trước trong ngày được). */
export function rentOwed(s: Pick<RentState, "day" | "paidDay" | "rentPerDay">) {
  const days = Math.max(0, s.day - s.paidDay);
  return { days, amount: days * s.rentPerDay };
}

/** Phí trễ: % số nợ, làm tròn lên nghìn. */
export function rentLateFee(content: Content, owed: number): number {
  const pct = content.data.shopSetup.rent.lateFeePct;
  return Math.ceil((owed * pct) / 100 / 1000) * 1000;
}

/** Các ngày được xin hẹn (từ mai tới tối đa maxPromiseDays ngày); phí trễ tính theo số ngày hẹn thêm. */
export function rentPromiseOptions(
  content: Content,
  day: number,
  owed: number,
): { day: number; fee: number }[] {
  if (owed <= 0) return [];
  const n = content.data.shopSetup.rent.maxPromiseDays;
  return Array.from({ length: n }, (_, i) => ({
    day: day + i + 1,
    fee: rentLateFee(content, owed) * (i + 1),
  }));
}

/** Chủ nhà có nên tới nhắc lúc này không: còn nợ, tới giờ nhắc, chủ tiệm online; đang hẹn thì chỉ nhắc đúng ngày hẹn. */
export function rentShouldRemind(content: Content, s: RentState): boolean {
  return (
    s.online &&
    s.minute >= content.data.shopSetup.rent.remindMinute &&
    rentOwed(s).amount > 0 &&
    (s.promiseDay === null || s.day >= s.promiseDay)
  );
}

export type RentVerdict =
  /** Không có gì phải làm. */
  | { kind: "none" }
  /** Chủ tiệm vắng, chưa hẹn, cọc còn đủ: chủ nhà về, mai quay lại (nợ cộng dồn, không tính lần trễ). */
  | { kind: "wait" }
  /** Quá hạn: trừ (nợ + phí trễ) vào cọc, tính một lần trễ. */
  | { kind: "collect"; owed: number; fee: number }
  /** Dẹp tiệm: trễ quá số lần cho phép hoặc cọc không đủ trừ. */
  | { kind: "evict"; reason: "strikes" | "deposit" };

/**
 * Còn nợ thì chủ nhà làm gì. Chưa hẹn: tới hạn trong ngày (dueMinute) mới đòi. Đã hẹn: hẹn theo NGÀY — trả lúc nào trong
 * ngày hẹn cũng được; qua ngày hẹn vẫn chưa trả là thất hẹn, tính trễ ngay dù chủ tiệm vắng.
 */
export function rentVerdict(content: Content, s: RentState): RentVerdict {
  const r = content.data.shopSetup.rent;
  const owed = rentOwed(s).amount;
  if (owed === 0) return { kind: "none" };
  if (s.promiseDay !== null ? s.day <= s.promiseDay : s.minute < r.dueMinute)
    return { kind: "none" };
  if (!s.online && s.promiseDay === null)
    return owed > s.depositLeft ? { kind: "evict", reason: "deposit" } : { kind: "wait" };
  const fee = rentLateFee(content, owed);
  if (s.strikes + 1 >= r.evictAfterStrikes) return { kind: "evict", reason: "strikes" };
  if (s.depositLeft < owed + fee) return { kind: "evict", reason: "deposit" };
  return { kind: "collect", owed, fee };
}
