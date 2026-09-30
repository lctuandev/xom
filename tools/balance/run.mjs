// Mô phỏng headless N ngày cho mọi chiến lược để cân bằng kinh tế (docs/PLAN.md, docs/USECASES.md).
// Mô hình "làm thật": khách tới theo customerArrivals; người chơi làm món mất `serveSec` giây thật / đơn
// (1 giây thật = 1 phút game), hàng chờ tối đa queueSize; khách không được phục vụ thì bỏ đi.
// Chạy: pnpm balance [số ngày]   → bảng tóm tắt + out/strategies.csv
import { mkdirSync, writeFileSync } from "node:fs";
import { content } from "@xom/content";
import { baseSpec, customerArrivals, dishCost, LOST_WEIGHT, nextReputation } from "@xom/sim";

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
  const price = avgRef * mult;
  let reputation = eco.startingReputation;
  let carry = 0;
  let money = 0;
  let served = 0;
  let lost = 0;
  const tick = eco.economyTickMinutes;
  const perTick = tick / serveSec; // số đơn làm được mỗi nhịp (1 phút game = 1 giây thật)
  for (let day = 1; day <= DAYS; day++) {
    money -= lot.rentPerDay;
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
            priceRatio: mult,
            reputation,
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
      money += done * (price - avgCost * (1 + WASTE));
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
    if (name === "nhanh" && best.profitPerDay > wage * 5)
      warnings.push(`${equipment.id}: tay nhanh lãi quá cao (${k(best.profitPerDay)}/ngày)`);
  }
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
console.log(warnings.length ? `\n⚠ ${warnings.join("\n⚠ ")}` : "\n✔ Không có cảnh báo cân bằng");
console.log(`\nChi tiết: tools/balance/out/strategies.csv (${rows.length} chiến lược)`);
