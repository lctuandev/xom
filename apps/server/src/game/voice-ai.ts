import { Injectable, Logger } from "@nestjs/common";
import { content } from "@xom/content";
import { maskText } from "@xom/sim";

/** Mỗi tình huống giữ tối đa bấy nhiêu câu AI. */
const POOL = 12;
/** Trần số lần gọi API mỗi giờ (cả server) — làm một mình, không để hoá đơn bất ngờ. */
const MAX_PER_HOUR = 30;
const TIMEOUT_MS = 8000;
const MODEL = "claude-haiku-4-5";

export type Generator = (situation: string, examples: string[]) => Promise<string[]>;

/**
 * Lớp AI tuỳ chọn cho thoại NPC (#12, UC-D6). Chỉ bật khi có `ANTHROPIC_API_KEY`.
 * Không bao giờ chờ AI: `line()` trả ngay câu dữ liệu hoặc câu AI đã có sẵn trong kho; kho thiếu thì nạp ngầm.
 * Câu AI phải qua lọc (một dòng, ≤ 120 ký tự, không từ tục nặng) mới được dùng; lỗi/hết lượt thì chỉ dùng dữ liệu.
 */
@Injectable()
export class VoiceAiService {
  private readonly logger = new Logger("VoiceAi");
  private readonly pools = new Map<string, string[]>();
  private readonly filling = new Set<string>();
  private calls: number[] = [];
  private generator: Generator | null;

  constructor() {
    const key = process.env.ANTHROPIC_API_KEY;
    this.generator = key ? (s, ex) => this.callApi(key, s, ex) : null;
  }

  /** Test/dev: thay bộ sinh câu (null = tắt AI). */
  setGenerator(g: Generator | null) {
    this.generator = g;
  }

  get enabled() {
    return this.generator !== null;
  }

  /**
   * Câu cho một tình huống (`key`, vd. "hoc_sinh:thanks"): nửa câu dữ liệu, nửa câu AI (nếu kho có).
   * `situation` mô tả cho AI; `examples` là câu dữ liệu làm mẫu giọng.
   */
  line(key: string, situation: string, fallback: string, examples: string[], rand: () => number) {
    if (!this.generator) return fallback;
    const pool = this.pools.get(key) ?? [];
    if (pool.length < POOL / 2) this.fill(key, situation, examples);
    if (!pool.length || rand() < 0.5) return fallback;
    return pool[Math.floor(rand() * pool.length)] ?? fallback;
  }

  /** Nạp kho ngầm (một lượt mỗi tình huống, có trần mỗi giờ). */
  private fill(key: string, situation: string, examples: string[]) {
    if (this.filling.has(key) || !this.generator) return;
    const now = Date.now();
    this.calls = this.calls.filter((t) => now - t < 3_600_000);
    if (this.calls.length >= MAX_PER_HOUR) return;
    this.calls.push(now);
    this.filling.add(key);
    void this.generator(situation, examples)
      .then((lines) => {
        const ok = lines.map((l) => l.trim()).filter((l) => clean(l));
        const pool = [...(this.pools.get(key) ?? []), ...ok];
        this.pools.set(key, pool.slice(-POOL));
      })
      .catch((err) => this.logger.warn(`không sinh được thoại ${key}: ${err}`))
      .finally(() => this.filling.delete(key));
  }

  /** Gọi Messages API (fetch thẳng, không thêm thư viện). */
  private async callApi(key: string, situation: string, examples: string[]): Promise<string[]> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 600,
          system:
            "Bạn viết lời thoại ngắn cho NPC trong game mô phỏng xóm nhỏ ở Việt Nam. " +
            "Giọng đời thường, tự nhiên; giới trẻ dùng teencode/Gen Z, đôi khi hơi suồng sã nhưng KHÔNG chửi thề nặng, " +
            "không xúc phạm, không chính trị, không nhắc thương hiệu có thật. Mỗi câu một dòng, tối đa 100 ký tự. " +
            'Chỉ trả về một mảng JSON các chuỗi, ví dụ ["câu 1","câu 2"].',
          messages: [
            {
              role: "user",
              content: `Tình huống: ${situation}\nVài câu mẫu cùng giọng:\n${examples.map((e) => `- ${e}`).join("\n")}\nViết 8 câu mới khác mẫu.`,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = body.content?.find((c) => c.type === "text")?.text ?? "[]";
      const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
      const parsed: unknown = JSON.parse(json || "[]");
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } finally {
      clearTimeout(t);
    }
  }
}

/** Câu AI dùng được: một dòng, không quá dài, không dính từ tục nặng (danh sách che của sổ đánh giá). */
export function clean(line: string): boolean {
  if (!line || line.length > 120 || /[\n{}<>]/.test(line)) return false;
  return maskText(line, content.data.reviews.banned) === line;
}
