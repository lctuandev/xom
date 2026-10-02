import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import { checkMix, laborBudget, mixOrder, mixTarget, siteOf } from "./crew.js";

const c = content.data.crew;

describe("🏗️ phụ hồ", () => {
  it("lệnh trộn cố định theo seed, số bao trong khoảng, đúng loại vữa", () => {
    const o = mixOrder(content, "p", 1);
    expect(mixOrder(content, "p", 1)).toEqual(o);
    expect(o.bags).toBeGreaterThanOrEqual(c.bags[0]);
    expect(o.bags).toBeLessThanOrEqual(c.bags[1]);
    expect(c.mixes.some((m) => m.id === o.mixId)).toBe(true);
  });

  it("vữa xây 2 bao = 18 thùng cát + 40 lít nước (định mức 1:9)", () => {
    expect(mixTarget(content, { mixId: "vua_xay", bags: 2 })).toEqual({
      cement: 2,
      sand: 18,
      water: 40,
    });
  });

  it("trộn đúng thì đạt; nước lệch ít vẫn đạt; sai xi măng / cát / nước nhiều thì báo lỗi", () => {
    const o = { mixId: "vua_trat", bags: 2 };
    expect(checkMix(content, o, { cement: 2, sand: 16, water: 40 })).toEqual([]);
    expect(checkMix(content, o, { cement: 2, sand: 16, water: 44 })).toEqual([]);
    expect(checkMix(content, o, { cement: 3, sand: 16, water: 40 })).toHaveLength(1);
    expect(checkMix(content, o, { cement: 2, sand: 18, water: 40 })[0]).toContain("cát");
    expect(checkMix(content, o, { cement: 2, sand: 16, water: 60 })[0]).toContain("nhão");
    expect(checkMix(content, o, { cement: 2, sand: 16, water: 20 })[0]).toContain("khô");
  });

  it("khoản nhân công = 25% chi phí; công trường cạnh chỗ bán liên quan", () => {
    expect(laborBudget(content, 600_000)).toBe(150_000);
    const p = content.data.projects[0];
    if (!p) throw new Error("không có công trình");
    const s = siteOf(content, p);
    const lot = content.lot(p.demand.lots[0] ?? "").position;
    expect(Math.hypot(s.x - lot.x, s.z - lot.z)).toBeLessThan(6);
  });
});
