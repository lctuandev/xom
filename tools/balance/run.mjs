// Mô phỏng headless N ngày cho mọi chiến lược để cân bằng kinh tế (docs/PLAN.md, docs/USECASES.md).
// Mô hình "làm thật": khách tới theo customerArrivals; người chơi làm món mất `serveSec` giây thật / đơn
// (1 giây thật = 1 phút game), hàng chờ tối đa queueSize; khách không được phục vụ thì bỏ đi.
// Thời tiết tính theo kế hoạch trời tất định mỗi ngày (như server).
// Chạy: pnpm balance [số ngày]   → bảng tóm tắt + out/strategies.csv
import { mkdirSync, writeFileSync } from "node:fs";
import { content } from "@xom/content";
import {
  baseSpec,
  congestion,
  customerArrivals,
  dishCost,
  LOST_WEIGHT,
  nextReputation,
  passengerWait,
  rideDestinations,
  rideFare,
  rideFuel,
  routeSpeed,
  staffShift,
  weatherAt,
  weatherDemand,
  weatherPlan,
} from "@xom/sim";

const DAYS = Number(process.argv[2] ?? 30);
const eco = content.economy;
const PRICE_MULT = [0.85, 1, 1.15, 1.3];
/** Tốc độ tay: giây thật cho một đơn (làm món + tính tiền). */
const SPEEDS = { nhanh: 15, vua: 25, cham: 40 };
/** Hao hụt nguyên liệu tươi mua theo gói (bỏ cuối ngày). */
const WASTE = 0.15;

function runStrategy(equipment, lot, mult, serveSec) {
  const product = content.product(equipment.products[0]);
  const recipe = product.recipe;
  // Trung bình theo độ phổ biến các món.
  const pop = recipe.variants.reduce((s, v) => s + v.popularity, 0);
  const avgRef = recipe.variants.reduce((s, v) => s + v.refPrice * v.popularity, 0) / pop;
  const avgCost =
    recipe.variants.reduce(
      (s, v) => s + dishCost(content, recipe, baseSpec(recipe, v.id)) * v.popularity,
      0,
    ) / pop;
  // Tiệm (nhà mặt tiền): khách chịu giá cao hơn → các mức giá thử tính trên giá hợp lý của chỗ đó.
  const price = avgRef * mult * lot.priceTolerance;
  let reputation = eco.startingReputation;
  let carry = 0;
  let money = 0;
  let served = 0;
  let lost = 0;
  const tick = eco.economyTickMinutes;
  const perTick = tick / serveSec; // số đơn làm được mỗi nhịp (1 phút game = 1 giây thật)
  for (let day = 1; day <= DAYS; day++) {
    // Chỗ tiêu cố định mỗi ngày (Luật 2.2): thuê chỗ + phí chợ/thuế; tiệm còn trả điện nước theo giờ mở cửa.
    money -= lot.rentPerDay + eco.fees.daily[lot.kind];
    if (lot.kind === "house")
      money -= (eco.fees.utilitiesPerHour * (eco.dayEndMinute - eco.dayStartMinute)) / 60;
    // Thời tiết thật của ngày (UC-B4): mưa bão xe đẩy vắng khách, tiệm có mái đông hơn.
    const sky = weatherPlan(
      content.data.weather,
      eco.dayStartMinute,
      eco.dayEndMinute,
      "balance",
      day,
    );
    let queue = 0;
    let work = 0;
    for (let m = eco.dayStartMinute; m < eco.dayEndMinute; m += tick) {
      const [r] = customerArrivals({
        content,
        day,
        minuteOfDay: m,
        minutes: tick,
        shops: [
          {
            id: "s",
            productId: product.id,
            lotId: lot.id,
            priceRatio: mult * lot.priceTolerance,
            reputation,
            boost: weatherDemand(
              content.weatherKind(weatherAt(sky, m).kind),
              lot.kind,
              product.category,
            ),
            demandCarry: carry,
          },
        ],
      });
      carry = r.demandCarry;
      const room = Math.max(0, equipment.queueSize - queue);
      const joined = Math.min(room, r.arrivals);
      const walked = r.arrivals - joined;
      queue += joined;
      work += perTick;
      const done = Math.min(queue, Math.floor(work));
      work -= done;
      if (queue === 0) work = Math.min(work, 1);
      queue -= done;
      served += done;
      lost += walked;
      // Mỗi món bán làm xe mòn: tiền sửa chia đều theo món.
      const repairPerServe =
        equipment.price * eco.maintenance.wearPerServe * eco.maintenance.repairRate;
      money += done * (price - avgCost * (1 + WASTE) - repairPerServe);
      // Khách được phục vụ hài lòng theo giá; khách bỏ đi kéo uy tín xuống.
      const sat = Math.max(0, Math.min(1, 1 - (mult - 1) * 1.2)) * 0.4 + 0.6;
      reputation = nextReputation(
        reputation,
        done ? sat : 0,
        done + walked * LOST_WEIGHT,
        eco.reputationRate,
      );
    }
    lost += queue;
  }
  return {
    equipment: equipment.id,
    lot: lot.id,
    priceMult: mult,
    serveSec,
    profitPerDay: Math.round(money / DAYS),
    servedPerDay: Math.round(served / DAYS),
    lostPerDay: Math.round(lost / DAYS),
    reputation: Math.round(reputation * 100) / 100,
    paybackDays: money > 0 ? Math.ceil(equipment.price / (money / DAYS)) : null,
  };
}

