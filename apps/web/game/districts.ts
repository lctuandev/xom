import { content } from "@xom/content";
import type { LotOccupant } from "@xom/shared";
import { type DistrictFame, districtFame } from "@xom/sim";

// Bản sắc khu phố (docs/THEGIOI.md §3) cho giao diện: khu hợp với hàng gì, khu nào đang có tiếng.

/** Nhóm hàng (category) → tên các nghề bán nhóm đó: "trà sữa", "sửa xe"… */
function productNames(category: string): string {
  return content.data.products
    .filter((p) => p.category === category)
    .map((p) => p.name.toLowerCase())
    .join(", ");
}

/** "hợp: trà sữa, phụ kiện" — các nhóm hàng khu ưa rõ rệt (≥ ×1,1). */
export function districtLikes(trafficId: string): string {
  const likes = Object.entries(content.traffic(trafficId).likes)
    .filter(([, v]) => v >= 1.1)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => productNames(c))
    .filter(Boolean);
  return likes.length ? `hợp ${likes.join(", ")}` : "khu đủ loại khách";
}

/** Tiếng khu tính từ các quầy đang mở trong xóm (cùng công thức với server). */
export function xomFame(lots: LotOccupant[]): DistrictFame[] {
  return districtFame(
    content,
    lots
      .filter((l) => l.open && !!content.findLot(l.lotId))
      .map((l) => ({
        trafficId: content.lot(l.lotId).traffic,
        category: content.product(l.productId).category,
      })),
  );
}
