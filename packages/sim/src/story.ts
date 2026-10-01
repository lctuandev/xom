// Chuyện của tôi (docs/THEGIOI.md §1): điền chỗ trống trong câu mốc. Thuần logic, server dùng khi ghi mốc.

/** "Mở quầy {product} ở {lot}" + { product: "bánh mì", lot: "Đầu hẻm 12" } → câu hoàn chỉnh; thiếu biến thì để "…". */
export function storyText(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    return v === undefined || v === "" ? "…" : String(v);
  });
}
