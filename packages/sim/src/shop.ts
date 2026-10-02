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
): { rent: number; fee: number; total: number } {
  const lot = content.lot(lotId);
  const rent = lot.kind === "house" ? 0 : lot.rentPerDay;
  const fee = content.economy.fees.daily[lot.kind];
  return { rent, fee, total: rent + fee };
}