/**
 * Tiệm có nhân viên đứng cả ngày (UC-M6): nhân viên bán theo sức tay, chủ trả lương giờ + tiền nhà + điện nước + thuế.
 * Kho đủ hàng (chủ nhập mỗi sáng), giá = giá hợp lý của chỗ đó.
 */
function runStaff(equipment, lot, person) {
  const product = content.product(equipment.products[0]);
  const recipe = product.recipe;
  const menu = recipe.variants.map((v) => ({
    variantId: v.id,
    price: Math.round((v.refPrice * lot.priceTolerance) / 1000) * 1000,
  }));
  const stock = new Map(content.data.ingredients.map((i) => [i.id, 1e6]));
  const pop = recipe.variants.reduce((s, v) => s + v.popularity, 0);
  const avgCost =
    recipe.variants.reduce(
      (s, v) => s + dishCost(content, recipe, baseSpec(recipe, v.id)) * v.popularity,
      0,
    ) / pop;
  let money = 0;
  let carry = 0;
  let served = 0;
  for (let day = 1; day <= DAYS; day++) {
    money -=
      lot.rentPerDay +
      eco.fees.daily.house +
      (eco.fees.utilitiesPerHour * (eco.dayEndMinute - eco.dayStartMinute)) / 60;
    const r = staffShift({
      content,
      staff: person,
      productId: product.id,
      lotId: lot.id,
      menu,
      stock,
      reputation: eco.startingReputation,
      priceRatio: lot.priceTolerance,
      day,
      fromMinute: eco.dayStartMinute,
      toMinute: eco.dayEndMinute,
      demandCarry: carry,
      seed: `${equipment.id}:${lot.id}`,
    });
    carry = r.demandCarry;
    served += r.served + r.wrong;
    money += r.revenue - (r.served + r.wrong) * avgCost * (1 + WASTE) - r.wages;
  }
  return {
    equipment: equipment.id,
    lot: lot.id,
    staff: person.id,
    profitPerDay: Math.round(money / DAYS),
    servedPerDay: Math.round(served / DAYS),
  };
}

const rows = [];
for (const equipment of content.data.equipment)
  for (const lot of content.data.lots)
    for (const mult of PRICE_MULT)
      for (const serveSec of Object.values(SPEEDS))
        rows.push(runStrategy(equipment, lot, mult, serveSec));

mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
const header = Object.keys(rows[0]);
writeFileSync(
  new URL("./out/strategies.csv", import.meta.url),
  [header.join(","), ...rows.map((r) => header.map((h) => r[h] ?? "").join(","))].join("\n"),
);

