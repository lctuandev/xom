# XÓM — Kế hoạch triển khai (Mobile-first)

> **XÓM** — game mô phỏng cuộc sống + kinh doanh đời thường Việt Nam, multiplayer.
> Stack: **Next.js** (client) · **NestJS** (game server) · **PostgreSQL + Redis**.
> Ưu tiên số 1: **trải nghiệm trên điện thoại** (mobile web / PWA), desktop là phụ.

## Bối cảnh dự án (đã chốt)

| | Quyết định |
|---|---|
| Team | **1 người** (+ Claude hỗ trợ code, script, tài liệu). Blender đã cài ở `~/Applications` |
| Kiếm tiền | **Chưa làm.** Mục tiêu hiện tại: chơi cho vui. Không thiết kế gì xoay quanh monetization |
| Đăng nhập | **Tài khoản thường: username + mật khẩu.** Google/Zalo… để sau |
| Hosting | **Máy tính cá nhân** (Ubuntu, Docker). Sau này đưa ra Internet qua **Cloudflare** (Tunnel) |
| Tên game | **XÓM**. Mỗi phòng chơi là một "xóm" |

---

## 0. Các quyết định kiến trúc

| # | Quyết định | Lựa chọn | Lý do |
|---|---|---|---|
| D1 | Nền tảng phát hành | **Mobile web → PWA** trước; bọc **Capacitor** lên CH Play/App Store rất lâu sau | Dùng lại 100% code Next.js; gửi link qua Zalo/Messenger là chơi ngay |
| D2 | Renderer | **Three.js + React Three Fiber**, low-poly stylized, camera orthographic cố định nhìn dọc phố | Hợp style "stylized low-poly"; Kenney/Quaternius có sẵn nhiều kit 3D CC0 dạng glTF; biển hiệu chữ Việt render lúc runtime |
| D2b | Phương án dự phòng | Nếu thử nghiệm hiệu năng ở Phase 0 không đạt trên Android tầm trung → **render sẵn sprite isometric** từ chính các model glTF + PixiJS | Không mất công asset, chỉ đổi runtime |
| D3 | Realtime | **Socket.IO qua NestJS Gateway** | Game quản lý/kinh doanh, không cần netcode phức tạp. Bọc sau interface `RoomTransport` để sau này đổi được |
| D4 | Authority | **Server quyết định 100%**: client chỉ gửi *intent*, server tính tiền/tồn kho/doanh số | Bắt buộc khi có kinh tế giữa người chơi |
| D5 | Tiền tệ | Mọi thay đổi tiền đi qua **Ledger (sổ cái kép)**, số nguyên VND | Audit được, không bao giờ "tiền từ đâu ra" |
| D6 | Nội dung | **Business Template + config** (FOOD / RETAIL / SERVICE / DELIVERY / CONTENT) | Thêm nghề mới = thêm file config |
| D7 | Dữ liệu | **Prisma + PostgreSQL**; Redis cho trạng thái phòng, presence, BullMQ | Typed, migration rõ ràng |
| D8 | Monorepo | **pnpm workspaces + Turborepo**, package tên `@xom/*`; lint + format bằng **Biome** (một công cụ cho cả web/server) | Chia sẻ type/schema/công thức giữa web và server; ít cấu hình khi làm một mình |
| D9 | Auth | username + mật khẩu (**argon2id**), JWT access ngắn hạn + refresh token xoay vòng (httpOnly cookie) | Đơn giản, không phụ thuộc bên thứ ba; thêm OAuth sau không phải làm lại |
| D10 | Hosting | **Docker Compose trên máy nhà** → **Cloudflare Tunnel** (không mở port router) + Cloudflare cache asset tĩnh | Miễn phí; server đặt ở VN nên ping thấp cho người chơi VN; Cloudflare gánh băng thông tải asset |

### Nguyên tắc làm một mình
- **Cắt trước, thêm sau**: cái gì không phục vụ câu hỏi "vòng chơi có vui không?" thì dời lại.
- Không làm admin dashboard riêng → dùng **script CLI + MCP `postgres`** để xem/chỉnh dữ liệu.
- Không dựng hệ thống analytics → ghi sự kiện vào 1 bảng `GameEvent` trong Postgres, query khi cần.
- Mỗi phase kết thúc bằng **bản chơi được trên điện thoại**, dù xấu.

---

## 1. Tiêu chuẩn Mobile-first (áp dụng cho MỌI tính năng)

**Thiết bị mục tiêu**
- iPhone (đang test trên iPhone 16 Pro), Safari và PWA iOS.
- Android: dùng giả lập Pixel 7 (MCP `playwright-mobile`); không đo riêng máy tầm trung.
- Màn hình thiết kế gốc: **360×640 dọc**, test thêm 402×874 (iPhone 16 Pro) và 412×915.
- Mật độ giao diện: gọn, không phóng to — chữ thân 14–15px, nút chính 44px, nút phụ 40px.

