# XÓM — Bản hand-off (chuyển từ cloud sang làm ở máy local)

> Ngày: 2026-10-02 · Nhánh: `claude/youthful-franklin-w4fkg6` · PR đang mở: [lctuandev/xom#2](https://github.com/lctuandev/xom/pull/2)
> (draft, chưa merge) · Head lúc viết: commit sau `db12730` (bản hand-off này).
> Đọc kèm: `CLAUDE.md` (quy tắc bắt buộc), `docs/FEATURES.md` (bảng trạng thái), `docs/USECASES.md` (use case),
> `docs/KIENTRUC.md`, `docs/NGHE.md`, `docs/THEGIOI.md`, `docs/DESIGN.md`, **`docs/ADMIN.md` (plan trang admin)**.

---

## 1. Bắt đầu ở máy local

```bash
git fetch origin && git checkout claude/youthful-franklin-w4fkg6 && git pull
pnpm install
cp .env.example .env            # nếu chưa có (DATABASE_URL, REDIS_URL, JWT_SECRET)
docker compose up -d            # Postgres 5432 (xom/xom/xom) + Redis 6379
pnpm --filter @xom/server exec prisma migrate dev --config prisma7.config.ts   # áp 12 migration mới của PR #2
pnpm --filter @xom/server exec prisma generate --config prisma7.config.ts
GAME_TICK_MS=250 pnpm dev       # web :5000 + server :5001
```
Kiểm tra trước khi coi là xong một việc (CLAUDE.md):
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @xom/server test:e2e
GAME_TICK_MS=250 pnpm dev   # rồi ở terminal khác:
cd apps/web && pnpm exec playwright test <spec> [--project=pixel-7|iphone-16-pro]
pnpm balance                 # khi đổi số liệu tiền trong packages/content
pnpm deploy:local            # build Docker + deploy :5555 (CHƯA chạy được ở cloud — cần chạy ở máy nhà)
```
**Production (máy nhà) cần làm ngay khi deploy PR #2:** `prisma migrate deploy` (migration: `room_projects`, `atm_pin`, `needs`,
`story`, `away`, `resident_visits`, `staff`, `contracts`, `rides`, `shop_setup`, `gigs`, `crew`) rồi `pnpm deploy:local`.
Người chơi cũ: không được cộng 1tr dự phòng, "Chuyện" bắt đầu từ bản này, phải tạo PIN ATM, 🤝 tin cậy bắt đầu 50, ai đang bán ở
nhà mặt tiền phải làm lại hợp đồng + giấy tờ, công trình đang thi công từ trước không có khoản nhân công (không thuê phụ hồ).

Mẹo môi trường đã gặp:
- Đổi `packages/content` hoặc `packages/shared` → build lại package (`pnpm --filter @xom/content build`) và **khởi động lại dev**.
- Không chạy `pnpm build` khi `pnpm dev` đang chạy; không chạy `pnpm deploy --prod` ở local.
- e2e server chạy `GAME_TICK_MS=10` → **100 phút game/giây**: test nào chờ thật lâu phải kéo `debug:clock` lùi (xem `gigs.e2e-spec`,
  `crew.e2e-spec`); rate limit 20 intent/giây → nghỉ `wait(1_100)` sau chuỗi lệnh dài (vd. sau `openBanhMiStall`).
- Chromium phần mềm của Playwright chỉ ~4 FPS → thứ gì canh giờ theo khung hình (khung ngắm thợ ảnh) phải test qua hook dev.
- MCP `postgres` không kết nối được ở cloud — ở local dùng lại bình thường (hoặc `psql`).

## 2. Đã xong trong PR #2 (tóm tắt — chi tiết trong mô tả PR + FEATURES.md)

Phase 1.11 (thoại Gen Z, quỹ xóm, HUD, chat, bục vinh danh, PWA, ATM, đói/khát…), nghề sửa xe, nhịp khách, thế giới sống
(Chuyện của tôi, lịch tuần + chợ đêm, khu phố, "Trong lúc bạn vắng"), khách quen, **nhân viên** (UC-M6), **bảng việc xóm + 🤝 tin
cậy** (UC-M7), **🛵 xe ôm** (UC-N1: xe dưới người, khách ngồi sau, đậu đâu cũng chờ khách, thông báo bấm được), **🚦 giao thông
3D** (UC-N2), **🏪 mở tiệm theo quy trình thật** (UC-F12), **📸 thuê nhau + thợ ảnh** (UC-M8, escrow, nghiệm thu, phân xử),
**🏗️ phụ hồ** (UC-J6), các góp ý UI (thanh trạng thái, quầy trà, khung đơn chân dung, toast gộp, nhân viên rõ ràng), và đợt rà
luồng tiệm gần nhất (`db12730`): không trả trùng tiền nhà/tiền chỗ, đang thuê nhà không ra vỉa hè, tiền nhà từ ngày sau ngày ký,
nút mở cửa trong tiệm, biển vẫy, nhân viên tới ca tự mở cửa, chủ xem nhân viên bán / "🙋 Tôi bán", Chú Bảy nói đúng vốn.

Kiểm chứng ở head `db12730`: lint/typecheck sạch; sim 138, content 5; e2e server 76/76; Playwright các spec liên quan qua trên
iPhone 16 Pro + Pixel 7; `pnpm balance` không cảnh báo. **Chưa chạy lượt Playwright toàn bộ** cho phần 2.

## 3. Việc đang dở / tồn đọng (theo thứ tự đề xuất)

Không có code đang viết dở — cây làm việc sạch. Dưới đây là backlog, mỗi mục ghi **yêu cầu của chủ dự án** + **hướng làm**.

### 3.1 🔧 Tái cấu trúc — ✅ bước A + B XONG (2026-10-02, kế hoạch chi tiết: `docs/IA.md`)
- **B (giao diện):** mỗi chức năng một sheet riêng (35 chức năng — `apps/web/game/features/registry.ts` + `sheets.tsx`),
  ☰ Menu lưới icon 5 nhóm (chấm đỏ khi có việc), cột neo trái tự ghim tối đa 4, bỏ thanh dưới 5 mục. Test: `openFeature(page, id)`
  trong `e2e/helpers.ts`; kịch bản mới `menu-chinh`. DESIGN Luật 12.3–12.6, UC-A6.
- **A (server):** `BusinessRepo` (chỗ duy nhất tìm cửa hàng — bước D sửa ở đây), `PaymentService`, `Broadcast` (thay các
  `setNotifier`), `BankService`, `NeedsService`, `MarketService`, `BusinessService`; gateway chia business/trade/work/xom/debug +
  `IntentRunner`.
- **Còn lại theo docs/IA.md:** C (sổ sách lãi/lỗ theo khoản + tổng quan), D (nhiều cửa hàng + kho riêng + chuyển kho có thời gian),
  E (chủ tự do khi có nhân viên + cấp tiệm → số nhân viên). `ActionBar` (nút ngữ cảnh) chưa gom về một nút chính.

### 3.2 👩‍🍳 Nhiều nhân viên theo quy mô cửa hàng — ✅ XONG (UC-M9: cấp tiệm 1–3, 1/2/3 người)
Yêu cầu: thuê **cùng lúc nhiều nhân viên** để bán nhanh hơn, **giới hạn theo quy mô** (xe đẩy nhỏ ít người, tiệm lớn nhiều).
Hướng làm: `Employee` hiện `@unique businessId` → bỏ unique, thêm `id`; content `staff.capacity` theo loại chỗ/cấp tiệm (gợi ý: xe
đẩy 1, tiệm nhà mặt tiền 2, tiệm lớn/nâng cấp 3); sim `staffShift` nhận **danh sách** người trong ca (sức làm cộng dồn, tỉ lệ sai
theo người làm món đó, lương từng người); `StaffService.run` chạy theo nhóm; phiếu ca theo người; UI StaffBoard danh sách +
"Thuê thêm (2/3)". Test: e2e (vượt giới hạn bị từ chối; 2 người bán nhiều hơn 1; lương đủ 2 người); `pnpm balance`.

### 3.3 🏪 Nhiều cửa hàng cùng lúc (không phải đổi nghề) — ✅ XONG bản đầu (UC-F14; còn: thuê nhiều nhà mặt tiền, doanh thu theo từng cửa hàng trong Sổ sách)
Yêu cầu: đủ tiền thì mở **nhiều cửa hàng khác nhau**; **review lại toàn bộ luồng "Làm ăn"**.
Hướng làm: `Business` đã là bảng riêng (nhiều dòng/người được) — phần lớn công việc là bỏ giả định "một quầy":
`MeView.business` → `businesses[]` + `activeBusinessId`; mọi intent `biz:*`, `market:*` (nhập cho cửa hàng nào), `staff:*`,
`shop:*`, `event:host` nhận `businessId`; `room.attending` theo **businessId** (đứng ở quầy nào); đơn khách gắn businessId (đã
có); `Lease` theo business (một nhà một tiệm); kho: **đề xuất kho chung theo người chơi** (đơn giản; nếu muốn kho riêng từng
tiệm thì thêm `businessId` vào `InventoryItem` — quyết trước khi làm, khó đổi sau). Giới hạn: mỗi người tự đứng bán **một chỗ
một lúc**, chỗ khác phải có nhân viên. Mua đồ nghề mới không thay đồ nghề cũ mà tạo cửa hàng mới (đặt tên, chọn chỗ).
Thêm **📊 Tổng quan cửa hàng**: doanh thu / lãi hôm nay & 7 ngày, nhân viên trong ca, tồn kho sắp hết, tiền nhà sắp tới hạn
(yêu cầu "bảng thống kê doanh thu, nhân viên… của các cửa hàng").

### 3.4 🚶 Có nhân viên thì chủ đi làm việc khác / mở tiệm khác tự bán — ✅ phần "đi làm việc khác" XONG (`ownerTied`); "mở tiệm khác tự bán" chờ bước D
Yêu cầu: tiệm đã có nhân viên bán thì user **đi làm nghề khác** hoặc **mở tiệm khác và vào tự bán**.
Hiện chặn ở 3 chỗ: `work.ts:261` (làm thuê), `rides.ts:192` (xe ôm), `projects.ts:147` (phụ hồ) — "Đang mở quầy — đóng quầy rồi
mới…". Sửa: chỉ chặn khi có cửa hàng **đang mở mà không có nhân viên trong ca** (helper chung `ownerTied(playerId)`), và
`openBusiness` không chặn khi chủ đang làm thuê nếu cửa hàng có nhân viên. Đi kèm 3.3.

### 3.5 🏠 Đòi tiền nhà — ✅ XONG (UC-F13, nhánh `feat/doi-tien-nha`)
Chủ nhà NPC (Cô Tư Hường nhà số 10, Chú Năm Lộc nhà số 24) tới nhắc 17:00 → modal chân dung + bong bóng; trả ngay / hẹn **ngày**
(chủ dự án chốt: hẹn ngày, không hẹn giờ — cả ngày hẹn trả được, qua ngày là thất hẹn) / để sau; chưa hẹn quá 20:00 → trừ cọc +
phí trễ + 🤝; trễ lần 3 hoặc cọc không đủ → dẹp tiệm. Offline chưa hẹn không tính trễ (gỡ issue "tiền nhà tính khi chủ offline").
Chi tiết: `docs/USECASES.md` UC-F13. Còn để sau: chủ nhà hiện 3D ở cửa tiệm lúc tới đòi.

### 3.6 🛋️ Nội thất riêng theo từng nghề / cửa hàng
Yêu cầu: mỗi ngành nghề có **thiết kế khác nhau** (không phải tiệm nào cũng có bàn ăn) — **nghiên cứu kỹ cách bố trí**.
Hiện: `interior/ShopInterior.tsx` một mẫu chung (quầy + bàn ăn) cho mọi nghề.
Hướng làm: layout bằng **dữ liệu** trong content (`interiors[category]`: quầy, kệ, bàn/ghế, khu chờ, đồ trang trí, vị trí xếp hàng,
chỗ nhân viên) — tham khảo đời thật: tiệm bánh mì (tủ kính + lò nướng, ghế nhựa ít, khách mua mang đi), trà sữa (quầy pha chế,
bảng menu đèn, ghế cao + bàn nhỏ, tủ topping), quán cơm/phở (bàn inox nhiều, bếp mở, xe đẩy chén), sửa xe (nền xi măng, cầu nâng,
kệ phụ tùng, máy bơm, không bàn ăn), phụ kiện/tạp hoá (kệ treo, tủ kính, quầy thu ngân). Model từ kit có sẵn + Blender (`pnpm
assets`). Ngoài phố: biển + mái hiên theo nghề.

### 3.7 🧍 Khách ra vào tiệm
Yêu cầu: tiệm mở thì có **khách ra vào mua hàng**; vào tiệm thì **thấy được** (kể cả khi nhân viên bán).
Hiện: trong tiệm có khách theo đơn của chủ; nhân viên bán (sim) thì không có khách hiển thị; ngoài phố tiệm trong nhà không vẽ khách
(`scene/Customers.tsx` bỏ qua lô `house`). Hướng làm: server phát sự kiện nhẹ `shopTraffic` (businessId, số khách vào/ra theo nhịp,
cả khi nhân viên bán) → ngoài phố: NPC đi vào cửa / ra cầm túi; trong tiệm: xếp hàng ở quầy, ngồi bàn (nếu layout có), nhân viên
"làm món" (animation) rồi khách ra. Chỉ là hình ảnh, tiền vẫn do sim/server.

### 3.8 🏘️ Xóm chung — hết cảnh mỗi người một xóm ✅ bản đầu (2026-10-02, UC-J7)
Đã làm: (1) tự xếp người mới vào xóm còn chỗ đông nhất (40 cư dân / 30 online — `economy.xomResidents/xomOnline`), tick "Lập xóm
riêng" thì lập mới; (2) link mời đăng ký là vào thẳng xóm bạn; ô link khi máy không chép được (lỗi "mời bạn không hoạt động" khi mở
qua http IP LAN); (3) danh sách xóm trong bảng Hàng xóm + Dọn về. **Còn:** (4) bảng tin xóm, tên xóm.
Hiện: đăng ký là tạo xóm mới (`auth.service.ts` tạo `Room`), chỉ gặp nhau qua mã mời; `MAX_MEMBERS = 8` người online/xóm.
Đề xuất (đã gửi, chủ dự án đồng ý làm): (1) **tự xếp người mới vào xóm sống động còn chỗ** (giới hạn cư dân ~12), hết chỗ mới lập
xóm mới; (2) giữ link mời + "Lập xóm riêng"; (3) **danh sách xóm** trong bảng Xóm (tên, cư dân, online, Vào xóm); (4) **bảng tin
xóm** lưu tin nhắn + tin tự động ("Lan vừa mở quầy trà sữa") để giao lưu lệch giờ.

### 3.9 🛡️ Trang admin `/quan-tri`
Plan chi tiết: **`docs/ADMIN.md`** (kiến trúc, quyền `User.role` + `AdminGuard` + re-auth, nhật ký `AdminAction`, ví
`system:admin`, 8 màn hình responsive PC/mobile dùng UI-kit giống game, API, test, thứ tự 5 phiên). Đường dẫn riêng, không có link
trong game, chỉ admin vào được.

### 3.10 Backlog cũ (vẫn còn)
Tạp hoá + **sổ nợ** (bán chịu, đòi nợ); **cắt tóc + cá nhân hoá** (tóc, quần áo, dáng — NGHE §3.6); ngày lễ / mùa; âm thanh CC0
+ nhạc lo-fi; hình món ăn SVG thay emoji; đèn đỏ + model xe Blender (thay xe dựng khối); công trình đã xong hiện 3D; xe ôm vào
`pnpm balance`, xe hao mòn → tiệm sửa xe, mua xe riêng, khách quen gọi riêng; thợ ảnh: review món / ảnh cưới; phụ hồ: khiêng gạch,
xe rùa; chạy lượt Playwright toàn bộ.

### 3.11 Quyết định của chủ dự án (2026-10-02)
- **Điều hướng (thay cho đề xuất thanh dưới 5 mục ở 3.1):** mỗi tính năng có **icon riêng** — hoặc neo trên màn hình, hoặc nằm
  trong **một menu mở ra danh sách** rồi bấm vào chức năng. Viết `docs/IA.md` theo hướng này trước khi tách UI.
- **Kho hàng khi nhiều cửa hàng (3.3): kho riêng từng tiệm** — thêm `businessId` vào `InventoryItem`, nhập chợ phải chọn tiệm,
  chuyển hàng giữa các tiệm.

### 3.12 Góp ý đợt 2 của chủ dự án (2026-10-02) — làm theo thứ tự, mỗi mục một nhánh, merge --no-ff vào main
Tham khảo luồng game: Township (mở rộng đất theo ô, ô sau đắt hơn, mở khoá theo cấp/dân số), Bit City (mua ô đất rồi chọn loại
công trình, xây xong dân số tăng), thiết kế thành tựu (thưởng *chức năng* — mở khoá — giữ chân tốt hơn thưởng danh hiệu suông).
- [x] Mời bạn vào xóm không hoạt động → link mời vào thẳng xóm khi đăng ký + ô link khi không chép được (UC-J1).
- [x] Tăng giới hạn xóm + xóm chung (3.8 bản đầu, UC-J7).
- [x] Nút Menu: icon không nền, chữ "Menu" đè dưới; bỏ neo ⚙️; ghim cả trái lẫn phải (UC-A6).
- [x] Chú Bảy bắt chuyện mỗi lần vào game → nhớ lời đã nghe + lựa chọn bỏ qua hướng dẫn.
- [x] Nút **‹ Quay lại** trong sheet mở từ sheet khác / từ Menu (store `sheetBack`, `openFeature(id, { from: "sheet" })`).
- [x] **Đánh giá riêng từng cửa hàng** (Review.businessId, migration `20261003090000_review_business`, UC-F11).
- [ ] **Thưởng** cho thành tựu / nhiệm vụ (tiền nhỏ có trần + mở khoá; không thành thu nhập thụ động).
- [ ] **Quầy theo mặt hàng**: chọn thể loại khi mở cửa hàng; sheet quầy chỉ còn: nhập đúng hàng của quầy, thuê nhân viên, giá —
  gom bớt nút cuối sheet.
- [x] **Nhiều cửa hàng chạy cùng lúc**: lỗi do client chỉ nhận "đứng quầy" ở cửa hàng đang chọn → tới quầy khác tự chọn (UC-F14).
- [ ] **Bản đồ mở**: ban đầu chỉ nhà NPC + ô đất trống / nhà cho thuê; người chơi chọn ô để thuê hoặc xây; xóm lớn dần theo số
  người mở tiệm; nâng cấp tiệm thành nhà cao tầng (gắn với nhánh art `feat/phong-cach-toon`).
- [ ] Tách nhỏ chức năng tiếp (tránh conflict) — áp dụng dần khi làm từng mục trên.

## 4. Issues / lưu ý đang biết

- **Chưa deploy**: bản người chơi thử là production cũ (máy cloud không có Docker). Deploy xong mới thấy các sửa trong PR #2.
- **Một quầy/người** là giả định khắp server + web (xem 3.3) — đừng thêm chỗ mới dùng `business.findFirst({ ownerId })`.
- Thợ ảnh: khung ngắm canh giờ theo khung hình; **chưa thử độ khó trên điện thoại thật** (trọn điểm ±180 ms, có điểm ±900 ms,
  server bù trễ ≤ 400 ms).
- Phụ hồ: tiền công lấy từ khoản nhân công 25% chi phí công trình — xóm nhiều người trộn thì hết sớm.
- Xe ôm: thuê xe là cả ngày ngồi trên xe nhưng tốc độ đi bộ khi không chở khách. ✅ Đã vào `pnpm balance` (2026-10-02):
  khách tới quá dày làm xe ôm lãi ~630k/ngày (gấp 4 làm thuê) → `rides.waitMinutes` 6 → 15 (~23 cuốc, ~300k).
- Tiền nhà vẫn cộng dồn khi chủ offline (hợp đồng tính theo ngày) nhưng không tính trễ khi chưa hẹn; nợ vượt cọc thì vẫn bị dẹp
  tiệm — xem lại khi làm 3.8 (xóm chung chạy cả khi mình offline).
- Nhân viên chỉ bán khi quầy mở; tự mở cửa khi tới ca chỉ khi chủ **online** (chủ offline thì `finishShift` lúc thoát).
- ✅ (2026-10-02) Tắt server: GameService chờ nhịp/intent dở chạy xong (`RoomRuntime.drain`), Prisma đóng ở
  `onApplicationShutdown` — e2e không còn log "Cannot use a pool after calling end". Test nhân viên thoát game giữa ca chờ
  phiếu ca ghi xong thay vì chờ cứng 900ms.
- Hook dev cho Playwright (chỉ bản dev): `window.xomDebug.{send, walk, clock}`, `xomRider()`, `xomShoot()`, `xomTraffic()`.
- Locator Playwright: toast trùng tên nút → `exact: true`; nút "Đóng" của sheet: `getByRole("dialog").getByRole("button",
  { name: "Đóng" }).first()`; khung đơn: `[data-counterpart=<tên>]`.
- Lịch kiểm tra PR tự động (routine "Check-in PR xom#2") đang hẹn trên cloud — có thể xoá nếu không cần.

## 5. Gợi ý thứ tự cho phiên local tiếp theo

1. Deploy PR #2 lên máy nhà, chơi thử nhanh các luồng mới (tiệm, nhân viên, xe ôm, thợ ảnh, phụ hồ).
2. 3.1 Tái cấu trúc (chốt `docs/IA.md` với chủ dự án trước).
3. 3.3 + 3.4 + 3.2 (nhiều cửa hàng → chủ tự do → nhiều nhân viên) — làm chung một nhánh lớn, chia commit nhỏ.
4. 3.5 Đòi tiền nhà · 3.6 + 3.7 Nội thất + khách ra vào.
5. 3.8 Xóm chung · 3.9 Admin.
