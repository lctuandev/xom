import type { CharacterModel } from "./assets";

// Dáng nhân vật dùng chung cho cảnh 3D và ảnh chân dung (public/portraits, render bằng art/blender/chan_dung.py).

/** Không dùng "character-male-a" — đó là dáng của chính mình, để khỏi nhìn nhầm. */
const MODELS: CharacterModel[] = ["character-female-a", "character-male-c", "character-female-d"];

/** Dáng của một người chơi khác — cố định theo id. */
export function modelFor(id: string): CharacterModel {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return MODELS[Math.abs(h) % MODELS.length] ?? "character-male-c";
}

/** Ảnh chân dung (đầu + vai) của một model nhân vật. */
export function portraitUrl(model: string): string {
  return `/portraits/${model}.webp`;
}
