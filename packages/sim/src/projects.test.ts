import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import { canPropose, feeToFund, projectDemand, tallyVotes } from "./projects.js";

describe("quỹ xóm + công trình", () => {
  const byId = (id: string) => {
    const p = content.data.projects.find((x) => x.id === id);
    if (!p) throw new Error(id);
    return p;
  };
  it("công trình xong thì khách ở chỗ bán liên quan ghé nhiều hơn, nhân dồn", () => {
    expect(projectDemand(content, new Set(), "cuoi_pho")).toBe(1);
    expect(projectDemand(content, new Set(["cau_tre"]), "cuoi_pho")).toBeCloseTo(1.35);
    expect(projectDemand(content, new Set(["cau_tre", "cau_be_tong"]), "cuoi_pho")).toBeCloseTo(
      1.35 * 1.2,
    );
    expect(projectDemand(content, new Set(["cau_tre"]), "dau_hem")).toBe(1);
  });
  it("đề xuất: phải có công trình tiên quyết, không trùng cái đang làm/đã xong", () => {
    expect(canPropose(byId("cau_be_tong"), new Set(), new Set())).toMatch(/trước đó/);
    expect(canPropose(byId("cau_be_tong"), new Set(["cau_tre"]), new Set())).toBeNull();
    expect(canPropose(byId("cau_tre"), new Set(["cau_tre"]), new Set())).toMatch(/xong rồi/);
    expect(canPropose(byId("lat_hem_12"), new Set(), new Set(["lat_hem_12"]))).toMatch(/đang/);
  });
  it("bỏ phiếu: thuận phải nhiều hơn chống", () => {
    expect(tallyVotes({ a: true })).toEqual({ yes: 1, no: 0, passed: true });
    expect(tallyVotes({ a: true, b: false })).toMatchObject({ passed: false });
    expect(tallyVotes({ a: true, b: true, c: false })).toMatchObject({ passed: true });
    expect(tallyVotes({})).toMatchObject({ passed: false });
  });
  it("phần phí chợ vào quỹ", () => {
    expect(feeToFund(5_000, 0.6)).toBe(3_000);
    expect(feeToFund(15_000, content.data.fund.feeShare)).toBe(9_000);
  });
});
