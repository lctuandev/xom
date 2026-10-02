"use client";

import { ShopSetup } from "../../ui/ShopSetup";
import { ShopFeature } from "./common";

/** 🏠 Thuê nhà & giấy tờ: hợp đồng thuê, hộ kinh doanh, ATTP, biển hiệu, tiền nhà (UC-F12, UC-F13). */
export function LeaseSheet() {
  return <ShopFeature id="lease">{() => <ShopSetup />}</ShopFeature>;
}
