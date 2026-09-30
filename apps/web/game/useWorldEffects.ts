"use client";

import { content } from "@xom/content";
import { useEffect } from "react";
import { send } from "./net/socket";
import { getPlayer } from "./scene/player";
import { useGame } from "./store";
import { spotFor } from "./world";

/**
 * Nối trạng thái "đang ở đâu" với luật chơi:
 * - đứng ở quầy ↔ báo server (quầy chỉ bán khi có chủ),
 * - rời chỗ làm thuê = nghỉ việc,
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

      // Rời chỗ làm → nghỉ việc.
      if (s.me?.jobId && prev.nearPlace !== s.nearPlace) {
        const workplace = content.placeForJob(s.me.jobId);
        if (workplace && prev.nearPlace === workplace.id && s.nearPlace !== workplace.id) {
          void send("job:stop", {});
          s.toast({ kind: "info", text: `Bạn đã rời ${workplace.name}, nghỉ làm.` });
        }
      }

      // Goal mới → đi tới đó.
      if (s.goal && s.goal !== prev.goal) {
        const spot = spotFor(s.goal, s.me);
        if (spot) getPlayer().moveTo(spot.x, spot.z, spot.yaw);
      }
    });
  }, []);
}
