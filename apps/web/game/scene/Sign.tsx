"use client";

import { useEffect, useMemo } from "react";
import { CanvasTexture, FrontSide, SRGBColorSpace } from "three";

const W = 512;
const H = 128;

/**
 * Biển hiệu chữ tiếng Việt vẽ lúc runtime — biển hiệu không phải asset 3D (docs/PLAN.md §5.3),
 * nên "Bánh mì <tên người chơi>" tự sinh được.
 */
export function Sign({
  text,
  position,
  rotationY = 0,
  bg,
  dark = false,
  size = [2.6, 0.65],
}: {
  text: string;
  position: [number, number, number];
  rotationY?: number;
  bg: string;
  /** Chữ tối trên nền sáng (nhãn hàng, số bàn). */
  dark?: boolean;
  /** Kích thước tấm biển (mét). */
  size?: [number, number];
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, []);

  useEffect(() => {
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // next/font đặt biến dạng "'Be Vietnam Pro', 'Be Vietnam Pro Fallback'"; chỉ lấy family đầu.
    // Không load cả chuỗi: fallback trỏ tới local("Arial") — Android/Linux không có nên load() bị lỗi.
    const primary =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--font-be-vietnam")
        .split(",")[0]
        ?.trim() || "sans-serif";
    const font = `800 64px ${primary}, sans-serif`;
    let cancelled = false;
    const draw = () => {
      if (cancelled) return;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = dark ? "#2b2118" : "#fff6e5";
      ctx.lineWidth = 8;
      ctx.strokeRect(6, 6, W - 12, H - 12);
      ctx.fillStyle = dark ? "#2b2118" : "#fff6e5";
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, W / 2, H / 2 + 4, W - 40);
      texture.needsUpdate = true;
    };
    // Phải chờ font tải xong, nếu không canvas vẽ bằng font mặc định; lỗi thì vẫn vẽ bằng font hệ thống.
    document.fonts.load(`800 64px ${primary}`, text).then(draw, draw);
    return () => {
      cancelled = true;
    };
  }, [texture, text, bg, dark]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    // Hai mặt, mỗi mặt chữ xuôi (xoay camera ra phía sau biển vẫn đọc được, không bị ngược chữ).
    <group position={position} rotation-y={rotationY}>
      <mesh>
        <planeGeometry args={size} />
        <meshBasicMaterial map={texture} toneMapped={false} side={FrontSide} />
      </mesh>
      <mesh rotation-y={Math.PI}>
        <planeGeometry args={size} />
        <meshBasicMaterial map={texture} toneMapped={false} side={FrontSide} />
      </mesh>
    </group>
  );
}
