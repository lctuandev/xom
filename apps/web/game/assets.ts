import manifest from "@/public/assets/models/manifest.json";

// Sinh bởi packages/assets (pnpm --filter @xom/assets build:assets).
export const CITY_URL = manifest.city.url;
/** Nhà quê, cây cối tự dựng bằng Blender (art/blender/nha_que.py) — gộp chung với city khi vẽ. */
export const VILLAGE_URL = manifest.village.url;
export type CityModel =
  | (typeof manifest.city.models)[number]
  | (typeof manifest.village.models)[number];

export const CHARACTER_URLS = manifest.characters.files;
export type CharacterModel = keyof typeof CHARACTER_URLS;

export const INTERIOR_URL = manifest.interior.url;
export type InteriorModel = (typeof manifest.interior.models)[number];