**Ngân sách hiệu năng**

| Hạng mục | Ngưỡng |
|---|---|
| FPS | mục tiêu 60, **sàn 30** trên Android tầm trung |
| Draw calls / frame | < 100 |
| Triangles trên màn hình | < 80k |
| Bộ nhớ texture | < 64 MB |
| JS shell (trước khi load game) | < 250 KB gzip |
| Tải lần đầu đến khi chơi được | < 5 MB, < 6s trên 4G |
| Độ trễ mạng | p95 < 100 ms trong VN (server đặt tại nhà, qua Cloudflare) |

**Kỹ thuật render cho mobile**
- `dpr` giới hạn `[1, 1.5]`, adaptive quality (drei `PerformanceMonitor`) tự hạ chất lượng khi FPS tụt.
- Không đổ bóng real-time → blob shadow / baked. Material `MeshLambert`/toon, **1 texture palette dùng chung**.
- `InstancedMesh` cho prop lặp (ghế, cây, đèn); glTF nén **meshopt** + texture **KTX2/WebP** qua `gltf-transform`.
- App xuống nền → dừng vòng render; server vẫn chạy mô phỏng.
- Xử lý WebGL context lost (hay gặp trên iOS).

**Tương tác & UI**
- Màn hình dọc, **chạm để đi**, pinch để zoom. Camera bám theo người chơi, nhìn **dọc theo con phố** (phố chạy từ dưới lên màn hình) để dãy nhà không che vỉa hè.
- Mọi thao tác quản lý nằm trong **bottom sheet** (vùng ngón cái), nút ≥ 44×44 px.
- HUD trên cùng tối giản: tiền · giờ trong game · reputation. Thanh điều hướng dưới: Bản đồ · Cửa hàng · Túi đồ · Xóm.
- `env(safe-area-inset-*)`, `touch-action: none` trên canvas, `overscroll-behavior: none`, chặn double-tap zoom.
- Chat: **câu nói nhanh + emote** là chính, gõ chữ là phụ.
- Mời bạn vào xóm qua **Web Share API** (mở Zalo/Messenger).

**Mạng & vòng đời**
- Socket.IO chỉ dùng WebSocket; tự reconnect khi app quay lại (`visibilitychange`).
- Mỗi message server có `seq`; reconnect gửi `lastSeq` → server trả delta hoặc snapshot đầy đủ.
- Payload nhỏ: tọa độ số nguyên, key ngắn.

**PWA**
- `manifest.webmanifest` (standalone, portrait, icon maskable), service worker (Serwist) cache asset 3D + font.
- ⚠️ Service worker, Web Share, cài PWA **cần HTTPS** → khi test trên điện thoại dùng **Cloudflare Quick Tunnel** (`cloudflared tunnel --url http://localhost:5000`, miễn phí, không cần tài khoản/tên miền) thay vì truy cập bằng IP LAN.

**Quy trình kiểm tra**: mọi thay đổi UI phải được kiểm tra bằng MCP `playwright-mobile` (Pixel 7) + thử trên máy thật. Tính năng nặng về render phải trace bằng `chrome-devtools` (CPU throttling 4×).

---

## 2. Kiến trúc tổng thể

```text
┌────────────── Điện thoại (Chrome / Safari / PWA) ──────────────┐
│  Next.js: /  (landing) · /dang-nhap · /play (R3F canvas + HUD)  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS / WSS
                     ┌──────────▼──────────┐
                     │  Cloudflare         │  cache asset tĩnh (glb, _next/static)
                     │  (Tunnel, WAF free) │  chống DDoS, ẩn IP nhà
                     └──────────┬──────────┘
                                │ cloudflared (outbound, không mở port router)
┌────────────── Máy tính nhà (Ubuntu + Docker Compose) ───────────┐
│  :5555 ──► web (Next.js) ──proxy /api, /socket.io──► server :4000 │
│                                                                  │
│  NestJS: AuthModule · PlayerModule · ContentModule               │
│          WorldModule (GameGateway, RoomService, Tick loop)       │
│          EconomyModule (Demand, Pricing, Ledger)                 │
│          BusinessModule · InventoryModule · SocialModule         │
│          Workers BullMQ: cuối ngày, hàng hỏng, backup            │
│                                                                  │
│  postgres :5432 (bền vững)     redis :6379 (phòng, presence, queue)│
└──────────────────────────────────────────────────────────────────┘
```

Web và API **cùng một origin**: Next.js `rewrites` proxy `/api/*` và `/socket.io` (kể cả WebSocket) sang server, ở cả dev (:5000) lẫn production (:5555). Cookie refresh token hoạt động đơn giản, không cần CORS; Cloudflare Tunnel chỉ cần trỏ vào một cổng.

### Cấu trúc thư mục

