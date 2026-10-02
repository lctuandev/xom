import { content } from "@xom/content";
import { soften } from "@xom/sim";

// "Thoại mặn" (#12, UC-D6): khách nói teencode, đôi khi hơi tục nhẹ. Tắt thì đổi từ mặn sang từ hiền ngay trên máy
// (tiện ích riêng từng người chơi — lưu localStorage, mất cũng không sao).
const KEY = "xom:spicy";

let spicy = true;
try {
  spicy = localStorage.getItem(KEY) !== "0";
} catch {}

export const isSpicy = () => spicy;

export function setSpicy(on: boolean) {
  spicy = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {}
}

/** Câu NPC hiện ra màn hình: giữ nguyên nếu bật thoại mặn, không thì làm hiền. */
export const voiceText = (text: string) => (spicy ? text : soften(text, content.data.voice.soften));
