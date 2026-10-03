import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import {
  deliverySurcharge,
  overrideWeather,
  upcomingWeather,
  weatherAt,
  weatherDemand,
  weatherPlan,
} from "./weather.js";

const W = content.data.weather;
const START = content.economy.dayStartMinute;
const END = content.economy.dayEndMinute;

describe("thời tiết (UC-B4, DESIGN §8)", () => {
  it("cùng xóm, cùng ngày → cùng thời tiết; phủ kín ngày, các khối nối liền", () => {
    const a = weatherPlan(W, START, END, "xom-a", 3);
    expect(weatherPlan(W, START, END, "xom-a", 3)).toEqual(a);
    expect(a[0]?.from).toBe(START);
    expect(a[a.length - 1]?.to).toBe(END);
    for (let i = 1; i < a.length; i++) {
      expect(a[i]?.from).toBe(a[i - 1]?.to);
      expect(a[i]?.kind).not.toBe(a[i - 1]?.kind);
    }
  });

  it("nhiều ngày thì có đủ 4 kiểu trời; mưa hay vào buổi chiều hơn buổi sáng", () => {
    const seen = new Set<string>();
    let rainMorning = 0;
    let rainAfternoon = 0;
    for (let day = 1; day <= 200; day++) {
      const plan = weatherPlan(W, START, END, "xom", day);
      for (const s of plan) seen.add(s.kind);
      const wet = (m: number) => ["rain", "storm"].includes(weatherAt(plan, m).kind);
      if (wet(7 * 60)) rainMorning++;
      if (wet(15 * 60)) rainAfternoon++;
    }
    expect([...seen].sort()).toEqual(["cloudy", "rain", "storm", "sunny"]);
    expect(rainAfternoon).toBeGreaterThan(rainMorning);
  });

  it("mưa: xe đẩy ngoài trời vắng khách, tiệm có mái đông hơn; nắng: đồ uống bán chạy", () => {
    const rain = content.weatherKind("rain");
    const sunny = content.weatherKind("sunny");
    const storm = content.weatherKind("storm");
    expect(weatherDemand(rain, "cart", "breakfast")).toBeLessThan(1);
    expect(weatherDemand(rain, "house", "breakfast")).toBeGreaterThan(1);
    // Sạp có mái (docs/BANDO.md bước C): mưa vẫn bán như trong nhà.
    expect(weatherDemand(rain, "stall", "breakfast")).toBe(
      weatherDemand(rain, "house", "breakfast"),
    );
    expect(weatherDemand(storm, "cart", "drink")).toBeLessThan(
      weatherDemand(rain, "cart", "drink"),
    );
    expect(weatherDemand(sunny, "cart", "drink")).toBeGreaterThan(1);
    expect(weatherDemand(sunny, "cart", "accessory")).toBe(1);
  });

  it("bão: giao hàng có phụ phí (tròn 500đ) và xe chạy chậm", () => {
    const storm = content.weatherKind("storm");
    expect(deliverySurcharge(storm, 12_000)).toBe(6_000);
    expect(deliverySurcharge(content.weatherKind("sunny"), 12_000)).toBe(0);
    expect(storm.delivery.speed).toBeLessThan(1);
  });

  it("báo trước khi trời sắp đổi trong khoảng dự báo, quá xa thì chưa báo", () => {
    const plan = [
      { from: 360, to: 840, kind: "sunny" as const },
      { from: 840, to: 1320, kind: "rain" as const },
    ];
    expect(upcomingWeather(plan, 700, 90)).toBeNull();
    expect(upcomingWeather(plan, 760, 90)).toMatchObject({ kind: "rain", from: 840 });
    expect(upcomingWeather(plan, 900, 90)).toBeNull();
  });

  it("đè khoảng mưa lớn lên kế hoạch: cắt khối cũ, gộp khối trùng kiểu", () => {
    const plan = [
      { from: 360, to: 600, kind: "sunny" as const },
      { from: 600, to: 1320, kind: "cloudy" as const },
    ];
    const out = overrideWeather(plan, { from: 500, to: 700, kind: "storm" });
    expect(out).toEqual([
      { from: 360, to: 500, kind: "sunny" },
      { from: 500, to: 700, kind: "storm" },
      { from: 700, to: 1320, kind: "cloudy" },
    ]);
    expect(weatherAt(out, 650).kind).toBe("storm");
    expect(overrideWeather(out, { from: 400, to: 500, kind: "sunny" })[0]).toEqual({
      from: 360,
      to: 500,
      kind: "sunny",
    });
  });
});