```text
xom/
├─ apps/
│  ├─ web/                 # Next.js
│  │  ├─ app/(public)/     # landing, đăng ký, đăng nhập
│  │  ├─ app/play/         # game shell (client-only)
│  │  ├─ game/scene/       # R3F: Map, Lot, Character, Camera, Input
│  │  ├─ game/ui/          # HUD, BottomSheet, DaySummary...
│  │  ├─ game/net/         # socket client, resync, interpolation
│  │  └─ game/store/       # Zustand
│  └─ server/              # NestJS
│     ├─ src/modules/...
│     └─ prisma/schema.prisma
├─ packages/
│  ├─ shared/              # @xom/shared — zod schemas socket/REST, types, hằng số
│  ├─ sim/                 # @xom/sim — công thức kinh tế thuần TS (không phụ thuộc NestJS)
│  ├─ content/             # @xom/content — templates, products, equipment, lots, NPC (JSON + zod)
│  └─ assets/              # pipeline gltf-transform + manifest
├─ art/                    # file .blend nguồn, style bible, concept
├─ tools/balance/          # mô phỏng headless N ngày để cân bằng kinh tế
├─ tools/ops/              # backup, tạo/reset tài khoản, seed
├─ deploy/                 # docker-compose.prod.yml, cloudflared config
├─ docs/
└─ .mcp.json
```

---

## 3. Thiết kế hệ thống game (phạm vi MVP)

### 3.1 Phạm vi MVP
**1 xóm · tối đa 4 người chơi/phòng · 5 loại NPC · 3 business · 2 template.**

| Business | Template | Đặc điểm |
|---|---|---|
| 🥖 Bánh mì | FOOD | hàng hỏng cuối ngày, đông sáng sớm, cần chế biến |
| 🧋 Trà sữa | FOOD (drink) | đông chiều/tối, biên lợi nhuận cao, nhạy với trend |
| 🛍️ Phụ kiện | RETAIL | không hỏng, bán chậm, vốn nhập lớn hơn |

NPC MVP: khách vãng lai · học sinh/sinh viên · dân văn phòng · reviewer (hiếm) · chủ chợ đầu mối (supplier).

### 3.2 Đồng hồ game
- **1 giờ game = 1 phút thật → 1 ngày game = 24 phút** (config).
- Economy tick: mỗi **5 phút game (5s thật)**. Movement tick: **10 Hz**.

### 3.3 Mô hình nhu cầu (`packages/sim`)

```text
customers(l,h,c) = footTraffic(l,h) × interest(c,h) × eventMultiplier
attractiveness(b) = (refPrice / price)^elasticity × repFactor(b) × qualityFactor(b) × distanceDecay(b,l)
share(b)          = attractiveness(b) / (Σ attractiveness các shop cùng danh mục trong bán kính + outsideOption)
sales(b)          = min( round(customers × share(b)), inventory(b), serviceCapacity(b) )
```

- `outsideOption` = khách không mua ai → giá quá cao thì bán ít, dù không có đối thủ.
- Cạnh tranh giữa người chơi xuất hiện **tự nhiên** qua `share`.
- Hết hàng / chờ lâu → satisfaction giảm → reputation giảm.
- **NPC hiển thị chỉ là minh họa của doanh số đã tính**, không mô phỏng từng NPC → server nhẹ, chạy tốt trên máy nhà.

### 3.4 Reputation
EMA của satisfaction (giá hợp lý, thời gian chờ, chất lượng, hết hàng).
Sự kiện reviewer: hiếm, tác động ×3–×5 trong 1–2 ngày → thông báo cả xóm "🔥 Bánh mì Tuấn đang viral".

### 3.5 Ví dụ config nội dung

```jsonc
// packages/content/products/banh_mi.json
{
  "id": "banh_mi",
  "template": "FOOD",
  "category": "breakfast",
  "name": "Bánh mì thịt",
  "unitCost": 8000,
  "refPrice": 15000,
  "elasticity": 1.6,
  "prepSeconds": 20,
  "shelfLifeDays": 1,
  "interestByHour": { "6": 2.0, "7": 2.2, "8": 1.6, "11": 1.0, "17": 0.8, "21": 0.3 },
  "requiresEquipment": ["xe_banh_mi"],
  "visual": { "props": ["cart_glass", "baguette_stack"], "signText": "BÁNH MÌ {ownerName}" }
}
```

Template quy định **hành vi**, product chỉ là **số liệu**. Toàn bộ config validate bằng zod lúc build và lúc server khởi động.

### 3.6 Vòng chơi MVP

```text
Đăng ký → vào xóm với 500.000đ
  ├─ Đi làm thuê cho quán NPC (kiếm vốn, học cơ chế)   ← an toàn
  └─ Mua xe đẩy (300k) / thuê sạp theo ngày
        ↓
Ra chợ đầu mối nhập hàng
        ↓
Chọn chỗ bán (lot) — mỗi chỗ đông khách theo giờ khác nhau, có phí
        ↓
Đặt giá → Mở bán → khách NPC / người chơi khác tới mua
        ↓
Cuối ngày: báo cáo (doanh thu · chi phí · hàng hỏng · lãi/lỗ · reputation)
        ↓
Nâng cấp (xe tốt hơn → sạp → mặt bằng) / đổi nghề / mở thêm
```

