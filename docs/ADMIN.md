# XÓM Admin — kế hoạch chi tiết (chưa làm)

Trang quản trị để **thao tác + thống kê mọi thứ trong game** (tài khoản, tiền, xóm, quầy/tiệm, kinh tế, sự kiện…).
Yêu cầu của chủ dự án:
- **Đường dẫn riêng**, **không xuất hiện trong game** (không nút, không link trong HUD/menu).
- **Chỉ admin truy cập được**.
- **Responsive PC + mobile**; giao diện **dùng lại thành phần trông như game** (màu kem/mực/đỏ/lá, thẻ bo tròn, emoji, font game)
  cho đồng bộ.

Nguyên tắc dự án vẫn áp dụng: làm một mình → ít thành phần (không thêm service/dashboard riêng như Grafana/Metabase); mọi thay
đổi tiền vẫn qua `LedgerService`; mọi thao tác admin ghi lại để truy vết.

---

## 1. Kiến trúc

| Lớp | Chọn | Lý do |
|---|---|---|
| Đường dẫn | `apps/web/app/(admin)/quan-tri/...` → URL **`/quan-tri`** (đổi được bằng env `ADMIN_PATH` qua `next.config` rewrite nếu muốn giấu kỹ hơn) | Cùng app Next, dùng lại Tailwind + thành phần UI; không cần app thứ 3 |
| API | Module NestJS mới `apps/server/src/admin/*` (REST `/api/admin/*`) | Server-authoritative; dùng lại Prisma, LedgerService, GameService (đẩy thay đổi vào xóm đang chạy) |
| Quyền | Cột `User.role` (`PLAYER` \| `ADMIN`) + `AdminGuard` (JWT hiện có + role) | Đơn giản; cấp quyền bằng script CLI, không có UI tự nâng quyền |
| Bảo vệ thêm | Rate limit riêng, **re-auth** (nhập lại mật khẩu) cho thao tác nguy hiểm (trừ/cộng tiền, xoá, khoá), header `X-Robots-Tag: noindex`, không link từ game | Một tài khoản admin lộ là mất cả server |
| Nhật ký | Bảng `AdminAction` (adminId, action, target, payload, reason, createdAt) | Truy vết mọi thao tác |
| Biểu đồ | SVG tự vẽ (sparkline, cột) — không thêm thư viện nặng; đọc skill dataviz khi làm | Bundle nhỏ, cùng phong cách game |

Prisma:
```prisma
enum Role { PLAYER ADMIN }
model User { ... role Role @default(PLAYER) }
model AdminAction {
  id String @id @default(uuid(7)) @db.Uuid
  adminId String @db.Uuid
  action String          // "money.grant", "player.ban", "room.move", ...
  target String?         // playerId / roomId / businessId
  payload Json @default("{}")
  reason String
  createdAt DateTime @default(now())
  @@index([createdAt])
}
model User { ... bannedUntil DateTime? }   // khoá tài khoản (auth chặn đăng nhập + ngắt socket)
```
Script cấp quyền: `pnpm --filter @xom/server admin:grant <username>` (đặt role ADMIN, in ra xác nhận).

Ví hệ thống mới cho thao tác tay: `SYSTEM.admin` (`system:admin`) — **mọi** cộng/trừ tiền tay đi qua ví này với reason
`admin_grant` / `admin_revoke` → sổ cái luôn cân, báo cáo tiền theo `reason` thấy rõ tiền "ngoài game".

## 2. Màn hình (responsive)

Bố cục: PC = **thanh bên trái** (icon + chữ) + nội dung lưới 2–4 cột; mobile = **thanh dưới 5 icon** giống game + nội dung 1
cột, bảng chuyển thành thẻ. Header: tên admin, đồng hồ game của xóm đang xem, nút đăng xuất.

1. **🏠 Tổng quan** — thẻ số: người chơi (tổng / hôm nay / online), xóm đang chạy, tổng tiền trong game (💵 + 🏦), tiền vào/ra
   hôm nay theo `reason` (top 8), quầy/tiệm đang mở, lỗi gần đây (log server). Biểu đồ: DAU 30 ngày, tiền lưu hành 30 ngày,
   giữ chân D1/D7 (dùng lại `pnpm analytics`, chuyển logic sang service để API gọi được).
2. **👤 Tài khoản** — tìm theo username/tên; bảng: tên, xóm, cấp, tiền mặt, ngân hàng, tin cậy, lần cuối online, trạng thái.
   Chi tiết người chơi: hồ sơ, ví + lịch sử sổ cái (lọc reason), kho hàng, quầy/tiệm, nhân viên, hợp đồng/gig, xe ôm, Chuyện của
   tôi, GameEvent gần đây. Thao tác: cộng/trừ tiền (bắt buộc lý do), đặt lại PIN ATM, đổi tên, chuyển xóm, khoá/mở khoá
   (`bannedUntil`), đá khỏi phiên (ngắt socket), xoá tài khoản (re-auth + gõ lại username).
