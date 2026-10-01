import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { OrderEvent } from "@xom/shared";
import { clean, VoiceAiService } from "../src/game/voice-ai.js";
import { next, openBanhMiStall } from "./client.js";
import { startApp } from "./helpers.js";

// Giọng thoại theo kiểu khách + lớp AI tuỳ chọn (docs/USECASES.md UC-D6).

describe("Giọng thoại (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  it("khách gọi món theo giọng của kiểu khách", async () => {
    const a = await openBanhMiStall(url);
    for (let i = 0; i < 3; i++) {
      const o: OrderEvent = await next(a.socket, "order");
      const voice = content.data.voice.voices.find((v) => v.archetype === o.archetype);
      const allowed = voice
        ? voice.ask.map((t) => {
            const l = t.replace("{dish}", o.dish);
            return l.charAt(0).toUpperCase() + l.slice(1);
          })
        : [content.product("banh_mi").recipe.ask.replace("{dish}", o.dish)];
      expect(allowed).toContain(o.ask);
    }
    a.socket.disconnect();
  });

  it("AI tuỳ chọn: không chờ AI, kho nạp ngầm, câu bẩn/dài bị loại, lỗi thì dùng câu dữ liệu", async () => {
    const ai = app.get(VoiceAiService);
    ai.setGenerator(null);
    expect(ai.line("k", "tình huống", "câu dữ liệu", [], () => 0.9)).toBe("câu dữ liệu");

    let calls = 0;
    ai.setGenerator(async () => {
      calls++;
      return ["Ngon xỉu, mai ghé tiếp nha", "ngon vl", "x".repeat(200), "hai\ndòng"];
    });
    // Lần đầu: kho trống → trả câu dữ liệu ngay, nạp ngầm.
    expect(ai.line("hs:thanks", "tình huống", "câu dữ liệu", ["mẫu"], () => 0.9)).toBe(
      "câu dữ liệu",
    );
    await new Promise((r) => setTimeout(r, 20));
    // rand ≥ 0.5 → lấy từ kho AI; chỉ câu sạch còn lại.
    expect(ai.line("hs:thanks", "tình huống", "câu dữ liệu", ["mẫu"], () => 0.9)).toBe(
      "Ngon xỉu, mai ghé tiếp nha",
    );
    expect(ai.line("hs:thanks", "tình huống", "câu dữ liệu", ["mẫu"], () => 0.1)).toBe(
      "câu dữ liệu",
    );
    expect(calls).toBeGreaterThanOrEqual(1);

    ai.setGenerator(async () => {
      throw new Error("mạng lỗi");
    });
    expect(ai.line("lỗi", "tình huống", "câu dữ liệu", [], () => 0.9)).toBe("câu dữ liệu");
    await new Promise((r) => setTimeout(r, 20));
    expect(ai.line("lỗi", "tình huống", "câu dữ liệu", [], () => 0.9)).toBe("câu dữ liệu");
    ai.setGenerator(null);
    expect(clean("Ổn áp nha")).toBe(true);
    expect(clean("đm chờ lâu")).toBe(false);
  });
});
