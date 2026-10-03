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
function runStaff(equipment, lot, person, level = 1) {
  const lv = content.data.shopLevels.find((l) => l.level === level) ?? content.data.shopLevels[0];
  const team = content.data.staff.people.slice(0, lv.maxStaff);
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
      ...(level > 1 ? { team, boost: lv.trafficMul } : {}),
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

// Chỗ bán của mọi mẫu khu (bản đồ mở, docs/BANDO.md) — mỗi mẫu mở một lần ở phía của nó.
const STEP = { east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] };
const allLots = content.lotsIn(
  content.data.chunks.map((c) => ({ chunkId: c.id, gx: STEP[c.side][0], gz: STEP[c.side][1] })),
);

const rows = [];
for (const equipment of content.data.equipment)
  for (const lot of allLots)
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

// Tiệm lớn (cấp cao nhất) đủ nhân viên (docs/IA.md bước E): thu nhập do nhân viên vẫn phải có trần — chủ tự nhập hàng mỗi
// ngày, trả lương từng người, tiền nâng cấp. Bậc tiến trình cao nhất: trần 8 lần làm thuê (xe đẩy 5, tiệm 6,5).
const top = content.data.shopLevels.at(-1);
console.log(
  `\n🏢 ${top.name} (cấp ${top.level}, ${top.maxStaff} nhân viên, khách ×${top.trafficMul}):`,
);
for (const e of content.data.equipment) {
  const best = houses
    .map((lot) => runStaff(e, lot, content.data.staff.people[0], top.level))
    .reduce((a, b) => (b.profitPerDay > a.profitPerDay ? b : a));
  const payback = Math.ceil(
    content.data.shopLevels.reduce((n, l) => n + l.upgradeCost, 0) / Math.max(1, best.profitPerDay),
  );
  console.log(
    `  ${e.id.padEnd(15)} ${k(best.profitPerDay).padStart(6)}/ngày ở ${best.lot} · ${best.servedPerDay} món · hoàn vốn nâng cấp ~${payback} ngày`,
  );
  if (best.profitPerDay > wage * 8)
    warnings.push(
      `${e.id}: tiệm lớn đủ nhân viên lãi quá cao (${k(best.profitPerDay)}/ngày) — thu nhập thụ động`,
    );
  if (best.profitPerDay <= 0)
    warnings.push(`${e.id}: tiệm lớn đủ nhân viên vẫn lỗ — nâng cấp vô ích`);
}

const vua = content.data.equipment.map((e) =>
  Math.max(
    ...rows
      .filter((r) => r.equipment === e.id && r.serveSec === SPEEDS.vua)
      .map((r) => r.profitPerDay),
  ),
);
if (Math.max(...vua) > Math.min(...vua) * 2.5)
  warnings.push("Chênh lệch giữa các nghề > 2,5 lần — người chơi sẽ dồn vào một nghề");
// Thưởng (UC-P4): chỉ có khi làm thật, nhiệm vụ mỗi ngày một lần, thành tựu một lần — phải là "tiền boa" nhỏ,
// không thành nguồn thu: tối đa 10% một ngày làm thuê rẻ nhất; tổng thành tựu ≤ 1 ngày lãi xe đẩy tay vừa tốt nhất.
const questMoney = content.data.dailyQuests.reduce((n, q) => n + q.reward.money, 0);
const achMoney = content.data.achievements.reduce((n, a) => n + a.reward.money, 0);
console.log(
  `\n🎁 Thưởng: nhiệm vụ hằng ngày tối đa ${k(questMoney)}/ngày · thành tựu tổng ${k(achMoney)} (một lần)`,
);
if (questMoney > Math.min(...wages) * 0.1)
  warnings.push(
    `nhiệm vụ hằng ngày thưởng quá nhiều (${k(questMoney)}/ngày, > 10% làm thuê ${k(Math.min(...wages))})`,
  );
if (achMoney > Math.max(...vua))
  warnings.push(`tổng thưởng thành tựu (${k(achMoney)}) hơn một ngày lãi tốt nhất`);
// Mua đứt ô đất (docs/BANDO.md bước D): mục tiêu dài hạn — hoàn vốn bằng tiền thuê tiết kiệm được phải từ 20 tới 120 ngày.
const land = content.economy.land;
for (const lot of allLots.filter((l) => l.kind === "stall")) {
  const price = lot.rentPerDay * land.priceDays;
  const saved = lot.rentPerDay - land.taxPerDay;
  const payback = Math.ceil(price / Math.max(1, saved));
  console.log(
    `🏷️ Mua ${lot.id}: ${k(price)} · tiết kiệm ${k(saved)}/ngày · hoàn vốn ~${payback} ngày`,
  );
  if (payback < 20) warnings.push(`mua ô ${lot.id} hoàn vốn quá nhanh (${payback} ngày)`);
  if (payback > 120)
    warnings.push(`mua ô ${lot.id} hoàn vốn quá lâu (${payback} ngày) — không ai mua`);
}
console.log(warnings.length ? `\n⚠ ${warnings.join("\n⚠ ")}` : "\n✔ Không có cảnh báo cân bằng");
console.log(`\nChi tiết: tools/balance/out/strategies.csv (${rows.length} chiến lược)`);
