"use client";

import { ReviewBook } from "../../ui/Reviews";
import { ShopFeature } from "./common";

/** 📒 Đánh giá: khách chấm sao, mình trả lời. */
export function ReviewsSheet() {
  return (
    <ShopFeature id="reviews">
      {(_biz, me) => <ReviewBook ownerId={me.playerId} owner />}
    </ShopFeature>
  );
}
