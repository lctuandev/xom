import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import { weekdayTraffic } from "./economy.js";
import {
  canHost,
  chanceIn,
  dailyEvents,
  eventCategoryDemand,
  hostCost,
  weeklyEvents,
} from "./events.js";
import { generateOrder } from "./recipe.js";
import { seededRandom } from "./time.js";

const EVENTS = content.data.events;

describe("sự kiện bằng dữ liệu (DESIGN §9)", () => {
  it("mưa lớn toàn xóm: tất định theo (xóm, ngày), đúng khung giờ, khoảng 15% số ngày", () => {
    expect(dailyEvents(EVENTS, "xom", 7)).toEqual(dailyEvents(EVENTS, "xom", 7));
    let hits = 0;
    for (let day = 1; day <= 400; day++) {
      for (const e of dailyEvents(EVENTS, "xom", day)) {
        const def = content.event(e.eventId);
        if (def.trigger.kind !== "daily") throw new Error("chỉ sự kiện theo ngày");
        expect(e.from).toBeGreaterThanOrEqual(def.trigger.from);
        expect(e.to).toBeLessThanOrEqual(def.trigger.to);
        expect(e.to - e.from).toBe(def.minutes);
        hits++;
      }
    }
    expect(hits / 400).toBeGreaterThan(0.08);
    expect(hits / 400).toBeLessThan(0.25);
  });

  it("khai trương: tốn tiền pháo/bong bóng/băng rôn (money sink), phải chờ giữa hai lần", () => {
    const def = content.event("khai_truong");
    expect(hostCost(def)).toBe(100_000);
    expect(canHost(def, null, 1)).toBeNull();
    expect(canHost(def, 1, 2)).toMatch(/2 ngày nữa/);
    expect(canHost(def, 1, 4)).toBeNull();
    expect(canHost(content.event("khach_vip"), null, 1)).not.toBeNull();
  });

  it("tỉ lệ theo giờ đổi ra xác suất trong một nhịp", () => {
    expect(chanceIn(0, 5)).toBe(0);
    expect(chanceIn(0.35, 5)).toBeCloseTo(0.0287, 3);
    expect(chanceIn(60, 60)).toBeGreaterThan(0.99);
  });

  it("khách VIP dặn ít nhất 2 yêu cầu riêng", () => {
    const recipe = content.product("banh_mi").recipe;
    const menu = recipe.variants.map((v) => ({ variantId: v.id, price: v.refPrice }));
    for (let i = 0; i < 30; i++) {
      const o = generateOrder(recipe, menu, seededRandom("vip", i), undefined, 2);
      const mods = recipe.mods.filter((m) => o?.dish.includes(m.say));
      expect(mods.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("lịch tuần (THEGIOI §2)", () => {
  it("chợ đêm chỉ diễn ra thứ Bảy, từ 18:00 tới 22:00", () => {
    const sat = content.weekday(6);
    expect(sat.name).toBe("Thứ Bảy");
    expect(weeklyEvents(content.data.events, sat.index)).toEqual([
      { eventId: "cho_dem", from: 18 * 60, to: 22 * 60 },
    ]);
    expect(weeklyEvents(content.data.events, content.weekday(1).index)).toEqual([]);
  });

  it("chợ đêm tăng khách đồ uống, không đụng sửa xe", () => {
    expect(eventCategoryDemand(content, ["cho_dem"], "drink")).toBeGreaterThan(1.5);
    expect(eventCategoryDemand(content, ["cho_dem"], "repair")).toBe(1);
    expect(eventCategoryDemand(content, [], "drink")).toBe(1);
  });

  it("cuối tuần cổng trường vắng, trong hẻm đông; ngày thường như cũ", () => {
    expect(weekdayTraffic(content, 6, "school")).toBeLessThan(1);
    expect(weekdayTraffic(content, 7, "residential")).toBeGreaterThan(1);
    expect(weekdayTraffic(content, 3, "school")).toBe(1);
  });
});
