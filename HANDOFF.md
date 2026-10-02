# XÓM — Bản hand-off (đọc đầu tiên khi mở phiên mới)

> Cập nhật: 2026-10-03 · Làm ở máy local (repo `/home/lctuan/Documents/GameOnline`), `main` = `05ca6e6` (đã push).
> Đọc kèm: `CLAUDE.md` (quy tắc bắt buộc), `docs/FEATURES.md` (bảng trạng thái), `docs/USECASES.md` (use case), `docs/IA.md`
> (tổ chức chức năng), `docs/DESIGN.md`, `docs/KIENTRUC.md`, `docs/NGHE.md`, `docs/THEGIOI.md`, `docs/ADMIN.md`.
> Quy trình git đã chốt: **không commit thẳng `main`** — mỗi việc một nhánh, push nhánh, test xanh + deploy :5555 rồi
> `git merge --no-ff <nhánh>` vào `main` và push (máy không có `gh`/token nên không tạo trang PR).

---

## 0. TRẠNG THÁI NGAY LÚC BÀN GIAO (việc đang dở)

### 0.1 Các nhánh chưa merge vào `main` (merge theo đúng thứ tự)
| # | Nhánh | Ở đâu | Nội dung | Trạng thái |
|---|-------|-------|----------|-----------|
| 1 | `fix/xom-moi-ban-menu` (`2ff82f3`) | đã push; thư mục chính `GameOnline` đang checkout nhánh này | Xóm chung + sửa mời bạn, nút Menu không nền, ghim trái/phải, bỏ neo ⚙️, nút ‹ Quay lại, Chú Bảy không bắt chuyện lại | lint/typecheck/unit xanh; e2e server xanh (84/84 lúc chạy cả bộ); Playwright 9 spec liên quan xanh (Pixel 7); **đã deploy :5555**; **lượt Playwright toàn bộ (Pixel 7) đang chạy** → log `/tmp/claude-1000/xom-logs/pw-all.log` (lúc bàn giao: 14 bài ✓, chưa có ✘). Xong thì `git merge --no-ff fix/xom-moi-ban-menu` vào `main`. |
| 2 | `feat/danh-gia-tung-tiem` (`37359bf`, `dc2fa92` + commit phần thưởng/HANDOFF này) | **worktree `/home/lctuan/Documents/GameOnline-B`**, tách từ nhánh 1 | (a) Đánh giá riêng từng cửa hàng, (b) nhiều cửa hàng chạy cùng lúc, (c) thưởng thành tựu + nhiệm vụ hằng ngày | e2e server `reviews` 2/2, `rewards` 1/1, `stats` xanh; 2 migration mới **đã áp vào DB dev**; **chưa chạy Playwright**, chưa deploy, phần thưởng còn thiếu docs/Playwright (xem 0.2). |

Worktree cũ `/home/lctuan/Documents/GameOnline-A` (nhánh `feat/nut-ngu-canh`, tách ở `c182eb3`): định gom `ActionBar` về một nút
ngữ cảnh — **chưa viết code**, có thể xoá worktree. Nhánh art `feat/phong-cach-toon` (toon + viền đen kiểu Happy Citizens) đang tạm dừng.

### 0.2 Làm tiếp ngay (theo thứ tự)
1. Xem `/tmp/claude-1000/xom-logs/pw-all.log`: hết ✘ (hoặc sửa xong) → merge nhánh 1 vào `main`, push.
2. Ở worktree B, hoàn tất phần thưởng (code đã commit cùng HANDOFF này): file mới `apps/server/src/game/rewards.ts`,
   `apps/server/test/rewards.e2e-spec.ts`, `apps/web/game/ui/Rewards.tsx`, migration `20261003100000_rewards_claimed`; sửa content
   `rewardSchema`/`dailyQuests`/`achievements[].reward`, shared `QuestView`/`RewardView`/`rewardClaimSchema`/`quest:list`/
   `reward:claim`, `stats.ts`, `xom.gateway.ts`, `game.module.ts`, `BoardSheet.tsx` (Achievements), `HubSheets.tsx` (DailyQuests).
   **Còn thiếu:** dòng FEATURES.md + use case **UC-P4** trong USECASES.md (test đã ghi tên UC-P4), Playwright cho nút 🎁 Nhận
   (gợi ý: spec mới `thuong` — bán 5 món rồi nhận thưởng nhiệm vụ "Bán 5 món" + thành tựu "Mở hàng"), chạy `pnpm balance` (4.1).
