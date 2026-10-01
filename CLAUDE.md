# XÓM

Game mô phỏng cuộc sống + kinh doanh Việt Nam, multiplayer. Plan chi tiết: docs/PLAN.md.

Bối cảnh: làm **1 người**; **chưa kiếm tiền** (không thiết kế monetization); đăng nhập **username + mật khẩu** (OAuth để sau); **tự host trên máy nhà** bằng Docker, sau này đưa ra Internet qua Cloudflare Tunnel. Package dùng tên `@xom/*`.

## Nguyên tắc bắt buộc
- **Mobile-first**: thiết kế cho 360×640 portrait trước. Mọi thay đổi UI phải kiểm tra bằng MCP `playwright-mobile` (Pixel 7). Tính năng nặng về render thì trace bằng `chrome-devtools` với CPU throttling. Tuân thủ performance budget trong docs/PLAN.md §1.
- **Server-authoritative**: client chỉ gửi intent; mọi thay đổi tiền đi qua LedgerService (số nguyên VND, không float).
- **Content qua config**: nghề/sản phẩm mới = thêm config trong `packages/content` (validate bằng zod), không hard-code theo loại shop.
- Công thức kinh tế nằm trong `packages/sim` (pure TS, không phụ thuộc NestJS), có unit test.
- Tra tài liệu thư viện qua MCP `context7` trước khi dùng API của Next.js/NestJS/Prisma/R3F.
- Ưu tiên giải pháp đơn giản, ít thành phần (làm một mình): không thêm service/dashboard nếu script + MCP `postgres` là đủ.

- Bảng theo dõi tính năng: `docs/FEATURES.md` — **cập nhật trạng thái (✅/🚧/⏳/💤) cùng commit với code** mỗi khi xong/bắt đầu một tính năng.
- Kế hoạch nghề nghiệp: `docs/NGHE.md` (nghề đợt 1, cơ chế lõi dùng chung, lộ trình 1.12–1.15).
- Kế hoạch thế giới sống: `docs/THEGIOI.md` (Chuyện của tôi, lịch, khu phố, khi vắng mặt, giao thông, luật & hậu quả).
- Use case & kịch bản: `docs/USECASES.md` — tính năng mới phải có use case (luồng, tình huống đời thật, luật game, kiểm chứng) và kịch bản Playwright tương ứng trong `apps/web/e2e`.
- Tiền chỉ vào ví khi người chơi **làm** (làm món + tính tiền, việc vặt…); không thêm thu nhập tự động.
- Không dùng `<Html>` của drei (lỗi root với React 19 StrictMode): khung thoại đi qua `BubbleLayer` (DOM) + `BubbleProjector` (canvas).

## Luật thiết kế (bắt buộc — chi tiết ở docs/DESIGN.md)
- Mỗi tính năng phải phục vụ vòng lặp: khám phá → gặp người → kiếm/tiêu tiền → làm ăn → nâng cấp cuộc sống → sự kiện chung.
- **Camera thống nhất mọi cảnh**: góc nhìn thứ ba; 1 ngón kéo = xoay/nghiêng, chạm = đi/tương tác, 2 ngón = thu phóng (+ vặn xoay). Không nút xoay trên màn hình.
- **Tiền Việt thật**: mệnh giá 1k…500k, không tiền lẻ dưới 500đ; tách 💵 tiền mặt / 🏦 ngân hàng; ⭐ uy tín và 🏆 danh tiếng có giá trị nhưng không phải tiền.
- **Money sink bắt buộc**: nguồn thu mới phải kèm chỗ tiêu (thuê, ăn, xăng, thuế/phí, bảo trì, nguyên liệu, lương, trang trí, xe, nhà); chạy `pnpm balance`; không thu nhập thụ động không trần.
- **Tiến trình nhìn thấy được**: cá nhân (cấp, kinh nghiệm, kỹ năng, uy tín), làm ăn (xe đẩy → tiệm → tiệm lớn → chuỗi), xã hội (vô danh → nổi tiếng). Mở khoá bằng làm thật.
- **Làm ăn có rủi ro**: nhà cung cấp → kho → giá → tiếp thị → khách → đánh giá → doanh thu; tồn kho, hỏng, đối thủ, giá biến động, phàn nàn, trào lưu.
- **Thế giới thay đổi buộc thích nghi**: giờ trong ngày, thời tiết (nắng/mưa/bão/âm u), giao thông giờ cao điểm, đám đông.
- **Sự kiện** cá nhân / khu phố / toàn server / do người chơi tạo — đều là dữ liệu.
- **Âm thanh là bản sắc**: BGM, SFX, ambient (xe máy, tiếng rao, quán ăn, còi, mưa), UI, nhân vật, xe, làm ăn; chỉnh riêng từng lớp.
- **HUD tối giản**: hệ thống phức tạp vào menu/sheet; thêm nút lên màn hình chính phải bỏ/gộp nút khác.
- **Chống gian lận**: client chỉ gửi ý định; server kiểm sở hữu, giá, vị trí (đứng gần), giờ, thời gian đi bộ rồi mới đổi tiền.
- **Dữ liệu điều khiển**: NPC, món, nghề, xe, nội thất, nhiệm vụ, sự kiện, công trình là config trong `packages/content`.
- **Đo lường** qua bảng `GameEvent` (phiên, giữ chân, nghề chọn, tiền theo `reason`, nơi bỏ cuộc). **Giữ chân lành mạnh**: không điểm danh ép buộc, không thông báo dồn dập.

