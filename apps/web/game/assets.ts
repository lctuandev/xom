import manifest from "@/public/assets/models/manifest.json";

// Sinh bởi packages/assets (pnpm --filter @xom/assets build:assets).
export const CITY_URL = manifest.city.url;
export type CityModel = (typeof manifest.city.models)[number];

export const CHARACTER_URLS = manifest.characters.files;
export type CharacterModel = keyof typeof CHARACTER_URLS;