Vì không kiếm tiền, **không có** năng lượng giới hạn, chờ thời gian để ép trả phí hay tiền tệ cao cấp. "Money sink" (tiền thuê, hàng hỏng, bảo trì) chỉ để giữ kinh tế cân bằng.

### 3.7 Mô hình dữ liệu (Prisma, rút gọn)

```text
User(id, username UNIQUE, passwordHash, createdAt, lastLoginAt)
Session(id, userId, refreshTokenHash, userAgent, expiresAt, revokedAt)
Player(id, userId, displayName, avatarConfig, reputation)
Wallet(id, ownerType[PLAYER|BUSINESS|SYSTEM], ownerId, balance BIGINT)
LedgerEntry(id, txId, walletId, amount BIGINT, reason, refType, refId, createdAt)
District(id, name, mapConfig)            ← một "xóm"
Lot(id, districtId, slot, trafficProfile, rentPerDay)
Business(id, ownerPlayerId, template, productIds[], lotId?, level, reputation, status)
BusinessMember(businessId, playerId, role)                 ← co-op (Phase 5)
Equipment(id, businessId, defId, condition)
InventoryItem(id, ownerType, ownerId, productId, qty, batchDay)
PriceSetting(businessId, productId, price)
DailyReport(businessId, gameDay, revenue, cost, spoiled, customers, satisfaction)
Review(id, businessId, reviewerType[NPC|PLAYER], stars, text, gameDay)
Room(id, districtId, code, maxPlayers, status)
GameEvent(id, playerId?, type, payload JSONB, createdAt)   ← thay cho analytics
```

Quy tắc: `Wallet.balance` chỉ cập nhật **trong cùng transaction** với `LedgerEntry`; tổng entry của 1 `txId` = 0.

### 3.8 Đăng nhập (D9)
- Đăng ký: `username` (3–20 ký tự, a-z 0-9 _, không phân biệt hoa thường) + mật khẩu (≥ 8 ký tự) + tên hiển thị (cho phép tiếng Việt có dấu).
- Hash **argon2id**. Giới hạn số lần đăng nhập sai theo IP + username (khi có Cloudflare dùng header `CF-Connecting-IP`).
- Access token JWT 15 phút (lưu trong bộ nhớ, gửi kèm socket handshake `auth.token`); refresh token 30 ngày, **xoay vòng**, lưu hash trong `Session`, gửi bằng cookie `httpOnly; Secure; SameSite=Lax; Path=/api/auth`.
- Mặc định "ghi nhớ đăng nhập" (người chơi mobile không muốn gõ lại).
- Chưa có email → **quên mật khẩu** xử lý bằng lệnh `tools/ops reset-password <username>`. Email/OAuth thêm sau, bảng `User` đã sẵn chỗ để liên kết.

### 3.9 Giao thức socket (zod trong `packages/shared`)

| Hướng | Event | Payload chính |
|---|---|---|
| C→S | `room:join` | roomCode, lastSeq? |
| C→S | `move:to` | x, z |
| C→S | `biz:setPrice` / `biz:open` / `biz:close` | businessId, ... |
| C→S | `market:buy` | productId, qty |
| C→S | `shop:purchase` | businessId, productId, qty (người chơi mua của người chơi) |
| C→S | `chat:quick` | phraseId / emoteId |
| S→C | `room:snapshot` | toàn bộ trạng thái phòng + seq |
| S→C | `room:delta` | thay đổi từ seq trước |
| S→C | `pos` | vị trí người chơi (10 Hz, gộp) |
| S→C | `sale` | businessId, qty, npcArchetype |
| S→C | `notify` | toast/sự kiện |

Mọi handler: validate zod → kiểm tra quyền → rate limit → gọi service → phát delta.

---

## 4. Lộ trình theo giai đoạn (1 người, ≈ 20 tuần)

> Mỗi phase có **điều kiện hoàn thành**; chưa đạt thì chưa sang phase sau. Thời gian chỉ là ước lượng.

### Phase 0 — Nền móng + thử hiệu năng trên điện thoại (Tuần 1–3)
**Hạ tầng**
- [x] MCP servers (context7, playwright-mobile, chrome-devtools, postgres) — `.mcp.json`
- [x] `docker-compose.yml` Postgres 17 + Redis 7
- [x] Blender 5.2.2 (`~/Applications`, lệnh `blender`)
- [x] Monorepo pnpm + Turborepo, TS strict, Biome, Vitest
- [x] `apps/web`: Next.js 16 + Tailwind 4, viewport/safe-area, layout dọc, manifest PWA, font Be Vietnam Pro
- [x] `apps/server`: NestJS 12 + Prisma 7 (User, Session) + `/api/health` + Socket.IO gateway (ping/Ack)
- [x] `packages/shared`: zod contract + quy ước `Ack<T>` (mọi intent đều được trả lời), dùng ở cả 2 phía
- [x] Script `pnpm tunnel` chạy Cloudflare Quick Tunnel để test HTTPS trên điện thoại
- [x] Git hook (lint + typecheck trước commit) — thay cho CI khi làm một mình
- [x] `packages/assets`: pipeline glTF (bundle + meshopt + scale bake) → `apps/web/public/assets/models`

