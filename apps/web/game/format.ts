/** 500000 → "500.000đ" */
export const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;

/** 320000 → "320k", 1500000 → "1,5tr" — dùng chỗ chật trên mobile. */
export function vndShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000)
    return `${sign}${(abs / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}đ`;
}

export const stars = (reputation: number) => {
  const n = Math.round(reputation * 5);
  return "★".repeat(n) + "☆".repeat(5 - n);
};
