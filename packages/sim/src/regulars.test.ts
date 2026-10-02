import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import {
  afterDisappointed,
  afterServed,
  pickResident,
  type ResidentMemory,
  regularGreeting,
  regularStage,
} from "./regulars.js";
import { seededRandom } from "./time.js";

describe("khách quen (KIENTRUC §1)", () => {
  const none = new Map<string, ResidentMemory>();

  it("khách vãng lai không có tên; học sinh là một cư dân học sinh", () => {
    expect(pickResident(content, "khach_vang_lai", "drink", none, Math.random)).toBeNull();
    const id = pickResident(content, "hoc_sinh", "drink", none, seededRandom("r", 1));
    expect(content.data.residents.find((r) => r.id === id)?.archetype).toBe("hoc_sinh");
  });

  it("khách quen ❤️ hay quay lại quầy mình hơn", () => {
    const mem = new Map<string, ResidentMemory>([["ba_tu", { visits: 8, regular: true }]]);
    let tu = 0;
    for (let i = 0; i < 400; i++)
      if (pickResident(content, "co_chu", "repair", mem, seededRandom("x", i)) === "ba_tu") tu++;
    // 8 cô chú: bình thường ~1/8; khách quen ×3 → khoảng 1/4.
    expect(tu / 400).toBeGreaterThan(0.18);
  });

  it("lần thứ 5 thành khách quen; khách quen thì mở lời 'như mọi khi'", () => {
    const r = content.data.regulars;
    expect(afterServed(content, { visits: r.regularAt - 2, regular: false }).becameRegular).toBe(
      false,
    );
    expect(afterServed(content, { visits: r.regularAt - 1, regular: false })).toEqual({
      visits: r.regularAt,
      becameRegular: true,
    });
    expect(regularStage(content, 1, false)).toBe("new");
    expect(regularStage(content, r.greetAt, false)).toBe("returning");
    expect(r.usual).toContain(regularGreeting(content, "regular", seededRandom("g", 1)));
    expect(regularGreeting(content, "new", Math.random)).toBe("");
  });

  it("làm sai liên tiếp thì khách quen giận, mất ❤️", () => {
    const once = afterDisappointed(content, { visits: 7, regular: true, streak: 0 });
    expect(once).toMatchObject({ lostRegular: false, streak: 1 });
    const twice = afterDisappointed(content, { visits: 7, regular: true, streak: once.streak });
    expect(twice.lostRegular).toBe(true);
    expect(twice.visits).toBeLessThan(content.data.regulars.regularAt);
  });
});