**Thử hiệu năng (quan trọng nhất phase này)**
- [x] Scene R3F: 1 con phố Kenney City Kit, prop instancing, 10 nhân vật có animation, camera bám theo, chạm để đi, pinch zoom, bảng số đo (FPS/draw call/tris)
- [x] Đo trong headless (Pixel 7): ~50 draw call, ~50k tris, tổng asset ~620 KB — **đạt ngân sách**
- [x] iPhone thật: 60 FPS ổn định → **chốt D2: giữ R3F** (bỏ bước đo Android tầm trung theo quyết định của bạn)
- [ ] **Cổng quyết định D2**: ≥ 30 FPS ổn định → giữ R3F; không đạt → phương án D2b

**Art**
- [x] Style bible v0 + palette → `docs/art/STYLE.md`
- [x] Ghế nhựa đỏ làm bằng script Blender (`art/blender/ghe_nhua.py`, ~200 tris) — pipeline Blender → glTF → game chạy trọn

**Hoàn thành khi**: `pnpm dev` chạy cả web + server; mở bằng điện thoại qua quick tunnel thấy con phố 3D có ghế nhựa tự làm, chạm để đi được, ≥ 30 FPS; đã chốt renderer.

### Phase 1 — Tài khoản + vòng chơi 1 người (Tuần 4–9)
- [x] Đăng ký / đăng nhập / đăng xuất (mục 3.8) — màn hình tối ưu cho mobile, refresh token xoay vòng, giới hạn đăng nhập sai
- [x] `packages/content`: 2 template, 3 product, 3 thiết bị, 8 lot, 5 traffic profile, 5 NPC, 2 việc làm + zod + kiểm tra tham chiếu chéo
- [x] `packages/sim`: demand model, cạnh tranh, hàng hỏng, FIFO, satisfaction/reputation — 14 unit test
- [x] LedgerService + Wallet (sổ cái kép, trừ tiền có điều kiện chống âm ví)
- [x] Bắt đầu với 500k → màn chào: mua xe / đi làm thuê / đi dạo
- [x] Chợ đầu mối (giá dao động theo ngày), chọn chỗ bán (trả tiền thuê khi mở), đặt giá, mở/đóng; hết hàng tự dọn quầy
- [x] Báo cáo cuối ngày (modal) — ngày chơi 06:00–22:00, ban đêm bỏ qua
- [x] NPC minh họa đi tới mua dựa trên event `sale`
- [x] Biển hiệu tiếng Việt render runtime theo tên chủ quầy
- [x] HUD + thanh điều hướng (Bản đồ · Kinh doanh · Chợ · Việc làm) + bottom sheet nằm trên nav
- [x] Asset Việt: xe bánh mì, xe trà sữa, sạp phụ kiện (`art/blender/xe_hang.py`)
- [ ] Bàn inox
- [x] `tools/balance` (`pnpm balance`): 720 chiến lược × 30 ngày → CSV + cảnh báo cân bằng
- [x] Lưu tiến trình: mọi thay đổi ghi DB ngay; đồng hồ xóm lưu mỗi 10 phút game
- [x] Test e2e cả vòng chơi (9 test) với đồng hồ tăng tốc `GAME_TICK_MS`
- [ ] Playtest 5 người trên điện thoại ← **cần bạn**

**Hoàn thành khi**: 5 người bạn chơi thử **trên điện thoại của họ** 20 phút, tự hiểu vòng chơi, ≥ 3/5 muốn chơi tiếp; không chiến lược nào "phá game".

### Phase 1.5 — Chiều sâu gameplay: kịch bản, hướng dẫn, hành động (làm ngay sau Phase 1)
Mục tiêu: mỗi tính năng là một **việc làm trong thế giới**, không phải một nút bấm trong menu.

**Địa điểm có người thật** (dữ liệu trong `packages/content`, mỗi nơi có NPC đứng quầy + biển hiệu):

| Nơi | Người | Làm gì ở đây |
|---|---|---|
| Vựa xe Ông Sáu | Ông Sáu | Mua / đổi xe hàng |
| Chợ đầu mối | Bà Năm | Nhập hàng |
| Quán cơm Cô Tư | Cô Tư | Xin việc phụ quán |
| Bưu cục | Anh Tám | Xin việc giao hàng |
| Góc phố | Chú Bảy xe ôm | Dẫn đường người mới |

