# XÓM — Bản hand-off (đọc đầu tiên khi mở phiên mới)

> Cập nhật: 2026-10-03 (chiều) · Làm ở máy local (repo `/home/lctuan/Documents/GameOnline`), làm thẳng trên `main` (chủ dự án
> cho phép), làm tới đâu commit + push tới đó.
> Đọc kèm: `CLAUDE.md` (quy tắc bắt buộc), `docs/FEATURES.md` (bảng trạng thái), `docs/USECASES.md` (use case), `docs/IA.md`
> (tổ chức chức năng), `docs/DESIGN.md`, `docs/KIENTRUC.md`, `docs/NGHE.md`, `docs/THEGIOI.md`, `docs/ADMIN.md`.

---

## 0. TRẠNG THÁI NGAY LÚC BÀN GIAO

### 0.1 Đã xong trong phiên 2026-10-03
- Nhánh `fix/xom-moi-ban-menu` (#6) và `feat/danh-gia-tung-tiem` (#5) **đã merge vào `main`** (chủ dự án merge trên GitHub).
  Đã kiểm lại trên `main`: e2e server 85/85; Playwright Pixel 7 `khi-vang`, `menu-chinh`, `mua-cua-nhau`, `nhieu-cua-hang`,
  `xom-chung` xanh.
- 🎁 Thưởng hoàn tất: UC-P4 + dòng FEATURES, Playwright `thuong` (bán 5 món → nhận thưởng nhiệm vụ + thành tựu "Mở hàng"),
  `pnpm balance` có mục kiểm trần thưởng (nhiệm vụ ≤ 10% một ngày làm thuê; tổng thành tựu ≤ 1 ngày lãi) → tiền nhiệm vụ giảm
  còn 3k/5k/3k (11k/ngày). Đã deploy :5555.
- 🏪 Quầy theo mặt hàng (UC-F15): sheet Quầy có 4 thẻ việc kèm tình trạng (`StallTasks` trong `features/shop/Stall.tsx`), chợ chỉ
  hiện nguyên liệu quầy đang chọn (nút "🧺 Xem hàng khác"), vựa xe "Mở cửa hàng: chọn mặt hàng", mở thêm cửa hàng xong mở luôn
  📍 Chỗ bán. Playwright `quay-viec`; helper `buyIngredients` tự bấm "Xem hàng khác" khi cần.

- 🗺️ Bản đồ mở (docs/BANDO.md) **đã chốt** + **bước A xong** (UC-B12): `content.chunks` 4 mẫu khu, `sim/chunks.ts` `composeMap`,
  `Room.chunks` (migration `20261003110000_room_chunks`), `room.grid` (xe ôm), `WorldView.chunks`, web `nav.grid`/`MAP_BOUNDS` là
  live binding + `setMapChunks` (gọi trong store), `useStreetLayout`/`useMapKey` cho Street/NightLights/Traffic. Mở khu thử:
  `xomDebug.send("debug:chunk", { chunkId: "khu_dong" })`. Đo FPS: xem BANDO §8. **Bước B xong**: chỗ bán của khu là dữ liệu
  trong mẫu (`chunks[].lots`), id `<khu>__<chỗ>__<gx>_<gz>` để `content.lot()`/`findLot()` tự giải; `content.lotsIn(chunks)`.
  **Bước C xong**: 🗺️ bản đồ thu nhỏ `ui/XomMap.tsx` trong sheet Chỗ bán; ⛺ sạp có mái (`kind: "stall"`, mưa vẫn bán, dựng
  300k). **Bước D xong**: bảng `Plot` + `PlotService` (`game/plots.ts`), `room.plots`, `land:buy`/`land:sell`, `openDue(…, owned)`.
  **Bước E xong**: `content.buildings`, `land:build`, `PlotService.finishBuilds` (sang ngày), `levelIn/levelFor` +
  `effectiveShopLevel` (xe đẩy luôn cấp 1). **Bước F xong**: `GameService.growXom` lúc sang ngày (`economy.xomGrow` 70%, tối đa
  8 khu). Bản đồ mở A–F xong; còn: phụ hồ cho tiệm riêng, chỉ dựng khu gần camera, model nhà (plan Blender).

### 0.2 Dọn dẹp chờ chủ dự án
- Worktree cũ `/home/lctuan/Documents/GameOnline-A` (`feat/nut-ngu-canh`, chưa có code) và `GameOnline-B` (trùng `main`) đều sạch
  — gỡ bằng `git worktree remove ../GameOnline-A ../GameOnline-B` (Claude bị chặn lệnh này, để chủ dự án tự chạy).
- `.playwright-mcp/` (log MCP) chưa vào `.gitignore`; `.mcp.json` có thay đổi riêng của chủ dự án (thêm blender) — chưa commit.

### 0.3 Lưu ý môi trường
- Máy khởi động lại thì `docker compose up -d` (Postgres + Redis dev) trước khi `pnpm dev`.
- Tắt dev: `ss -ltnp | grep -E ':500[01] '` lấy pid rồi `kill` (đừng `pkill -f` — khớp luôn shell của mình).
- Đang chạy Playwright thì đừng sửa file web/server (HMR / Nest restart làm hỏng bài đang chạy), cũng đừng đo hiệu năng bằng
  chrome-devtools cùng lúc (`giao-thong` đếm xe theo khung hình — tranh GPU là fail).

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
  [x] Chú Bảy · [x] nút Quay lại · [x] đánh giá từng cửa hàng · [x] nhiều cửa hàng cùng lúc · [x] thưởng (UC-P4) ·
  [x] quầy theo mặt hàng (UC-F15, bản đầu).
- [x] **Quầy theo mặt hàng** (UC-F15, bản đầu) — còn: một mặt hàng nhiều đồ nghề (xe đẩy / tủ lớn), gợi ý chỗ theo khu hợp món.
- [ ] **Bản đồ mở / xóm lớn dần (việc lớn — viết plan `docs/BANDO.md` trước, hỏi chủ dự án chốt):** ban đầu xóm chỉ có nhà NPC +
  **ô đất trống / nhà cho thuê**; người chơi đi làm thuê tới khi đủ tiền sắm sạp nhỏ, rồi **chọn ô đất để thuê hoặc tự xây** tiệm;
  mỗi người mở tiệm thì xóm mở rộng thêm ô (như Township); nâng cấp tiệm lên **nhà nhiều tầng** (gắn cấp tiệm 1–3 hiện có và
  nhánh art `feat/phong-cach-toon`). Hiện các lô (`content.lots`) và nhà mặt tiền (`nha_so_10`, `nha_so_24`) là hard-code →
  cần bảng `Plot` theo xóm (vị trí, loại: vỉa hè/đất/nhà, chủ, công trình, tầng), sinh ô mới theo số cư dân, xây = money sink lớn
  (vật liệu + phụ hồ người chơi), thuê nhà NPC giữ như UC-F12.
- [ ] **Tách nhỏ chức năng tiếp** (tránh conflict): `game.service.ts` còn ~1.200 dòng (tick, customerTick, me(), awayReport,
  xóm) → tách `CustomerService`, `RoomService` (load/unload/join/switch), `MeViewBuilder`; web `ActionBar.tsx` gom nút ngữ cảnh.
- [x] Chấm đỏ trên icon 🏅/🎯 khi có thưởng chưa nhận (`MeView.rewards`, `features/alerts.ts`, chấm cả ở cột neo).

### 3.1b Góp ý đợt 3 của chủ dự án (2026-10-03) — làm sau bước E, F của bản đồ mở
- [x] **Bỏ thông báo "làm dùm / bán dùm" của nhân viên** (giờ đã mở được nhiều cửa hàng, chủ không cần giành bán) → cột icon
  trái/phải đẩy lên cao hơn (chỗ trống của thông báo đó).
- [x] **Icon 💬 tin nhắn** tụt xuống ngang hàng nút ☰ Menu, nằm bên phải.
- [x] **Lỗi: không mở nhiều tiệm cùng lúc được** — nguyên nhân: `requireNoLease` chặn theo *người* → đang thuê nhà cho tiệm A
  thì mọi cửa hàng khác không đặt ra vỉa hè được (sheet Chỗ bán cũng khoá hết chỗ vỉa hè). Sửa: chỉ chặn khi *chính cửa hàng
  đang ở nhà thuê* dọn ra. e2e `shop-flow` + Playwright `nhieu-cua-hang` (tiệm trong nhà + xe ngoài vỉa hè).
- [x] **Thuê nhiều nhà mặt tiền cùng lúc**: hợp đồng nhận theo căn nhà cửa hàng đang đặt (`ShopService.activeLease` = hợp đồng
  của cửa hàng đang quản lý, `leaseAt(owner, lot)`); mỗi cửa hàng thuê căn riêng, sheet 🏠 theo cửa hàng đang quản lý, căn của
  cửa hàng khác ghi "bạn (cửa hàng khác)". e2e `shop-flow` (hai nhà, cửa hàng đã ở nhà thuê không ký thêm).
- [x] **Đang thuê tiệm (nhà mặt tiền) mà vài chỗ vẫn gọi "quầy", "đẩy xe"** — rà mọi chữ theo `lot.kind` (cart: quầy/xe đẩy;
  house: tiệm/cửa hàng; stall: sạp). Xong: helper `game/shopWords.ts` (tiêu đề sheet "🏠 Tiệm của tôi", nút Mở/Đóng, "Tới tiệm",
  vắng chủ, khai trương, chợ, nhân viên…); lỗi server phía chủ dùng chữ chung "đóng cửa / cửa hàng".
- [x] **Chạm ô cấp độ (góc trái) → bottom sheet Hồ sơ có avatar + tên nhân vật** giống khung NPC (PlaceFace / chân dung).
- [x] **Plan làm lại cảnh vật, nhà, nhân vật… chi tiết + chân thật hơn trong Blender** — `docs/ART.md` **đã chốt** (low-poly chi
  tiết + AO màu đỉnh, nhà & phố trước, tự dựng bằng script Blender). Làm theo ART §5 bước 1: kit nhà ống Việt. Gốc: viết `docs/ART.md` (phong cách, thứ tự
  model, ngân sách polygon/texture cho điện thoại, quy trình `pnpm assets`), hỏi chủ dự án chốt rồi làm dần; gắn với nhánh
  `feat/phong-cach-toon`.
- [x] **Tự gia hạn đồ thuê khi đến hạn** — làm cho tiền nhà mặt tiền (`Lease.autoPay`, `rent:auto`, công tắc trong bảng tiền nhà;
  `rentTick` tự trả đầu ngày, thiếu tiền báo một lần rồi chủ nhà đòi như thường). Chỗ vỉa hè / ô đất vốn trả khi mở cửa nên không
  cần; xe ôm thuê theo ngày chưa làm (cân nhắc nếu người chơi thấy phiền). (tiền nhà mặt tiền, chỗ vỉa hè / ô đất, xe ôm thuê theo ngày…): thêm tuỳ chọn "🔁 Tự gia
  hạn" — tới hạn thì tự trả từ 💵/🏦 theo cách trả đã chọn; thiếu tiền thì báo, không tự vay. Cài trong sheet 🏠 Thuê nhà & giấy tờ
  + 📍 Chỗ bán; server trả tiền ở mốc tính tiền hiện có (cuối ngày / lúc mở quầy).
- [x] **Đèn đường** (sửa: vầng sáng đặt 0,04 m — dưới mặt gạch vỉa hè 0,08 m và sát mặt đường gây z-fighting; nâng lên 0,12 m +
  polygon offset trong `Glows`, Playwright `den-duong` chụp đêm). Gốc: ánh sáng chỉ rọi mặt đường, vỉa hè không sáng; xoay góc nhìn thì đèn chớp nháy liên tục — rà `NightLights` /
  `Glows` (vầng sáng dưới đất, z-fighting / culling / sắp xếp trong suốt).

### 3.1c Góp ý đợt 4 của chủ dự án (2026-10-03) — làm ngay sau phần hiệu năng đang dở, trước đồ hoạ bước 2
- [x] **Chạm từng mục trên thanh trạng thái** (xong: tiền → 👛 Ví, ⭐ → 📒 Đánh giá, thứ/giờ/thời tiết → 📅 Hôm nay, dải tin → 🏆 Bảng
  xóm, 🍚/💧 → Ăn uống như cũ; Hồ sơ bỏ nút Ví; Playwright `thanh-trang-thai`). (tiền, ⭐ uy tín, 🍚 no/💧 khát, giờ/ngày/thời tiết…) đều mở bottom sheet tương ứng
  (tiền → 👛 Ví, ⭐ → 📒 Đánh giá cửa hàng, giờ/thời tiết → 📅 Hôm nay…) — hiện chỉ chip no/khát mở được. Khi đó sheet Hồ sơ (chạm ô
  cấp độ) bỏ mục Ví.
- [x] **Mỗi cửa hàng có doanh thu & đánh giá riêng** (xong: bảng `BusinessDay` ghi song song qua `addToReport(…, businessId)`;
  `stats:me` có `shops[]`; 📊 Sổ sách chọn "🏪 Cửa hàng này / 👤 Tất cả"; thẻ 🏬 có 💰 hôm nay + ⭐; 📒 Đánh giá vốn theo cửa
  hàng đang quản lý). Gốc: **Mỗi cửa hàng có doanh thu & đánh giá riêng**: 📊 Sổ sách theo cửa hàng (chọn cửa hàng / tổng), 📒 Đánh giá theo cửa hàng
  đang quản lý (đã có `Review.businessId`), thẻ 🏬 Các cửa hàng ghi doanh thu hôm nay + ⭐ từng cửa hàng.
- [x] **Toast thông báo không che thanh trạng thái** (xong: trên bản đồ toast nằm cột giữa hàng icon neo — `Toasts inline`, vẫn
  nổi trên sheet; trong nhà/tiệm giữ kiểu cũ; Playwright `thong-bao`).
- [ ] **Lỗi: dọn về xóm khác không được — báo "chưa vào xóm"** (👥 Hàng xóm → 🏘️ Các xóm khác → Dọn về). Tái hiện bằng e2e trước khi
  sửa.

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
- **Thưởng là tiền vào ví** — CLAUDE.md: "tiền chỉ vào ví khi người chơi *làm*". Thưởng chỉ có khi làm thật (bán, làm thuê),
  nhỏ/một lần; `pnpm balance` kiểm trần (11k/ngày nhiệm vụ, 380k tổng thành tựu). "Có hàng xóm cùng chơi" chỉ thưởng XP.
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
1. ~~Bản đồ mở A–F~~ (xong 2026-10-03).
2. ~~Góp ý đợt 3~~ xong (2026-10-03). Đồ hoạ (`docs/ART.md`): **bước 1 kit nhà phố Việt xong** (`art/blender/nha_pho.py`).
   **Góp ý đợt 4 (mục 3.1c) làm tiếp theo**, rồi đồ hoạ bước 2 (nhà cấp 4 / tạp hoá / UBND / trường theo kit, mái chi tiết hơn).
   **Hiệu năng (cần làm):** cảnh đã vượt ngân sách PLAN §1. Đã làm: pipeline asset gộp mảnh cùng material của từng model tĩnh
   (`flatten` + `join` trong `packages/assets/scripts/build.mjs` — xe Kenney 5 mảnh → 1) + gộp thân/đầu nhân vật trong Blender
   (`art/blender/gop_nhan_vat.py` → `art/export/characters`, giữ 32 animation) → ~121 → **~94–97 draw call (đạt < 100)**; tam
   giác ~117k (< 80k chưa đạt). Công cụ: bản dev gõ `xomSceneStats()` trong console → tam giác/instance theo từng model. Nặng nhất:
   nhà phố (~30k), xe (~24k), nhân vật (~18k), cột điện Kenney (7,5k). Hướng tiếp: LOD / bớt xe đậu, cột điện tự dựng nhẹ hơn;
   đo trên điện thoại thật.
   Playwright `nha-pho` chặn hồi quy (< 130 draw call, < 125k tam giác).
3. Tách `game.service.ts` + gom `ActionBar`.
4. Backlog 3.2 (bảng tin xóm, nội thất theo nghề, khách ra vào, admin, phong cách toon).