3. Ở B: `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @xom/server test:e2e`; rồi chạy dev bằng code của B (tắt dev ở
   thư mục chính, `GAME_TICK_MS=250 pnpm dev` trong B — hoặc merge B vào nhánh chính rồi chạy) và Playwright `nhieu-cua-hang` (đã
   thêm bước: đi về quầy bánh mì → tự chuyển cửa hàng → mở lại quầy), `mua-cua-nhau` (đánh giá theo cửa hàng), `khi-vang`,
   `menu-chinh`.
4. Push B, `pnpm deploy:local`, merge `--no-ff` vào `main` sau nhánh 1. Xoá worktree A/B khi xong (`git worktree remove`).

### 0.3 Lưu ý môi trường lúc bàn giao
- Dev đang chạy nền ở thư mục chính (`GAME_TICK_MS=250 pnpm dev`, log `/tmp/claude-1000/xom-logs/dev.log`) với code nhánh 1.
- DB dev dùng chung cho mọi worktree: đã có cột `Review.businessId` + `Player.rewardsClaimed` (migration của B). Code nhánh 1
  vẫn chạy được với DB này (cột mới cho phép null / có mặc định).
- Production :5555 đang chạy bản nhánh 1 (chưa có 2 migration của B — `pnpm deploy:local` sẽ tự áp).
- Tắt dev: `ss -ltnp | grep -E ':500[01] '` lấy pid rồi `kill` (đừng `pkill -f` — khớp luôn shell của mình).

---

## 1. Bắt đầu / kiểm tra ở máy local

