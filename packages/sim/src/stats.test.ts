import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import {
  achievementProgress,
  type Contender,
  type DayStat,
  marketShare,
  priceMoves,
  profitOf,
  xomAverage,
  xomAwards,
} from "./stats.js";

const day = (d: number, p: Partial<DayStat> = {}): DayStat => ({
  day: d,
  revenue: 0,
  tips: 0,
  wages: 0,
  stockCost: 0,
  rent: 0,
  fees: 0,
  served: 0,
  ...p,
});
const who = (id: string, p: Partial<Contender>): Contender => ({
  playerId: id,
  name: id,
  productId: "banh_mi",
  days: [],
  rating: { avg: 0, count: 0 },
  friendly: 0,
  ...p,
});

describe("bảng giải của xóm", () => {
  const an = who("An", {
    days: [
      day(8, { revenue: 900_000, served: 50, stockCost: 300_000 }),
      day(10, { revenue: 400_000, served: 20 }),
    ],
    rating: { avg: 4.8, count: 5 },
  });
  const binh = who("Bình", {
    days: [day(9, { revenue: 200_000, served: 12 }), day(10, { wages: 120_000 })],
    rating: { avg: 5, count: 2 },
    friendly: 7,
  });
  const cu = who("Cũ", { days: [day(1, { revenue: 9_000_000, served: 500 })] });
  const rows = xomAwards(content.data.awards, [an, binh, cu], 10);
  const top = (id: string) => rows.find((r) => r.id === id)?.entries.map((e) => e.name);

  it("chỉ tính 7 ngày gần nhất — người chơi lâu không thắng mãi", () => {
    expect(top("doanh_nhan")).toEqual(["An", "Bình"]);
  });
  it("mỗi hạng mục một kiểu người chơi", () => {
    expect(top("cham_lam")).toEqual(["Bình"]);
    expect(top("than_thien")).toEqual(["Bình"]);
    // Bình mới 2 đánh giá → chưa đủ để xếp "được tin nhất".
    expect(top("duoc_tin")).toEqual(["An"]);
  });
  it("lãi = doanh thu − tiền hàng − thuê − phí", () => {
    expect(
      profitOf(
        day(1, { revenue: 100_000, tips: 5_000, stockCost: 40_000, rent: 25_000, fees: 5_000 }),
      ),
    ).toBe(35_000);
  });
  it("thị phần theo món", () => {
    const [bm] = marketShare(
      [an, binh, who("Chi", { productId: "tra_sua", days: [day(10, { served: 5 })] })],
      10,
    );
    expect(bm?.productId).toBe("banh_mi");
    expect(bm?.entries.map((e) => [e.name, e.share])).toEqual([
      ["An", 0.85],
      ["Bình", 0.15],
    ]);
  });
  it("trung bình quầy cùng món", () => {
    expect(xomAverage([an, binh], "banh_mi", 10)).toEqual({
      stalls: 2,
      revenue: 500_000,
      served: 27,
      rating: 4.9,
    });
  });
});

describe("thành tựu + tin giá", () => {
  it("tiến độ không vượt mục tiêu", () => {
    const list = achievementProgress(content.data.achievements, {
      served: 150,
      revenue: 0,
      wages: 0,
      five_stars: 0,
      replies: 0,
      events: 0,
      level: 1,
      friends: 0,
    });
    expect(list.find((a) => a.id === "khoi_nghiep")).toMatchObject({ value: 100, done: true });
    expect(list.find((a) => a.id === "tay_to")).toMatchObject({ value: 150, done: false });
  });
  it("giá nguyên liệu nhích mạnh mới thành tin", () => {
    for (const m of priceMoves(content, 5, 480))
      expect(Math.abs(m.change)).toBeGreaterThanOrEqual(0.08);
    expect(priceMoves(content, 1, 480)).toEqual([]);
  });
});