**Quy tắc "phải có mặt"**
- Muốn mua xe / nhập hàng / xin việc → nhân vật **đi bộ tới nơi**; tới gần thì hiện nút hành động ("🧺 Vào chợ"). Thanh điều hướng dưới vẫn dùng được: bấm "Chợ" = tự đi tới chợ rồi mở.
- Quầy chỉ bán khi **chủ đứng ở quầy**. Rời quầy → khách không mua, HUD báo "Quầy vắng chủ" kèm nút "Về quầy".
- Đi làm thuê phải ở chỗ làm; rời đi = nghỉ việc.

**Phục vụ khách (hành động chính khi bán)**
- Mỗi lượt bán server phát "đơn": khách đi tới quầy, bong bóng gọi món ("🥖 ×2").
- Chủ quầy bấm **"Đưa hàng"** trong ~10 giây → khách vui: **tiền boa** + tăng uy tín. Chậm → khách càu nhàu rồi đi, không có boa.
- Khách nói theo giá: rẻ → "Rẻ vậy, mai ghé nữa!", đắt → "Hơi mắc ha…".

**Làm thuê có việc cụ thể**: định kỳ có "Bàn 3 gọi cơm!" → bấm "Bưng ra" kịp thời được thưởng thêm.

**Kịch bản người mới (Chú Bảy)** — rẽ nhánh theo lựa chọn:
```text
Gặp Chú Bảy ──► "Con muốn buôn bán"  ─► Tới vựa xe Ông Sáu mua xe ─► Ra chợ Bà Năm nhập hàng
            │                          ─► Chọn chỗ bán (gợi ý Đầu hẻm 12) ─► Tới chỗ, mở quầy
            │                          ─► Phục vụ 3 khách đầu tiên ─► Chú Bảy dặn dò, xong
            └► "Con đi làm thuê trước" ─► Tới quán cơm Cô Tư xin việc ─► Bưng 2 mâm cơm
                                       ─► Chú Bảy: "Có vốn thì ghé vựa xe Ông Sáu nha" , xong
```
- Dòng nhiệm vụ luôn hiện trên HUD (việc cần làm + khoảng cách), mũi tên 3D chỉ tới nơi cần đến.
- Tiến độ kịch bản lưu trên server (`Player.tutorial`).

**Công việc**
- [ ] Nội dung: địa điểm, NPC, câu thoại, kịch bản (data-driven)
- [ ] Server: có mặt ở quầy, đơn khách + boa, việc vặt khi làm thuê, lưu tiến độ kịch bản
- [ ] Client: đi tới nơi → nút hành động, hội thoại NPC, dòng nhiệm vụ + mũi tên, bong bóng khách, nút "Đưa hàng"
- [ ] Kiểm thử kịch bản bằng Playwright (Pixel 7 + iPhone 16 Pro)

### Phase 1.6 → 1.9 — "Làm thật" (chi tiết từng thao tác: `docs/USECASES.md`)
- **1.6 Làm thật ✅:** thoại trên đầu nhân vật, nói chuyện NPC + thân thiết, câu rao hàng; chợ bán **nguyên liệu**;
  khách gọi món cụ thể → **tự tay làm** bánh mì / trà sữa / chọn phụ kiện → **tính tiền, thối tiền**; tiền chỉ vào khi giao món.
- **1.7 Vào làm ✅:** mỗi nơi làm có **không gian 3D riêng** (quán cơm Cô Tư: đứng quầy múc cơm / thu ngân / bưng bê;
  bưu cục Anh Tám: soạn gói → chạy xe → gọi khách → ký nhận → thu hộ → nộp tiền); lương giờ khi có làm + tiền từng việc; phiếu lương ca.
- **1.8 Sửa xe & chợ phụ tùng:** nghề dịch vụ (chẩn đoán → báo giá → sửa → bảo hành); quầy riêng có không gian 3D (UC-W6).
- **1.9 Tuyển dụng (NPC trước):** đăng tin, bảng tin xóm, ứng tuyển, ca làm, ký quỹ lương, đánh giá hai chiều; NPC nhân viên / NPC chủ tiệm lấp chỗ trống.

### Phase 2 — Multiplayer xóm 4 người (Tuần 10–14)
- [x] Tạo/vào xóm bằng mã phòng + link mời (Web Share API → Zalo/Messenger)
- [x] Đồng bộ vị trí 10 Hz + nội suy phía client; tên trên đầu nhân vật
- [ ] Cạnh tranh thật: shop cùng danh mục chia khách
- [x] Người chơi làm khách: đi tới shop người khác và mua (ledger giữa 2 ví)
- [x] Câu nói nhanh + emote (nghe được giữa người chơi)
- [ ] Reconnect + resync bằng `seq` (đặc biệt khi app xuống nền trên iOS)
- [ ] Trạng thái phòng trong Redis, flush định kỳ về Postgres
- [ ] Bot test: script 20 bot socket vào 5 phòng chạy 30 phút, đo CPU/RAM máy nhà