```bash
docker compose up -d            # Postgres 5432 (xom/xom/xom) + Redis 6379 (máy khởi động lại thì phải chạy lại)
pnpm install
pnpm --filter @xom/server exec prisma migrate dev --config prisma7.config.ts
pnpm --filter @xom/server exec prisma generate --config prisma7.config.ts
GAME_TICK_MS=250 pnpm dev       # web :5000 + server :5001
```
Kiểm tra trước khi coi là xong một việc (CLAUDE.md):
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @xom/server test:e2e
cd apps/web && npx playwright test <spec> --project=pixel-7     # cần dev đang chạy với GAME_TICK_MS=250
pnpm balance                 # khi đổi số liệu tiền trong packages/content
pnpm deploy:local            # build Docker + deploy http://localhost:5555 (chờ health check)
```
Mẹo đã gặp:
- Đổi `packages/content` / `packages/shared` → `pnpm --filter @xom/<pkg> build` và **khởi động lại dev**. Sửa file server khi
  Playwright đang chạy sẽ làm Nest tự khởi động lại giữa bài → làm việc song song thì dùng worktree riêng.
- Worktree mới: copy `.env` (+ `apps/server/.env`), `pnpm install --frozen-lockfile`, `prisma generate`; `next typegen` chưa chạy
  thì `tsc` web báo thiếu `PageProps/LayoutProps` (bỏ qua, `pnpm typecheck` tự chạy typegen).
- Prisma `migrate dev` không chạy được khi thêm cột bắt buộc ở chế độ không tương tác → viết tay `migration.sql` rồi `migrate deploy`.
- e2e server: `GAME_TICK_MS=10` (100 phút game/giây), rate limit 20 intent/giây; đăng ký test mặc định `solo: true` (xóm riêng),
  `register(url, name, { xom })` để vào xóm của người khác.
- Playwright: `register()` tự tick "Lập xóm riêng" (kịch bản ổn định); link mời `/play?xom=…` thì vào thẳng xóm được mời.
  Mở chức năng bằng `openFeature(page, id)`; hook dev `window.xomDebug.{send, walk, clock}`.
- Pre-commit hook chạy lint + typecheck (commit lỗi format thì `pnpm format` rồi commit lại).

## 2. Đã xong (gần đây — chi tiết ở FEATURES.md / USECASES.md)

**Trên `main` (`05ca6e6`):** tổ chức lại chức năng (mỗi chức năng một sheet, ☰ Menu lưới icon 5 nhóm, `docs/IA.md` bước A–E):
server tách miền (`BusinessRepo`, `PaymentService`, `Broadcast`, `BankService`, `NeedsService`, `MarketService`,
`BusinessService`, gateway business/trade/work/xom/debug + `IntentRunner`); 📊 Sổ sách thu–chi theo khoản; nhiều cửa hàng + kho
riêng từng tiệm + chuyển kho 30 phút game (UC-F14); cấp tiệm 1–3 + nhiều nhân viên (UC-M9); chủ tự do khi có nhân viên trong ca
(`ownerTied`); đòi tiền nhà hẹn theo ngày (UC-F13); cân bằng kinh tế (xe ôm, tiệm lớn); tắt server sạch.

**Nhánh 1 `fix/xom-moi-ban-menu`:**
- Mời bạn (UC-J1): đăng ký từ link `/play?xom=` vào thẳng xóm bạn; nút 📨 Mời bạn không có Web Share/clipboard (mở qua http IP
  LAN) thì chép bằng `execCommand` hoặc hiện ô link để tự chép — đây là lý do "mời bạn không hoạt động".
- Xóm chung (UC-J7): không có link → vào xóm còn chỗ đông cư dân nhất; tick "Lập xóm riêng" → xóm mới; 40 cư dân / 30 online
  (`content.economy.xomResidents/xomOnline`); `xom:list` + mục "🏘️ Các xóm khác" (Dọn về); chuyển xóm kiểm **mọi** quầy đang mở.
- HUD: nút ☰ Menu là icon SVG không nền (`IconMenu`) + chữ "Menu" đè dưới + chấm kết nối; bỏ neo ⚙️ (Cài đặt chỉ trong Menu);
  **ghim icon cả trái lẫn phải** (mỗi bên 4; 📌 xoay vòng trái → phải → bỏ; `features/pins.ts` lưu `{left, right}`).
- Nút **‹ Quay lại** ở đầu sheet mở từ sheet khác / từ Menu (store `sheetBack`, `pushSheet`, `backSheet`;
  `openFeature(id, { from: "sheet" })`).
- Chú Bảy không bắt chuyện lại mỗi lần vào game: lời đã nghe nhớ trong localStorage `xom:seen-dialogues`; câu hỏi đầu có thêm
  "Con tự lo được, cảm ơn chú" (bỏ qua hướng dẫn).

**Nhánh 2 `feat/danh-gia-tung-tiem` (worktree B):**
- 📒 Đánh giá riêng từng cửa hàng: `Review.businessId` (migration `20261003090000_review_business` gắn đánh giá cũ vào cửa hàng
  cùng món), `review:list/write` nhận `businessId`, "đã mua" tính theo cửa hàng, trả lời gỡ uy tín đúng cửa hàng (UC-F11).
- 🏬 Nhiều cửa hàng chạy cùng lúc: lỗi do client chỉ coi là "đứng quầy" ở cửa hàng đang chọn → đứng ở quầy cửa hàng khác thì tự
  `biz:select` cửa hàng đó (toast "🏬 Đang ở … — quản lý cửa hàng này") (`scene/Places.tsx` ProximityWatcher, UC-F14).
- 🎁 Thưởng: thành tựu có `reward {xp, money}` nhận một lần; 4 nhiệm vụ hằng ngày (`content.dailyQuests`: bán 5, bán 20, làm thuê
  50k, có hàng xóm cùng chơi) server đếm từ `DailyReport` hôm nay, nhận mỗi ngày một lần; tiền qua sổ cái lý do `reward`, ghi
  `Player.rewardsClaimed` (`ach:<id>`, `q:<ngày>:<id>`, tự dọn ngày cũ > 7). UI: thẻ thành tựu + dòng nhiệm vụ có 🎁 phần thưởng
  và nút "🎁 Nhận".

## 3. Việc sẽ làm (theo thứ tự ưu tiên)

### 3.1 Góp ý đợt 2 của chủ dự án (2026-10-02) — còn lại
Tham khảo luồng game đã tìm: Township (đất chia ô, ô sau đắt hơn, mở khoá theo cấp/dân số), Bit City (mua ô đất rồi chọn loại
công trình, xây xong dân số tăng), thiết kế thành tựu (thưởng *chức năng* — mở khoá — giữ chân tốt hơn danh hiệu suông).
- [x] Mời bạn không hoạt động · [x] tăng giới hạn xóm + xóm chung · [x] Menu không nền + bỏ ⚙️ + ghim trái/phải ·
  [x] Chú Bảy · [x] nút Quay lại · [x] đánh giá từng cửa hàng · [x] nhiều cửa hàng cùng lúc · [~] thưởng (code xong, xem 0.2).
- [ ] **Quầy theo mặt hàng (tái cấu trúc sheet Quầy):** khi mở cửa hàng chọn luôn **thể loại hàng** (bánh mì, trà sữa…); bấm vào
  quầy nào thì sheet chỉ còn đúng việc của quầy đó: **nhập hàng của quầy** (đi chợ chỉ hiện nguyên liệu món đó), **thuê nhân
  viên**, **giá / thực đơn**, mở/đóng. Gom bớt dãy nút cuối sheet Quầy (`features/shop/Stall.tsx` + `GoToRow`) thành 3–4 thẻ to.
  Hiện "mua đồ nghề = mở cửa hàng" ở Vựa xe Ông Sáu — luồng mới: "🏪 Mở cửa hàng" → chọn thể loại → chọn đồ nghề hợp thể loại →
  chọn chỗ.
- [ ] **Bản đồ mở / xóm lớn dần (việc lớn — viết plan `docs/BANDO.md` trước, hỏi chủ dự án chốt):** ban đầu xóm chỉ có nhà NPC +
  **ô đất trống / nhà cho thuê**; người chơi đi làm thuê tới khi đủ tiền sắm sạp nhỏ, rồi **chọn ô đất để thuê hoặc tự xây** tiệm;
  mỗi người mở tiệm thì xóm mở rộng thêm ô (như Township); nâng cấp tiệm lên **nhà nhiều tầng** (gắn cấp tiệm 1–3 hiện có và
  nhánh art `feat/phong-cach-toon`). Hiện các lô (`content.lots`) và nhà mặt tiền (`nha_so_10`, `nha_so_24`) là hard-code →
  cần bảng `Plot` theo xóm (vị trí, loại: vỉa hè/đất/nhà, chủ, công trình, tầng), sinh ô mới theo số cư dân, xây = money sink lớn
  (vật liệu + phụ hồ người chơi), thuê nhà NPC giữ như UC-F12.
- [ ] **Tách nhỏ chức năng tiếp** (tránh conflict): `game.service.ts` còn ~1.200 dòng (tick, customerTick, me(), awayReport,
  xóm) → tách `CustomerService`, `RoomService` (load/unload/join/switch), `MeViewBuilder`; web `ActionBar.tsx` gom nút ngữ cảnh.
- [ ] Chấm đỏ trên icon 🏅/🎯 khi có thưởng chưa nhận (`useAlerts` trong `MainMenu.tsx`; cần thêm số thưởng chờ nhận vào `MeView`).

### 3.2 Backlog từ trước (vẫn còn)
- 🏘️ Xóm chung phần còn lại: **tên xóm**, **bảng tin xóm** (tin nhắn lưu + tin tự động "Lan vừa mở quầy trà sữa").
- 🏪 Nhiều cửa hàng phần còn lại: thuê **nhiều nhà mặt tiền** (hiện mỗi người một), **doanh thu theo từng cửa hàng** trong Sổ sách,
  📊 tổng quan các cửa hàng (doanh thu/lãi, nhân viên trong ca, tồn kho sắp hết, tiền nhà tới hạn).
- 🛋️ Nội thất riêng theo nghề (layout là dữ liệu `interiors[category]`: bánh mì tủ kính, trà sữa quầy pha chế + ghế cao, quán
  cơm bàn inox, sửa xe cầu nâng + kệ phụ tùng, tạp hoá kệ + thu ngân) — hiện `interior/ShopInterior.tsx` một mẫu chung.
- 🧍 Khách ra vào tiệm thấy được (cả khi nhân viên bán): server phát `shopTraffic` nhẹ → NPC vào/ra cửa, xếp hàng trong tiệm.
- 🛡️ Trang admin `/quan-tri` — plan đầy đủ ở `docs/ADMIN.md`.
- 🎨 Phong cách toon + viền đen (Happy Citizens) cho cảnh + UI; đô thị lớn dần qua công trình chung — nhánh `feat/phong-cach-toon`.
- Khác: tạp hoá + sổ nợ; cắt tóc + cá nhân hoá; ngày lễ/mùa; âm thanh CC0 + nhạc lo-fi; hình món SVG; đèn đỏ + model xe Blender;
  công trình xong hiện 3D; xe ôm hao mòn/mua xe riêng; thợ ảnh ảnh cưới; phụ hồ khiêng gạch; chủ nhà hiện 3D khi đòi tiền.

## 4. Issues / lưu ý đang biết

### 4.1 Cần xem
- **Thưởng là tiền vào ví** — CLAUDE.md: "tiền chỉ vào ví khi người chơi *làm*". Thưởng chỉ có khi làm thật (bán, làm thuê) và
  nhỏ/một lần, nhưng **chưa chạy `pnpm balance`** và chưa thêm vào công cụ cân bằng. Nhiệm vụ "Có hàng xóm cùng chơi" chỉ thưởng XP.
- Xóm chung: người chơi mới tự vào xóm đông → **tranh chỗ bán** (lô cố định) nhiều hơn; 40 cư dân/xóm là ước lượng, cần theo dõi
  bằng `pnpm analytics`. Người cũ vẫn ở xóm riêng cũ (muốn sang thì "Dọn về" trong 👥 Hàng xóm).
- Chuyển xóm khi đang có tiệm nhà mặt tiền: chưa kiểm hợp đồng thuê nhà ở xóm cũ (lô nhà cùng id ở xóm mới) — rà khi làm bản đồ mở.
- Nhiều cửa hàng: quầy **không có nhân viên** mà chủ đi sang quầy khác thì quầy cũ vẫn "mở" nhưng không có khách (đúng luật:
  chủ đứng một quầy một lúc) — cân nhắc tự đóng / nhắc chủ.
- Nhân viên chỉ tự mở cửa khi tới ca **và chủ online** (chủ offline thì `finishShift` bán nốt ca lúc thoát).
- Tiền nhà vẫn cộng dồn khi chủ offline (không tính trễ khi chưa hẹn; nợ vượt cọc vẫn bị dẹp tiệm).
- Thợ ảnh: khung ngắm canh theo khung hình — chưa thử trên điện thoại thật. Phụ hồ: tiền công từ 25% chi phí công trình, xóm đông
  thì hết sớm.
- MCP `postgres` hay timeout ở local → dùng `psql postgresql://xom:xom@localhost:5432/xom`.

