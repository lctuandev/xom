// Mô phỏng headless N ngày cho mọi chiến lược (nghề × chỗ × giá × lượng nhập) để cân bằng kinh tế.
// Chạy: pnpm balance [số ngày]   → in bảng tóm tắt + ghi out/strategies.csv
// Giả định: 1 người chơi, không đối thủ, mở quầy từ đầu ngày tới khi hết hàng hoặc hết ngày.
import { mkdirSync, writeFileSync } from "node:fs";
import { content } from "@xom/content";
import { LOST_WEIGHT, marketPrice, nextReputation, simulateTick } from "@xom/sim";

const DAYS = Number(process.argv[2] ?? 30);
const eco = content.economy;
const STOCKS = [10, 20, 30, 45, 60, 90];
const PRICE_MULT = [0.85, 1, 1.15, 1.3, 1.6];

function runStrategy(equipment, lot, priceMult, stockPerDay) {
  const product = content.product(equipment.products[0]);
  const perishable = content.template(product.template).perishable;
  const price = Math.round((product.refPrice * priceMult) / 1000) * 1000;
  let reputation = eco.startingReputation;
  let carry = 0;
  let stock = 0;
  let money = 0;
  let served = 0;
  let lost = 0;
  let spoiled = 0;
  for (let day = 1; day <= DAYS; day++) {
    const buy = perishable ? stockPerDay : Math.max(0, stockPerDay - stock);
    money -= buy * marketPrice(product, day, eco.marketPriceSwing) + lot.rentPerDay;
    stock += buy;
    for (
      let m = eco.dayStartMinute;
      m < eco.dayEndMinute && stock > 0;
      m += eco.economyTickMinutes
    ) {
      const [r] = simulateTick({
        content,
        day,
        minuteOfDay: m,
        minutes: eco.economyTickMinutes,
        shops: [
          {
            id: "s",
            productId: product.id,
            lotId: lot.id,
            price,
            reputation,
            stock,
            capacityPerHour: equipment.capacityPerHour,
            demandCarry: carry,
          },
        ],
      });
      const miss = r.lostStock + r.lostCapacity;
      reputation = nextReputation(
        reputation,
        r.satisfaction,
        r.sold + miss * LOST_WEIGHT,
        eco.reputationRate,
      );
      carry = r.demandCarry;
      stock -= r.sold;
      money += r.sold * price;
      served += r.sold;
      lost += miss;
    }
    if (perishable) {
      spoiled += stock;
      stock = 0;
    }
  }
  return {
    equipment: equipment.id,
    lot: lot.id,
    price,
    stockPerDay,
    profitPerDay: Math.round(money / DAYS),
    servedPerDay: Math.round(served / DAYS),
    lostPerDay: Math.round(lost / DAYS),
    spoiledPerDay: Math.round(spoiled / DAYS),
    reputation: Math.round(reputation * 100) / 100,
    paybackDays: money > 0 ? Math.ceil(equipment.price / (money / DAYS)) : null,
  };
}

const rows = [];
for (const equipment of content.data.equipment) {
  for (const lot of content.data.lots) {
    for (const mult of PRICE_MULT) {
      for (const s of STOCKS) rows.push(runStrategy(equipment, lot, mult, s));
    }
  }
}

mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
const header = Object.keys(rows[0]);
writeFileSync(
  new URL("./out/strategies.csv", import.meta.url),
  [header.join(","), ...rows.map((r) => header.map((h) => r[h] ?? "").join(","))].join("\n"),
);

const vnd = (n) => `${Math.round(n / 1000)}k`;
const wage =
  Math.max(...content.data.jobs.map((j) => j.wagePerHour)) *
  ((eco.dayEndMinute - eco.dayStartMinute) / 60);
console.log(`\n${DAYS} ngày · mốc so sánh: đi làm thuê cả ngày ≈ ${vnd(wage)}/ngày\n`);
console.log(
  "Nghề            | Tốt nhất (chỗ · giá · nhập)            | Lãi/ngày | Hoàn vốn | Tệ nhất/ngày",
);
for (const equipment of content.data.equipment) {
  const mine = rows.filter((r) => r.equipment === equipment.id);
  const best = mine.reduce((a, b) => (b.profitPerDay > a.profitPerDay ? b : a));
  const worst = mine.reduce((a, b) => (b.profitPerDay < a.profitPerDay ? b : a));
  console.log(
    `${equipment.id.padEnd(15)} | ${`${best.lot} · ${vnd(best.price)} · ${best.stockPerDay}`.padEnd(38)} | ${vnd(best.profitPerDay).padStart(8)} | ${String(best.paybackDays ?? "∞").padStart(6)} ng | ${vnd(worst.profitPerDay)}`,
  );
}

// Cảnh báo cân bằng.
const warnings = [];
for (const equipment of content.data.equipment) {
  const best = Math.max(
    ...rows.filter((r) => r.equipment === equipment.id).map((r) => r.profitPerDay),
  );
  if (best < wage)
    warnings.push(
      `${equipment.id}: chiến lược tốt nhất (${vnd(best)}) còn thua đi làm thuê (${vnd(wage)})`,
    );
  if (best > wage * 5)
    warnings.push(`${equipment.id}: lãi quá cao (${vnd(best)}/ngày) — dễ phá kinh tế`);
}
const bests = content.data.equipment.map((e) =>
  Math.max(...rows.filter((r) => r.equipment === e.id).map((r) => r.profitPerDay)),
);
if (Math.max(...bests) > Math.min(...bests) * 2.5)
  warnings.push("Chênh lệch giữa các nghề > 2,5 lần — người chơi sẽ dồn vào một nghề");
console.log(warnings.length ? `\n⚠ ${warnings.join("\n⚠ ")}` : "\n✔ Không có cảnh báo cân bằng");
console.log(`\nChi tiết: tools/balance/out/strategies.csv (${rows.length} chiến lược)`);