const k = (n) => `${Math.round(n / 1000)}k`;
const hours = (eco.dayEndMinute - eco.dayStartMinute) / 60;
const wages = content.data.jobs.map((j) => j.wagePerHour * hours);
const wage = Math.max(...wages);
console.log(
  `\n${DAYS} ngày · làm thuê cả ngày ≈ ${k(Math.min(...wages))}–${k(wage)}/ngày (chưa tính thưởng việc vặt)\n`,
);
console.log(
  "Nghề            | Tay    | Tốt nhất (chỗ · giá)          | Lãi/ngày | Phục vụ | Hụt | Hoàn vốn",
);
const warnings = [];
for (const equipment of content.data.equipment) {
  for (const [name, sec] of Object.entries(SPEEDS)) {
    const mine = rows.filter((r) => r.equipment === equipment.id && r.serveSec === sec);
    const best = mine.reduce((a, b) => (b.profitPerDay > a.profitPerDay ? b : a));
    console.log(
      `${equipment.id.padEnd(15)} | ${name.padEnd(6)} | ${`${best.lot} · ×${best.priceMult}`.padEnd(29)} | ${k(best.profitPerDay).padStart(8)} | ${String(best.servedPerDay).padStart(7)} | ${String(best.lostPerDay).padStart(3)} | ${String(best.paybackDays ?? "∞").padStart(4)} ng`,
    );
    if (name === "vua" && best.profitPerDay < wage)
      warnings.push(
        `${equipment.id}: tay vừa, chỗ tốt nhất (${k(best.profitPerDay)}) còn thua làm thuê (${k(wage)})`,
      );
    // Trần lãi theo bậc tiến trình: xe đẩy ≤ 5 lần làm thuê; tiệm (đã bỏ vốn cọc + giấy tờ, chi phí cố định cao) ≤ 6,5 lần.
    const cap = wage * (content.lot(best.lot).kind === "house" ? 6.5 : 5);
    if (name === "nhanh" && best.profitPerDay > cap)
      warnings.push(
        `${equipment.id}: tay nhanh lãi quá cao (${k(best.profitPerDay)}/ngày ở ${best.lot}, trần ${k(cap)})`,
      );
    const carts = mine.filter((r) => content.lot(r.lot).kind === "cart");
    const bestCart = carts.reduce((a, b) => (b.profitPerDay > a.profitPerDay ? b : a));
    if (name === "nhanh" && bestCart.profitPerDay > wage * 5)
      warnings.push(
        `${equipment.id}: xe đẩy tay nhanh lãi quá cao (${k(bestCart.profitPerDay)}/ngày)`,
      );
  }
}
// Tiệm (nhà mặt tiền) phải là bước tiến so với xe đẩy (DESIGN: xe đẩy → tiệm → tiệm lớn); nhân viên đỡ tay chứ không hơn chủ.
const houses = content.data.lots.filter((l) => l.kind === "house");
const staffRows = content.data.equipment.flatMap((e) =>
  houses.flatMap((lot) => content.data.staff.people.map((p) => runStaff(e, lot, p))),
);
console.log(
  "\nTiệm (nhà mặt tiền) | Tự bán tay vừa | Xe đẩy tốt nhất | Nhân viên cả ngày (tốt nhất · tệ nhất)",
);
for (const e of content.data.equipment) {
  const vuaRows = rows.filter((r) => r.equipment === e.id && r.serveSec === SPEEDS.vua);
  const isHouse = (r) => content.lot(r.lot).kind === "house";
  const bestHouse = vuaRows
    .filter(isHouse)
    .reduce((a, b) => (b.profitPerDay > a.profitPerDay ? b : a));
  const bestCart = vuaRows
    .filter((r) => !isHouse(r))
    .reduce((a, b) => (b.profitPerDay > a.profitPerDay ? b : a));
  const mine = staffRows.filter((r) => r.equipment === e.id);
  const top = mine.reduce((a, b) => (b.profitPerDay > a.profitPerDay ? b : a));
  const low = mine.reduce((a, b) => (b.profitPerDay < a.profitPerDay ? b : a));
  console.log(
    `${e.id.padEnd(19)} | ${`${k(bestHouse.profitPerDay)} ${bestHouse.lot}`.padEnd(14)} | ${`${k(bestCart.profitPerDay)} ${bestCart.lot}`.padEnd(15)} | ${k(top.profitPerDay)} ${top.staff}@${top.lot} · ${k(low.profitPerDay)} ${low.staff}@${low.lot}`,
  );
  if (bestHouse.profitPerDay <= bestCart.profitPerDay)
    warnings.push(
      `${e.id}: tiệm tự bán (${k(bestHouse.profitPerDay)}) không hơn xe đẩy tốt nhất (${k(bestCart.profitPerDay)}) — thuê nhà vô ích`,
    );
  if (top.profitPerDay <= 0)
    warnings.push(`${e.id}: thuê nhân viên cả ngày ở tiệm nào cũng lỗ (${k(top.profitPerDay)})`);
  for (const r of mine) {
    // Nhân viên không được hơn chủ tay nhanh tự đứng bán cùng chỗ, cùng giá.
    const self = rows.find(
      (x) =>
        x.equipment === e.id && x.lot === r.lot && x.priceMult === 1 && x.serveSec === SPEEDS.nhanh,
    );
    if (self && r.profitPerDay > self.profitPerDay)
      warnings.push(
        `${e.id}: ${r.staff} bán thay ở ${r.lot} (${k(r.profitPerDay)}) lãi hơn chủ tay nhanh tự bán (${k(self.profitPerDay)}) — thu nhập thụ động`,
      );
  }
}

