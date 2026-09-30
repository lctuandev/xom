"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { useGame } from "../store";
import { anchorOf, bubbleEls } from "./anchors";

const HEAD_Y = 2.25;
const v = new Vector3();

/**
 * Mỗi frame: chiếu vị trí đầu nhân vật ra màn hình và đặt khung thoại (DOM) vào đó.
 * Một lớp DOM duy nhất thay cho <Html> của drei — nhẹ hơn và không bị lỗi root khi StrictMode.
 */
export function BubbleProjector({
  headY = HEAD_Y,
  fallbackTop,
}: {
  headY?: number;
  fallbackTop?: number;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useFrame(() => {
    const myId = useGame.getState().me?.playerId;
    for (const [key, el] of bubbleEls) {
      const pos = anchorOf(key, myId, fallbackTop !== undefined);
      if (!pos) {
        // Không có người trong cảnh (vd: Chú Bảy nói khi mình đang trong quán): hiện sát mép trên như cuộc gọi.
        if (fallbackTop === undefined) el.style.visibility = "hidden";
        else {
          el.style.visibility = "visible";
          el.style.transform = `translate3d(${(size.width / 2).toFixed(1)}px, ${fallbackTop}px, 0) translate(-50%, 0)`;
        }
        continue;
      }
      v.set(pos.x, headY, pos.z).project(camera);
      let x = ((v.x + 1) / 2) * size.width;
      let y = ((1 - v.y) / 2) * size.height;
      if (fallbackTop !== undefined) {
        // Trong nhà khung hình dọc rất hẹp: người nói đứng ngoài khung thì kéo khung thoại vào mép màn hình.
        x = Math.min(size.width - 100, Math.max(100, x));
        y = Math.min(size.height * 0.6, Math.max(fallbackTop + 60, y));
      }
      const onScreen = v.z < 1 && x > -80 && x < size.width + 80 && y > -40 && y < size.height + 40;
      el.style.visibility = onScreen ? "visible" : "hidden";
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
  });
  return null;
}
