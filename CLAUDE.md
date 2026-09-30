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

## Quy trình khi xong mỗi việc (bắt buộc)
1. `pnpm lint && pnpm typecheck && pnpm test`
2. **`pnpm deploy:local`** — build lại Docker và deploy bản production lên **http://localhost:5555** (script chờ health check; fail thì chưa được coi là xong).
- Stack production: `deploy/docker-compose.prod.yml` (project `xom-prod`, DB riêng, mật khẩu trong `deploy/.env` tự sinh, không commit). Chỉ mở cổng 5555; Next proxy `/api` + `/socket.io` sang server nội bộ.
- Không chạy `pnpm build` khi `pnpm dev` đang chạy (nest build xóa `dist` của dev server).
- Không chạy `pnpm deploy --prod` ở máy local — nó làm hỏng `node_modules` của workspace (chỉ dùng trong Dockerfile).

## Local dev
- `pnpm dev` → web :3000 + server :4000 (Next rewrites `/api` và `/socket.io` sang :4000, nên chỉ cần mở :3000).
- `pnpm lint` / `pnpm format` (Biome), `pnpm typecheck`, `pnpm test`; e2e server: `pnpm --filter @xom/server test:e2e`.
- `GAME_TICK_MS=150 pnpm dev` → tăng tốc đồng hồ game khi test tay (mặc định 1000ms = 1 phút game).
- `pnpm balance` → mô phỏng kinh tế 30 ngày mọi chiến lược; chạy lại mỗi khi đổi số liệu trong `packages/content`.
- `pnpm assets` → build lại model từ `art/vendor` + `art/export` theo `packages/assets/bundles.json`.
- Prisma 7: config ở `apps/server/prisma7.config.ts`, client sinh vào `apps/server/src/generated/prisma`; migrate: `pnpm --filter @xom/server exec prisma migrate dev`.
- `docker compose up -d` → Postgres (5432, xom/xom/xom) + Redis (6379).
- MCP `playwright-mobile` dùng Chrome hệ thống (`--browser chrome`) để không lệch version Chromium của Playwright.
- MCP `postgres` chạy ở chế độ restricted (chỉ đọc), dùng `DATABASE_URL` hoặc URL mặc định trên.
- Test HTTPS trên điện thoại (service worker, PWA, Web Share): `cloudflared tunnel --url http://localhost:3000`.
- Blender 5.2.2: lệnh `blender` (cài ở `~/Applications`), export glTF headless bằng `blender -b file.blend -P script.py`.