3. **🏘️ Xóm** — danh sách: mã, ngày/giờ game, số cư dân / online, quỹ xóm, công trình, thời tiết. Chi tiết: bản đồ mini các lô
   (ai chiếm, mở/đóng), cư dân, sự kiện hôm nay. Thao tác: chỉnh giờ/ngày, ép thời tiết, kích sự kiện, đổi tên/mã, gộp xóm
   (chuyển cư dân), đặt giới hạn cư dân.
4. **🏪 Làm ăn** — mọi quầy/tiệm: chủ, nghề, chỗ, mở/đóng, uy tín, độ mòn, doanh thu 7 ngày, nhân viên, hợp đồng thuê nhà (cọc,
   nợ). Thao tác: đóng quầy cưỡng bức, trả nhà hộ (hoàn cọc), xoá nhân viên.
5. **💰 Kinh tế** — số dư ví hệ thống (`system:*`, `escrow:*`, `fund:*`), dòng tiền theo reason theo ngày (bảng + cột chồng),
   tiền trung bình theo cấp, cảnh báo bất thường (một người nhận > X/giờ, ví âm, escrow treo quá hạn). Nút chạy
   `pnpm balance`-tương đương (đọc kết quả gần nhất) để so sánh mô phỏng với thực tế.
6. **📋 Việc & giao dịch** — hợp đồng NPC, gig người chơi (trạng thái, escrow, tranh chấp), cuốc xe ôm, đánh giá quầy (ẩn đánh giá
   xấu/tục).
7. **🧾 Nhật ký** — `AdminAction` (lọc theo admin/hành động/thời gian) + log đăng nhập.
8. **⚙️ Hệ thống** — health (DB, Redis), phiên bản build, số socket, tick lag, cấu hình content đang chạy (hash), nút
   "nạp lại content" (sau này).

## 3. API (`/api/admin`, mọi route qua `AdminGuard`)

```
GET  /overview
GET  /players?q=&page=        GET /players/:id            GET /players/:id/ledger?reason=&page=
POST /players/:id/money       { amount, wallet: "cash"|"bank", reason }        (re-auth)
POST /players/:id/ban         { until, reason }            POST /players/:id/kick
POST /players/:id/move-room   { code }                     POST /players/:id/reset-pin
DELETE /players/:id           (re-auth)
GET  /rooms                   GET /rooms/:id               POST /rooms/:id/clock { day?, minute }
POST /rooms/:id/weather       POST /rooms/:id/event { eventId }
GET  /businesses?status=      POST /businesses/:id/close   POST /leases/:id/end
GET  /economy/flows?days=     GET /economy/wallets         GET /economy/alerts
GET  /contracts  /gigs  /rides  /reviews                   POST /reviews/:id/hide
GET  /audit?page=
POST /auth/reauth { password } → token ngắn hạn 5 phút cho thao tác nguy hiểm
```
Thay đổi vào xóm đang chạy phải đi qua `room.run(...)` (hàng đợi xóm) như intent của người chơi, rồi `pushMe` / `emitWorld`.

## 4. Thành phần UI dùng chung (tách ra trước khi làm admin)

Đưa vào `apps/web/ui-kit/` (dùng cho cả game và admin): `Card`, `StatTile`, `Tabs` (đã có), `Sheet`/`Modal` (đã có), `Button`
(các biến thể đỏ/lá/kem/mực), `Badge`, `MoneyText` (💵/🏦, vnd/vndShort), `Avatar` (chân dung model), `EmptyState`,
`DataTable` (PC: bảng; mobile: thẻ), `Sparkline`, `BarChart`. Màu + font lấy từ token đang có trong `globals.css`.

## 5. Kiểm chứng

- e2e server `admin.e2e-spec.ts`: không có role → 403; admin cộng tiền → sổ cái `system:admin` cân, AdminAction ghi; khoá tài
  khoản → đăng nhập bị từ chối + socket bị ngắt; chỉnh giờ xóm → client nhận `clock`.
- Playwright `admin.spec.ts` (iPhone + Pixel + thêm project desktop 1280×800): đăng nhập admin, mở `/quan-tri`, tìm người chơi,
  cộng tiền có lý do, thấy trong nhật ký; người chơi thường mở `/quan-tri` → về trang chủ.
- Không có link `/quan-tri` trong bundle game (kiểm bằng grep trong build output).

## 6. Thứ tự làm (ước lượng)

1. Prisma (`role`, `bannedUntil`, `AdminAction`), script `admin:grant`, `AdminGuard`, `/overview` + `/players` (đọc) — 1 phiên.
2. UI khung `/quan-tri` (layout responsive, đăng nhập lại, Tổng quan, Tài khoản đọc) — 1 phiên.
3. Thao tác tài khoản (tiền, khoá, kick, chuyển xóm) + nhật ký — 1 phiên.
4. Xóm + Làm ăn + Kinh tế (biểu đồ) — 1–2 phiên.
5. Việc & giao dịch, Hệ thống, cảnh báo bất thường — 1 phiên.