// 🛵 Xe ôm (UC-N1): thuê xe cả ngày, chờ khách (ngã tư đông thì nhanh), chở theo giá chuẩn, trả xăng đi + về.
// Đậu đâu cũng đón được → cuốc sau đón ngay chỗ vừa thả khách. 1 giây thật = 1 phút game.
function runRides() {
  const r = content.data.rides;
  const station = content.place(r.stationPlaceId).position;
  let money = 0;
  let trips = 0;
  for (let day = 1; day <= DAYS; day++) {
    money -= r.bikeRentPerDay;
    let at = station;
    let m = eco.dayStartMinute;
    let k = 0;
    while (true) {
      m += passengerWait(content, m) + 3; // chờ khách + trả giá, chọn đường, thu tiền (thao tác thật)
      const dests = rideDestinations(content, at);
      const d = dests[(day * 7 + k++ * 13) % dests.length];
      if (!d) break;
      const meters = Math.hypot(d.x - at.x, d.z - at.z) * 1.3; // đường vòng theo phố
      const minutes = meters / routeSpeed(content, "road", congestion(content, m), false);
      if (m + minutes > eco.dayEndMinute) break;
      m += minutes;
      const tip = (r.tip.four[0] + r.tip.four[1]) / 4; // ~nửa số khách boa mức 4 sao
      money += rideFare(content, meters) + tip - rideFuel(content, meters);
      trips++;
      at = d;
    }
  }
  return { profitPerDay: Math.round(money / DAYS), tripsPerDay: Math.round(trips / DAYS) };
}
const ride = runRides();
console.log(
  `\n🛵 Xe ôm: ~${ride.tripsPerDay} cuốc/ngày · lãi ${k(ride.profitPerDay)}/ngày (đã trừ thuê xe ${k(content.data.rides.bikeRentPerDay)} + xăng)`,
);
if (ride.profitPerDay < Math.min(...wages) * 0.8)
  warnings.push(
    `xe ôm (${k(ride.profitPerDay)}) thua xa làm thuê (${k(Math.min(...wages))}) — không ai chạy`,
  );
if (ride.profitPerDay > wage * 3)
  warnings.push(`xe ôm lãi quá cao (${k(ride.profitPerDay)}/ngày, > 3 lần làm thuê)`);

const vua = content.data.equipment.map((e) =>
  Math.max(
    ...rows
      .filter((r) => r.equipment === e.id && r.serveSec === SPEEDS.vua)
      .map((r) => r.profitPerDay),
  ),
);
if (Math.max(...vua) > Math.min(...vua) * 2.5)
  warnings.push("Chênh lệch giữa các nghề > 2,5 lần — người chơi sẽ dồn vào một nghề");
console.log(warnings.length ? `\n⚠ ${warnings.join("\n⚠ ")}` : "\n✔ Không có cảnh báo cân bằng");
console.log(`\nChi tiết: tools/balance/out/strategies.csv (${rows.length} chiến lược)`);