**Hoàn thành khi**: 4 điện thoại dùng **4G** chơi 30 phút, không lệch trạng thái; khóa màn hình rồi mở lại → vào lại phòng < 3s.

### Phase 3 — Cho vui hơn & giữ chân (Tuần 15–17)
- [ ] Review + reviewer event + thông báo "viral" cả xóm
- [ ] Mục tiêu hằng ngày nhẹ nhàng; **nhiều bảng xếp hạng** (doanh thu ngày, reputation, số khách) thay vì chỉ "ai giàu nhất"
- [ ] Shop khi chủ offline: đóng cửa (MVP); thuê nhân viên NPC bằng tiền trong game để mở tiếp — để sau nếu cần
- [ ] Tùy biến nhân vật cơ bản (màu áo, tóc) từ bộ nhân vật modular
- [ ] Âm thanh: tiếng xóm, rao hàng, tiếng xe máy (bật sau lần chạm đầu tiên — yêu cầu của iOS)
- [ ] Ghi `GameEvent` để biết người chơi hay bỏ ở đâu

**Hoàn thành khi**: nhóm bạn tự quay lại chơi ngày hôm sau mà không cần nhắc.

### Phase 4 — Đưa ra Internet bằng Cloudflare (Tuần 18–20)
- [x] `deploy/docker-compose.prod.yml`: web (Next standalone), server, migrate, postgres; `restart: unless-stopped`; `pnpm deploy:local` → cổng **5555** (làm sớm từ Phase 0, deploy sau mỗi task)
- [ ] Thêm **cloudflared** vào stack, trỏ vào :5555
- [ ] Cloudflare: Cache Rules cho `/_next/static/*`, `/assets/*` (glb, texture) → giảm upload từ mạng nhà; bật WAF/rate limit gói free cho `/api/auth/*`
- [ ] Backup: `pg_dump` hằng đêm (cron / BullMQ) → giữ 7 ngày + copy ra ổ khác/cloud
- [ ] Máy chủ nhà: tắt chế độ ngủ, Docker tự chạy khi khởi động, trang "bảo trì" khi server tắt
- [ ] Log có cấu trúc (pino) ra file, xoay vòng; theo dõi thời gian mỗi tick
- [ ] Mời 20–30 người chơi thử

**Hoàn thành khi**: chạy liên tục 7 ngày không mất dữ liệu; không lỗi mất/nhân tiền; p95 latency < 100 ms trong VN.

### Sau MVP (Phase 5+) — theo thứ tự đề xuất
1. **Co-op business**: 2–4 người chung shop, chia vai (pha chế / thu ngân / giao hàng).
2. **Chuỗi cung ứng người chơi**: hợp đồng cung cấp, chợ P2P, đấu giá mặt bằng.
3. **Hội chợ đêm** cuối tuần: gian hàng tạm, nhiều hạng mục thắng.
4. Template mới: **SERVICE**, **DELIVERY**, **CONTENT**.
5. **Sinh xóm procedural** (Road → Building Slot → Business → Theme → Props → Sign).
6. Đăng nhập Google/Zalo, email + quên mật khẩu.
7. **Nhiều xóm / 50–100 người**: interest management; nếu máy nhà không đủ thì mới tính thuê VPS.
8. App native bằng Capacitor.

---

## 5. Art & Asset pipeline

Giữ triết lý **hybrid: asset pack nền + AI hỗ trợ concept + tự làm 10–20% asset "chất Việt"**, đích đến là **glTF cho Three.js** (không dùng Unity/Unreal).

### 5.1 Style bible (Phase 0, trước khi làm asset nào)
- Phong cách: **stylized low-poly, màu phẳng, hơi cartoon, tỉ lệ hơi phóng đại**, đọc rõ trên màn hình 6 inch.
- **1 palette 16–24 màu** + 1 texture palette 256px dùng chung (tương thích kiểu colormap của Kenney).
- Ngân sách polygon: prop 200–1.500 tris · module nhà 500–2.000 · nhân vật 1.500–3.000.
- 1 unit = 1 m, pivot ở đáy, trục +Y lên.
- 10–20 asset mẫu gốc (nhà ống, xe máy, ghế nhựa, cây, cột điện...) — mọi asset mới phải đặt cạnh bộ mẫu để so.

### 5.2 Phân nhóm asset

| Nhóm | Nguồn | Ví dụ |
|---|---|---|
| 🏙️ Môi trường | Kenney (City Kit, Car Kit, Furniture Kit, Food Kit...), Quaternius — **CC0** | đường, vỉa hè, cây, đèn, thùng rác |
| 🧍 Nhân vật | Quaternius / Kenney (CC0, có animation) + đổi màu procedural | NPC, người chơi |
| 🍜 Business "chất Việt" | **Tự làm** trong Blender | xe bánh mì kính, ghế nhựa đỏ/xanh thấp, bàn inox, thùng đá xốp, ly trà đá, xe máy kiểu số (không logo hãng), dù bạt, bảng giá phấn, cột điện dây rối, mặt tiền nhà ống |
| 🎨 Branding/UI | Tự thiết kế (SVG) | logo **XÓM**, icon, UI, poster, màn hình chờ |