## Quy trình khi xong mỗi việc (bắt buộc)
1. `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @xom/server test:e2e`
   + kịch bản Playwright: `GAME_TICK_MS=250 pnpm dev` rồi `pnpm --filter @xom/web test:e2e`
2. **`pnpm deploy:local`** — build lại Docker và deploy bản production lên **http://localhost:5555** (script chờ health check; fail thì chưa được coi là xong).
- Stack production: `deploy/docker-compose.prod.yml` (project `xom-prod`, DB riêng, mật khẩu trong `deploy/.env` tự sinh, không commit). Chỉ mở cổng 5555; Next proxy `/api` + `/socket.io` sang server nội bộ.
- Không chạy `pnpm build` khi `pnpm dev` đang chạy (nest build xóa `dist` của dev server).
- Không chạy `pnpm deploy --prod` ở máy local — nó làm hỏng `node_modules` của workspace (chỉ dùng trong Dockerfile).

## Local dev
- `pnpm dev` → web :5000 + server :5001 (Next rewrites `/api` và `/socket.io` sang :5001, nên chỉ cần mở :5000). Dev dùng dải cổng 50xx để không đụng app khác trên máy.
- `pnpm lint` / `pnpm format` (Biome), `pnpm typecheck`, `pnpm test`; e2e server: `pnpm --filter @xom/server test:e2e`.
- `GAME_TICK_MS=250 pnpm dev` → tăng tốc đồng hồ game khi test tay (mặc định 1000ms = 1 phút game).
- `pnpm balance` → mô phỏng kinh tế 30 ngày mọi chiến lược; chạy lại mỗi khi đổi số liệu trong `packages/content`.
- `pnpm analytics` → báo cáo đo lường từ DB (DAU/MAU, phiên, giữ chân, nơi bỏ cuộc, nghề chọn, tiền theo lý do); production: thêm `DATABASE_URL=…`.
- Đổi `packages/content` khi `pnpm dev` đang chạy: **khởi động lại dev** (server Nest không tự nạp lại content).
- `pnpm assets` → build lại model từ `art/vendor` + `art/export` theo `packages/assets/bundles.json`.
- Prisma 7: config ở `apps/server/prisma7.config.ts`, client sinh vào `apps/server/src/generated/prisma`; migrate: `pnpm --filter @xom/server exec prisma migrate dev`.
- `docker compose up -d` → Postgres (5432, xom/xom/xom) + Redis (6379).
- MCP `playwright-mobile` dùng Chrome hệ thống (`--browser chrome`) để không lệch version Chromium của Playwright.
- MCP `postgres` chạy ở chế độ restricted (chỉ đọc), dùng `DATABASE_URL` hoặc URL mặc định trên.
- Test HTTPS trên điện thoại (service worker, PWA, Web Share): `cloudflared tunnel --url http://localhost:5000`.
- Blender 5.2.2: lệnh `blender` (cài ở `~/Applications`), export glTF headless bằng `blender -b file.blend -P script.py`.
