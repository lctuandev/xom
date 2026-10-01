"use client";

import { content } from "@xom/content";
import { useEffect } from "react";
import { walkTo } from "./nav";
import { send } from "./net/socket";
import { getPlayer } from "./scene/player";
import { useGame } from "./store";
import { spotFor } from "./world";

/**
 * Nối trạng thái "đang ở đâu" với luật chơi:
 * - đứng ở quầy ↔ báo server (quầy chỉ bán khi có chủ),
 * - có goal mới thì tự đi tới đó (tới nơi mở sheet: xem ProximityWatcher trong scene).
 */
export function useWorldEffects() {
  useEffect(() => {
    let lastAttend: boolean | null = null;
    return useGame.subscribe((s, prev) => {
      // Quầy có chủ hay không.
      const hasLot = !!s.me?.business?.lotId;
      const attending = hasLot && s.atStall;
      if (s.status === "online" && attending !== lastAttend && (hasLot || lastAttend)) {
        lastAttend = attending;
        void send("biz:attend", { on: attending });
      }

      // Chạy xe giao hàng nhanh hơn đi bộ; chạy nhanh thì nhanh nữa; mưa bão đường trơn phải chạy chậm (UC-B4).
      const sky = content.weatherKind(s.clock?.weather.now ?? "sunny");
      const speed =
        s.shift?.role === "giao_hang" ? (s.shift.fast ? 7 : 4.5) * sky.delivery.speed : 4;
      if (getPlayer().speed !== speed) getPlayer().speed = speed;

      // Goal mới → đi tới đó.
      if (s.goal && s.goal !== prev.goal) {
        const spot = spotFor(s.goal, s.me);
        if (spot) walkTo(getPlayer(), spot.x, spot.z, spot.yaw);
      }
    });
  }, []);
}
