import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import { trustAfter } from "./contracts.js";
import {
  adMultiplier,
  disputeVerdict,
  gigDeposit,
  gigFee,
  photoMoments,
  photoQuality,
  shotScore,
} from "./gigs.js";

const p = content.data.gigs.photo;

describe("việc người chơi đăng (1.20b)", () => {
  it("phí ghi sổ 5% (tối thiểu 2k), cọc 20%, làm tròn nghìn", () => {
    expect(gigFee(content, 100_000)).toBe(5000);
    expect(gigFee(content, 20_000)).toBe(content.data.gigs.feeMin);
    expect(gigDeposit(content, 100_000)).toBe(20_000);
    expect(gigDeposit(content, 60_000) % 1000).toBe(0);
  });

  it("khiếu nại thua bị trừ tin cậy", () => {
    expect(trustAfter(content, 50, "dispute_lost")).toBe(50 - content.data.gigs.disputeLostTrust);
  });
});

describe("📸 buổi chụp", () => {
  const moments = photoMoments(content, "test", 1);

  it("khoảnh khắc cố định theo seed, đủ số lượng, tăng dần, nằm trong buổi chụp, không sát nhau", () => {
    expect(photoMoments(content, "test", 1)).toEqual(moments);
    expect(moments).toHaveLength(p.moments);
    for (const [i, m] of moments.entries()) {
      expect(m.at).toBeGreaterThan(1000);
      expect(m.at).toBeLessThan(p.sessionMs - 500);
      expect(m.kind).toBeGreaterThanOrEqual(0);
      expect(m.kind).toBeLessThan(p.kinds.length);
      const prev = moments[i - 1];
      if (prev) expect(m.at - prev.at).toBeGreaterThan(p.perfectMs * 2);
    }
  });

  it("bấm đúng lúc 100 điểm, lệch dần thì ít điểm, lệch quá thì 0", () => {
    const m = moments[2]?.at ?? 0;
    expect(shotScore(content, moments, m)).toBe(100);
    expect(shotScore(content, moments, m + p.perfectMs)).toBe(100);
    const mid = shotScore(content, moments, m + (p.perfectMs + p.windowMs) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    expect(shotScore(content, [{ at: 5000, kind: 0 }], 5000 + p.windowMs + 1)).toBe(0);
  });

  it("chất lượng = trung bình các tấm đẹp nhất; thiếu tấm tính 0", () => {
    expect(photoQuality(content, [100, 10, 90, 80, 0])).toBe(90);
    expect(photoQuality(content, [90])).toBe(Math.round(90 / p.keep));
  });

  it("ảnh đẹp đăng nhóm xóm kéo nhiều khách hơn; phân xử theo chuẩn", () => {
    expect(adMultiplier(content, 100)).toBeCloseTo(1 + p.adBoost);
    expect(adMultiplier(content, 0)).toBe(1);
    expect(adMultiplier(content, 80)).toBeGreaterThan(adMultiplier(content, 40));
    expect(disputeVerdict(content, p.passQuality)).toBe("taker");
    expect(disputeVerdict(content, p.passQuality - 1)).toBe("poster");
  });
});
