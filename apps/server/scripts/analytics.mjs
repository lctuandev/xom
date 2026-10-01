// Báo cáo đo lường (docs/DESIGN.md §16): người chơi hằng ngày, thời lượng phiên, giữ chân, nơi bỏ cuộc,
// nghề được chọn, tiền kiếm/tiêu theo lý do. Đọc thẳng Postgres (bảng GameEvent, LedgerEntry…), không cần dashboard.
//   pnpm analytics                 (dev: DATABASE_URL trong .env)
//   DATABASE_URL=… pnpm analytics  (production)
import pg from "pg";

try {
  process.loadEnvFile("../../.env");
} catch {}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const vnd = (n) => `${Number(n).toLocaleString("vi-VN")}đ`;
const line = (s = "") => console.log(s);

line("=== XÓM — báo cáo đo lường ===");
const [{ players }] = await q(`select count(*)::int players from "Player"`);
const [{ week }] = await q(
  `select count(*)::int week from "GameEvent" where type='register' and "createdAt" > now() - interval '7 days'`,
);
line(`Người chơi: ${players} (mới 7 ngày: ${week})`);

line("\n— Người chơi mỗi ngày (DAU, 7 ngày) —");
for (const r of await q(
  `select to_char(date_trunc('day',"createdAt"),'YYYY-MM-DD') d, count(distinct "playerId")::int n
     from "GameEvent" where type='session_start' and "createdAt" > now() - interval '7 days'
     group by 1 order by 1`,
))
  line(`${r.d}  ${"█".repeat(Math.min(40, r.n))} ${r.n}`);
const [{ mau }] = await q(
  `select count(distinct "playerId")::int mau from "GameEvent" where type='session_start' and "createdAt" > now() - interval '30 days'`,
);
line(`MAU (30 ngày): ${mau}`);

const [s] = await q(
  `select count(*)::int n, coalesce(avg((payload->>'ms')::numeric)/60000,0)::numeric(10,1) avg
     from "GameEvent" where type='session_end' and "createdAt" > now() - interval '7 days'`,
);
line(`Phiên (7 ngày): ${s.n} · trung bình ${s.avg} phút`);

line("\n— Giữ chân (người đăng ký ≥ N ngày trước, có quay lại vào ngày N) —");
for (const n of [1, 7, 30]) {
  const [r] = await q(
    `with reg as (select "playerId", "createdAt"::date d from "GameEvent" where type='register' and "createdAt" < now() - ($1 || ' days')::interval)
     select count(*)::int total,
            count(*) filter (where exists (select 1 from "GameEvent" e where e."playerId"=reg."playerId"
              and e.type='session_start' and e."createdAt"::date = reg.d + $1::int))::int back
       from reg`,
    [String(n)],
  );
  line(`D${n}: ${r.total ? Math.round((r.back / r.total) * 100) : 0}% (${r.back}/${r.total})`);
}

line("\n— Nơi bỏ cuộc: bước kịch bản của người chơi không vào 3 ngày —");
for (const r of await q(
  `select p.tutorial step, count(*)::int n from "Player" p
    where not exists (select 1 from "GameEvent" e where e."playerId"=p.id and e.type='session_start' and e."createdAt" > now() - interval '3 days')
    group by 1 order by 2 desc limit 12`,
))
  line(`${r.step.padEnd(18)} ${r.n}`);

line("\n— Nghề được chọn —");
for (const r of await q(
  `select "productId" p, count(*)::int n from "Business" group by 1 order by 2 desc`,
))
  line(`${r.p.padEnd(12)} ${r.n} quầy`);
for (const r of await q(
  `select payload->>'jobId' j, payload->>'role' r, count(*)::int n from "GameEvent" where type='job_start' group by 1,2 order by 3 desc`,
))
  line(`làm thuê ${r.j}/${r.r}: ${r.n} ca`);

line("\n— Tiền theo lý do (ví người chơi, 7 ngày) —");
for (const r of await q(
  `select le.reason, sum(case when le.amount>0 then le.amount else 0 end) earned,
          sum(case when le.amount<0 then -le.amount else 0 end) spent
     from "LedgerEntry" le join "Wallet" w on w.id=le."walletId"
    where w.kind='PLAYER' and le."createdAt" > now() - interval '7 days'
    group by 1 order by 2 desc, 3 desc`,
))
  line(
    `${r.reason.padEnd(16)} vào ${vnd(r.earned).padStart(14)}   ra ${vnd(r.spent).padStart(14)}`,
  );

await db.end();