### 5.3 Modular
- Nhà ống = module mặt tiền (rộng 4m × số tầng) + ban công + mái hiên + **slot biển hiệu** + **slot prop**.
- Cửa hàng = `Building module + Sign (chữ runtime) + Prop set theo template` → 1 bộ asset ra hàng chục loại shop.
- Biển hiệu **không phải asset**: chữ tiếng Việt render lúc chạy → "Bánh mì Tuấn", "Trà sữa Duck" tự sinh.

### 5.4 Pipeline

```text
Concept (AI / ảnh chụp thật ngoài đường) → Blender (theo style bible, palette chung)
   → export glTF (script Python chạy headless: blender -b file.blend -P export.py)
   → gltf-transform (dedup, weld, meshopt, KTX2/WebP)
   → packages/assets/manifest.json → load dần theo khu vực
```

### 5.5 Dùng AI thế nào (vì chỉ có 1 người, AI gánh phần lớn việc lặp lại)
- Concept art, mood board, poster/quảng cáo trong game: dùng một công cụ tạo ảnh riêng; Claude viết prompt theo style bible.
- Claude hỗ trợ: viết style bible, vẽ **icon/UI/logo dạng SVG**, viết **script Python cho Blender** (tạo biến thể màu hàng loạt, ghép module, export glTF headless), pipeline `gltf-transform`.
- Tùy chọn: **Blender MCP** để Claude điều khiển Blender đang mở (cần cài `uv` + addon trong Blender). Chỉ cài khi bắt đầu làm asset nhiều ở Phase 1.
- ❌ Không dùng AI sinh hàng trăm NPC 3D → dùng bộ nhân vật modular + random.

### 5.6 License — bắt buộc
- Mỗi asset ghi vào `art/ASSET_LICENSES.md` (nguồn, tác giả, license, link).
- Kenney / Quaternius: CC0.
- OpenGameArt: kiểm tra **từng** asset (CC-BY cần ghi công; tránh CC-BY-SA/GPL).
- Unity Asset Store / Fab: chỉ mua khi license cho dùng **ngoài engine đó**.

---

## 6. Công cụ hỗ trợ đã cài

| Công cụ | Dùng để |
|---|---|
| MCP `context7` | Tra tài liệu mới nhất của Next.js, NestJS, Prisma, R3F/drei, Socket.IO, Serwist trước khi viết code |
| MCP `playwright-mobile` | Mở app ở giả lập **Pixel 7** (412×915, cảm ứng), chụp màn hình, thử luồng đăng ký/bottom sheet |
| MCP `chrome-devtools` | Performance trace, giả lập Android yếu + 4G, soi console/network |
| MCP `postgres` | Chế độ **chỉ đọc**: xem schema, query dữ liệu kinh tế, phân tích balance, gợi ý index |
| Blender 5.2.2 | Làm asset "chất Việt", export glTF bằng script headless |

---

## 7. Rủi ro & cách giảm

| Rủi ro | Giảm thiểu |
|---|---|
| **Làm một mình → quá tải, bỏ dở** | Phạm vi MVP rất nhỏ; mỗi phase ra bản chơi được; dời mọi thứ không cần thiết sang Phase 5+ |
| 3D trên web mobile chậm | Thử hiệu năng ở Phase 0 + phương án D2b; ngân sách rõ ràng |
| Safari iOS (mất WebGL context, âm thanh, PWA hạn chế, socket bị ngắt khi xuống nền) | Test máy thật mỗi phase; resync bằng `seq` |
| **Máy nhà tắt / mất điện / mất mạng** | Docker `restart: unless-stopped`; client hiện "Xóm đang nghỉ" và tự vào lại; backup hằng đêm ra ngoài máy |
| **Băng thông upload mạng nhà** | Cloudflare cache toàn bộ asset tĩnh; asset nén meshopt/KTX2; chỉ WebSocket đi về máy nhà |
| Lộ IP nhà / bị tấn công | Cloudflare Tunnel (không mở port router), WAF + rate limit free, không expose Postgres/Redis ra ngoài |
| Phình phạm vi | Chỉ thêm nghề qua template có sẵn |
| Kinh tế mất cân bằng | `packages/sim` thuần + balance tool headless; money sink |
| Hack tiền | Server quyết định + ledger kép + validate zod mọi intent |
| Asset lệch style | Style bible + palette chung + bộ asset mẫu gốc |

---

## 8. Bước tiếp theo ngay
1. Khởi tạo monorepo + `apps/web` + `apps/server` (Phase 0).
2. Dựng scene R3F thử hiệu năng, mở trên điện thoại qua Cloudflare Quick Tunnel.
3. Song song: style bible v0 + chọn Kenney kits + làm ghế nhựa đỏ trong Blender.