### 4.2 Đã sửa gần đây (để khỏi điều tra lại)
- "Mời bạn không hoạt động": thiếu Web Share/clipboard khi không HTTPS → ô link + vào thẳng xóm khi đăng ký từ link.
- "Mỗi lần vào game bị Chú Bảy bắt chuyện": `seenDialogues` chỉ nằm trong bộ nhớ → lưu localStorage.
- "Nhiều cửa hàng không chạy cùng lúc": xem mục 2 (nhánh 2).
- Tắt server sạch (`RoomRuntime.drain`, Prisma đóng ở `onApplicationShutdown`); xe ôm lãi quá cao (`rides.waitMinutes` 15);
  tiệm lớn quá lời (traffic ×1.25/×1.45, trần 8× lương làm thuê).

### 4.3 Mẹo test
- Locator: toast trùng tên nút → `exact: true`; nút đóng sheet `getByRole("dialog").getByRole("button", { name: "Đóng" }).first()`;
  nút quay lại `{ name: "Quay lại" }`; khung đơn `[data-counterpart=<tên>]`; ghim `[data-feature=id][data-pin=left|right]`,
  cột neo `[data-anchor-rail=left|right] [data-anchor=id]`; thưởng `[data-claim=id]`, `[data-quest=id]`.
- Lượt Playwright toàn bộ chỉ Pixel 7 mất ~1,5 giờ (chạy nền, `workers: 1`).

## 5. Thứ tự gợi ý cho phiên tiếp theo
1. Hoàn tất mục 0.2 (merge nhánh 1; docs + Playwright + balance cho phần thưởng; test + deploy + merge nhánh 2).
2. Quầy theo mặt hàng (3.1) — sửa luồng mở cửa hàng + gọn sheet Quầy.
3. Viết `docs/BANDO.md` (bản đồ mở / ô đất / xây tiệm / nhà nhiều tầng), hỏi chủ dự án chốt, rồi làm theo bước nhỏ.
4. Tách `game.service.ts` + gom `ActionBar`.
5. Backlog 3.2 (bảng tin xóm, nội thất theo nghề, khách ra vào, admin, phong cách toon).
