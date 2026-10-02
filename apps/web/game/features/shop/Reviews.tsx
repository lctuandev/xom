"use client";

import { ReviewBook } from "../../ui/Reviews";
import { ShopFeature } from "./common";

/** 📒 Đánh giá của cửa hàng đang quản lý (mỗi cửa hàng một sổ — đổi cửa hàng ở thanh chọn phía trên). */
export function ReviewsSheet() {
  return (
    <ShopFeature id="reviews">
      {(biz) => <ReviewBook key={biz.id} businessId={biz.id} owner />}
    </ShopFeature>
  );
}
