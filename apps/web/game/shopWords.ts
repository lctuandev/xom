import { content } from "@xom/content";

// Gọi cửa hàng của mình đúng tên theo chỗ đang đặt (góp ý đợt 3: "đang thuê tiệm mà vẫn kêu quầy, đẩy xe"):
// xe đẩy vỉa hè = quầy, nhà mặt tiền = tiệm, ô đất có mái = sạp.

export type ShopKind = "cart" | "house" | "stall";

const WORDS = {
  cart: {
    noun: "quầy",
    Noun: "Quầy",
    emoji: "🏪",
    go: "Đẩy xe tới",
    close: "Đóng quầy",
    open: "Mở quầy",
  },
  house: {
    noun: "tiệm",
    Noun: "Tiệm",
    emoji: "🏠",
    go: "Tới tiệm",
    close: "Đóng tiệm",
    open: "Mở tiệm",
  },
  stall: {
    noun: "sạp",
    Noun: "Sạp",
    emoji: "⛺",
    go: "Tới sạp",
    close: "Đóng sạp",
    open: "Mở sạp",
  },
} as const satisfies Record<ShopKind, Record<string, string>>;

/** Chữ cho cửa hàng đặt ở `lotId` (chưa có chỗ = quầy xe đẩy). */
export function shopWords(lotId: string | null | undefined) {
  const kind = (lotId ? content.findLot(lotId)?.kind : undefined) ?? "cart";
  return { kind, ...WORDS[kind] };
}
