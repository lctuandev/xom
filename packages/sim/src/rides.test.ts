import { content } from "@xom/content";
import { describe, expect, it } from "vitest";
import { Grid } from "./grid.js";
import {
  congestion,
  haggleChance,
  passengerWait,
  ROUTE_WEIGHTS,
  rideDestinations,
  rideFare,
  rideFuel,
  rideStars,
  rideTip,
  routeSpeed,
} from "./rides.js";

const station = content.place(content.data.rides.stationPlaceId).position;

describe("xe ôm + kẹt xe (KIENTRUC §4–5)", () => {
  it("kẹt cứng giờ cao điểm (7:00, 18:00), vắng giữa trưa / khuya", () => {
    expect(congestion(content, 7 * 60)).toBeGreaterThan(0.9);
    expect(congestion(content, 18 * 60)).toBeGreaterThan(0.9);
    expect(congestion(content, 13 * 60)).toBeLessThan(0.1);
    expect(passengerWait(content, 18 * 60)).toBeLessThan(passengerWait(content, 13 * 60));
  });

  it("đường lớn nhanh lúc vắng, giờ cao điểm chui hẻm lẹ hơn; mưa thì hẻm trơn", () => {
    expect(routeSpeed(content, "road", 0, false)).toBeGreaterThan(
      routeSpeed(content, "alley", 0, false),
    );
    expect(routeSpeed(content, "road", 1, false)).toBeLessThan(
      routeSpeed(content, "alley", 1, false),
    );
    expect(routeSpeed(content, "alley", 0, true)).toBeLessThan(
      routeSpeed(content, "alley", 0, false),
    );
  });

  it("giá theo quãng đường (chẵn nghìn), xăng tính cả lượt về, nói thách thì khách bỏ đi", () => {
    expect(rideFare(content, 50)).toBe(16_000);
    expect(rideFare(content, 50) % 1000).toBe(0);
    expect(rideFuel(content, 50)).toBe(1_000);
    expect(haggleChance(content, 0.9, false)).toBe(1);
    expect(haggleChance(content, 1, false)).toBe(1);
    expect(haggleChance(content, 1.25, false)).toBeCloseTo(0.65);
    expect(haggleChance(content, 1.6, false)).toBeCloseTo(0.16);
    expect(haggleChance(content, 1.6, true)).toBeGreaterThan(haggleChance(content, 1.6, false));
  });

  it("sao theo thời gian so với mong đợi; hẻm lúc mưa trừ sao; boa theo sao", () => {
    expect(rideStars(content, { meters: 55, ms: 7_000, route: "road", wet: false })).toBe(5);
    expect(rideStars(content, { meters: 55, ms: 12_000, route: "road", wet: false })).toBe(3);
    expect(rideStars(content, { meters: 55, ms: 7_000, route: "alley", wet: true })).toBe(4);
    expect(rideStars(content, { meters: 55, ms: 60_000, route: "road", wet: false })).toBe(1);
    const tip = rideTip(content, 5, () => 0.5);
    expect(tip % 1000).toBe(0);
    expect(tip).toBeGreaterThanOrEqual(2_000);
    expect(rideTip(content, 3, () => 0.5)).toBe(0);
  });

  it("nơi tới đủ xa trạm; tìm đường theo loại đường: đi hẻm thì có đi qua ô hẻm", () => {
    const dests = rideDestinations(content, station);
    expect(dests.length).toBeGreaterThan(10);
    for (const d of dests)
      expect(Math.hypot(d.x - station.x, d.z - station.z)).toBeGreaterThanOrEqual(
        content.data.rides.minMeters,
      );
    const grid = new Grid(content.data.map);
    // Từ hàng nhà phía trên xuống hàng nhà phía dưới qua khu giữa (có hẻm ở x = 0).
    const from = { x: 0, z: -9 };
    const to = { x: 0, z: 13 };
    const alley = grid.path(from, to, ROUTE_WEIGHTS.alley);
    const road = grid.path(from, to, ROUTE_WEIGHTS.road);
    expect(Grid.length(from, alley)).toBeGreaterThan(0);
    expect(Grid.length(from, road)).toBeGreaterThanOrEqual(Grid.length(from, alley) - 0.01);
  });
});
