# XÓM — Kế hoạch tổ chức lại chức năng & logic (IA + tái cấu trúc)

> Ngày 2026-10-02 · Trạng thái: **đã duyệt** (mục 7) · Thay cho HANDOFF §3.1 (và gom 3.2, 3.3, 3.4).
> Quyết định đã chốt: (1) **mỗi tính năng một icon riêng** — neo trên màn hình hoặc nằm trong **menu mở ra danh sách**;
> (2) **kho riêng từng tiệm**; (3) đô thị hoá dần theo công trình chung (làm sau, nhánh `feat/phong-cach-toon`).

---

## 1. Vấn đề hiện tại (đã rà code + chơi thử)

| # | Vấn đề | Hậu quả |
|---|---|---|
| 1 | Thanh dưới 5 mục (Xóm, Làm ăn, Nhiệm vụ, Việc làm, Hàng xóm) + 3 icon neo trái + ⚙️ + avatar hồ sơ — **cùng một chức năng có nhiều lối vào**, chức năng khác lại giấu sâu | Người chơi không biết tìm ở đâu; mỗi tính năng mới lại nhét thêm tab |
| 2 | Sheet **Làm ăn có 9 tab** (Bán, Thực đơn, Kho, Chỗ bán, Mở tiệm, Số liệu, Khách quen, Nhân viên, Đánh giá) — trộn việc *hằng ngày* với việc *làm một lần* (thủ tục mở tiệm) | Rối; không chỗ cho nhiều cửa hàng |
| 3 | `ActionBar` ~15 nút ngữ cảnh tự hiện/ẩn | Đè nhau, khó đoán nút nào hiện |
| 4 | **Một người một quầy** là giả định khắp nơi: 17 chỗ `business.findFirst({ ownerId })`, `MeView.business`, `room.attending` theo người | Không làm được nhiều cửa hàng, nhiều nhân viên |
| 5 | Chủ có quầy đang mở bị **khoá** không đi làm thuê / xe ôm / phụ hồ dù đã có nhân viên | Nhân viên vô nghĩa với người muốn làm nhiều việc |
| 6 | Server: `game.service.ts` ~1.900 dòng ôm ~50 việc (ATM, chợ, đồ nghề, quỹ, đánh giá, sạp NPC, sự kiện, nhu cầu, tick, ngày…); gateway 87 intent trong một file | Sửa một chỗ dễ vỡ chỗ khác, conflict khi làm song song |
| 7 | Kinh tế thiếu bảng tổng quan: chủ không thấy **lãi/lỗ thật** từng cửa hàng (vừa phát hiện nhờ đọc sổ cái thủ công) | Chơi lỗ mà không biết vì sao |

## 2. Nguyên tắc (tham khảo Stardew Valley, Hay Day, Animal Crossing, The Sims Mobile, Townsmen)

1. **Làm ở đâu thì bấm ở đó** (Stardew/Animal Crossing): thao tác vận hành nằm ở **nơi chốn** — đứng ở quầy thì hiện bảng quầy,
   tới chợ thì hiện chợ. Menu chỉ để **xem & quản lý từ xa**.
2. **Một lối vào cho mỗi tính năng** (Hay Day): mỗi tính năng có **một icon** duy nhất; không có hai đường tới cùng một bảng.
3. **Màn hình chính tối giản** (DESIGN Luật 12): ≤ 4 icon neo + 1 nút Menu + 1 nút hành động ngữ cảnh. Thêm icon neo phải bỏ icon khác.
4. **Tách "hằng ngày" khỏi "làm một lần"** (Sims Mobile): thủ tục mở tiệm, thuê nhà, đăng ký… là *hồ sơ của cửa hàng*, không nằm
   ngang hàng với "Bán".
5. **Mọi thứ có số** (Townsmen): mỗi cửa hàng có thẻ tóm tắt lãi/lỗ hôm nay, tồn kho, nhân viên, tiền nhà sắp tới hạn.

## 3. Bố cục màn hình mới (mobile 360×640)

```
┌───────────────────────────────────────────┐
│ (avatar)  💵 1,2tr  ⭐3.3  🍚 💧   T3·N2 ☀ 12:20 │  ← thanh số liệu (giữ như Luật 12.6)
│ 📺 tin xóm chạy chữ                          │
│                                             │
│ 🍜  ← icon neo trái (≤4, việc làm hằng ngày)  │
│ 🧺        Ăn uống · Chợ · Cửa hàng · Việc làm  │
│ 🏪                                          │
│ 💼                                    ⚙️    │
│                3D phố                        │
│                                             │
│        [ nút hành động ngữ cảnh duy nhất ]    │  ← "Mở quầy", "Vào tiệm", "Tính tiền"… (một nút + một chip phụ)
│  ☰ Menu                               💬     │  ← Menu (lưới icon mọi tính năng) · Chat
└───────────────────────────────────────────┘
```

- **Bỏ thanh điều hướng dưới 5 mục.** Thay bằng: **icon neo trái** (tính năng dùng nhiều lần mỗi phiên) + **☰ Menu** (lưới icon
  mọi tính năng, có nhóm, có chấm đỏ khi có việc cần làm).
- Icon neo trái mặc định: **🍜 Ăn uống · 🧺 Chợ · 🏪 Cửa hàng của tôi · 💼 Việc làm**. Người chơi được ghim/bỏ ghim icon neo trong
  Menu (tối đa 4) — đúng ý "mỗi tính năng một icon, neo trên màn hình hoặc nằm trong menu".
- **Nút hành động ngữ cảnh**: luật ưu tiên một nút chính (việc cần làm ngay ở chỗ đang đứng) + một chip phụ; thay `ActionBar` 15 nút.

### Menu ☰ (lưới icon, chia nhóm)

| Nhóm | Icon (mỗi icon mở đúng một bảng) |
|---|---|
| **Làm ăn** | 🏪 Cửa hàng của tôi · 📊 Tổng quan cửa hàng · 🛒 Mua đồ nghề / mở cửa hàng mới · 🧺 Chợ đầu mối |
| **Việc làm** | 💼 Làm thuê · 🛵 Xe ôm · 🏗️ Phụ hồ · 📋 Việc xóm · 📸 Thuê nhau |
| **Xóm** | 🗺️ Bản đồ & khu phố · 👥 Hàng xóm · 🏆 Bảng xóm · 💰 Quỹ & công trình · 📰 Bảng tin |
| **Tôi** | 🙂 Hồ sơ & kỹ năng · 👛 Ví 💵/🏦 · 📖 Chuyện của tôi · 🎯 Nhiệm vụ & thành tựu · ⚙️ Cài đặt |

## 4. Mỗi chức năng một sheet riêng (góp ý 2026-10-02: "không gộp chung nữa, khó maintain")

Bỏ kiểu **một sheet nhiều tab ôm nhiều chức năng**. Mỗi chức năng = **một bottom-sheet (hoặc modal) riêng, một file riêng, một
icon riêng**, đăng ký trong **một bảng tập trung** (`game/features/registry.ts`). Menu ☰, icon neo, nút ngữ cảnh, thông báo
"Xem ›" đều mở chức năng qua id trong bảng này — thêm chức năng mới = thêm một dòng + một file, không sửa sheet khác.
Chức năng cần liên kết nhau (vd. Kho → "🧺 Ra chợ") thì có **nút chuyển sang sheet kia**, không nhúng nội dung của nhau.

### Danh mục (hiện ở đâu → sheet riêng mới)

| Nhóm | Sheet mới (id) | Nội dung | Hiện đang nằm ở |
|---|---|---|---|
| **🏪 Cửa hàng** | 🏪 Quầy của tôi (`stall`) | mở/đóng, đẩy xe tới chỗ, hôm nay bán bao nhiêu, độ bền xe | Làm ăn (đầu sheet + tab Bán) |
| | 🍽️ Thực đơn & giá (`menu`) | bật/tắt món, chỉnh giá, gợi ý giá hợp lý | Làm ăn › Thực đơn |
| | 📦 Kho hàng (`stock`) | tồn kho, còn làm được bao nhiêu phần, sắp hỏng | Làm ăn › Kho |
| | 📍 Chỗ bán (`lot`) | chọn/đổi chỗ vỉa hè, khu nào hợp hàng gì | Làm ăn › Chỗ bán |
| | 🏠 Thuê nhà & giấy tờ (`lease`) | hợp đồng thuê, hộ kinh doanh, ATTP, biển hiệu, **tiền nhà** | Làm ăn › Mở tiệm |
| | 👩‍🍳 Nhân viên (`staff`) | tuyển, ca, phiếu ca | Làm ăn › Nhân viên |
| | 📊 Sổ sách (`books`) | doanh thu/lãi 7 ngày, chi phí theo khoản | Làm ăn › Số liệu |
| | ❤️ Khách quen (`regulars`) | sổ khách quen | Làm ăn › Khách quen |
| | 📒 Đánh giá (`reviews`) | sổ đánh giá, trả lời | Làm ăn › Đánh giá |
| | 🎉 Khai trương (`promo`) | tổ chức khai trương | Làm ăn › Bán |
| | 📖 Công thức (`recipes`) | sổ tay món | đã riêng ✅ |
| | 🛒 Vựa xe Ông Sáu (`equipment`) | mua/đổi nghề, sửa xe | đã riêng ✅ (+ "Đổi nghề…" trong Làm ăn) |
| **🧺 Mua bán** | 🧺 Chợ đầu mối (`market`) | nhập hàng theo nghề | đã riêng, nhưng gộp Thanh lý |
| | ♻️ Thanh lý (`liquidate`) | bán lại hàng tồn | Chợ › Thanh lý |
| | 🍜 Ăn uống (`food`) · sạp (`vendor`) | quán quanh xóm, mua ăn | đã riêng ✅ |
| | 🏧 ATM (`atm`) | rút/gửi, PIN | đã riêng ✅ |
| | 🛒 Quầy hàng xóm (`shop`) | gọi món ở quầy người khác | đã riêng ✅ |
| **💼 Việc làm** | 💼 Làm thuê (`jobs`) | quán cơm, bưu cục… | Việc làm › Làm thuê |
| | 📋 Việc xóm (`contracts`) | bảng việc NPC đặt | Việc làm › Việc xóm |
| | 📸 Thuê nhau (`gigs`) | người chơi thuê nhau | Việc làm › Thuê nhau |
| | 🛵 Xe ôm (`ride`) | thuê xe, chở khách | thẻ trong Việc làm + sheet riêng |
| | 🏗️ Phụ hồ (`site`) | trộn vữa công trình | thẻ trong Việc làm + sheet riêng |
| **🏘️ Xóm** | 👥 Hàng xóm (`neighbors`) | ai online, tới quầy họ, mời bạn, vào xóm khác | Hàng xóm (gộp lịch + quỹ) |
| | 📅 Hôm nay (`today`) | thứ, sự kiện trong ngày | Hàng xóm (đầu sheet) |
| | 🏆 Bảng xóm (`board`) | giải tuần, thị phần, đang hot, khu phố | đã riêng (4 tab cùng một việc: xếp hạng — giữ) |
| | 💰 Quỹ & công trình (`fund`) | góp quỹ, đề xuất, bỏ phiếu | đã riêng (+ nút trong Hàng xóm) |
| | 💬 Chat (`chat`) | nhắn nhanh | nút nổi riêng ✅ |
| **🙂 Tôi** | 🙂 Hồ sơ (`profile`) | cấp, danh tiếng, tin cậy, no/khát | Hồ sơ › Tôi |
| | 👛 Ví (`wallet`) | 💵/🏦, hôm nay thu gì, tới ATM gần nhất | Hồ sơ › Tôi (nửa dưới) |
| | 📖 Chuyện của tôi (`story`) | các mốc đời | Hồ sơ › Chuyện |
| | 📈 Kỹ năng (`skills`) | kỹ năng + mở khoá theo cấp | Hồ sơ › Kỹ năng |
| | 🏅 Thành tựu (`badges`) | thành tựu | Hồ sơ › Thành tựu |
| | 🫶 Người quen (`friends`) | độ thân với NPC | Hồ sơ › Người quen |
| | 🎯 Nhiệm vụ (`quests`) | việc tiếp theo, mục tiêu hôm nay | thanh dưới |
| | ⚙️ Cài đặt (`settings`) | âm thanh, thoại mặn, hiệu năng, đăng xuất | icon phải |

→ **35 chức năng, mỗi cái một sheet**; không sheet nào còn tab trộn chức năng (Bảng xóm giữ tab vì 4 tab đều là "xếp hạng").

### Đường vào
- **Icon neo trái** (ghim tối đa 4, mặc định 🍜 Ăn uống · 🧺 Chợ · 🏪 Quầy của tôi · 💼 Làm thuê).
- **☰ Menu**: lưới icon 5 nhóm như bảng trên; chấm đỏ khi chức năng có việc cần làm (hết hàng, tiền nhà tới hạn, đơn mới…).
- **Nút ngữ cảnh** (thay `ActionBar` 15 nút): ở đâu hiện đúng một nút của chức năng ở đó (đứng ở quầy → Mở quầy / Làm món;
  trước ATM → ATM…).
- Avatar → 🙂 Hồ sơ; ⚙️ giữ ở cột phải.

### Tổ chức code web
```
game/features/registry.ts      id → { title, icon, group, Sheet (lazy), badge?() }
game/features/shop/Stall.tsx  Menu.tsx  Stock.tsx  Lot.tsx  Lease.tsx  Staff.tsx  Books.tsx  Regulars.tsx  Reviews.tsx  Promo.tsx
game/features/trade/Market.tsx  Liquidate.tsx  Food.tsx  Vendor.tsx  Atm.tsx  NeighborShop.tsx  Equipment.tsx  Recipes.tsx
game/features/work/Jobs.tsx  Contracts.tsx  Gigs.tsx  Ride.tsx  Site.tsx
game/features/xom/Neighbors.tsx  Today.tsx  Board.tsx  Fund.tsx
game/features/me/Profile.tsx  Wallet.tsx  Story.tsx  Skills.tsx  Badges.tsx  Friends.tsx  Quests.tsx  Settings.tsx
game/ui/menu/MainMenu.tsx  AnchorRail.tsx  ContextAction.tsx
```
`GameShell` chỉ còn `const F = FEATURES[sheet]; <F.Sheet />` thay cho 18 dòng `sheet === …`.
Khi làm nhiều cửa hàng (bước D), các sheet nhóm 🏪 nhận `shopId` (mở từ danh sách cửa hàng) — không phải tách lại.

## 5. Tổ chức lại code (tách nhỏ để dễ sửa, ít conflict)

### Server — mỗi miền một service + một file gateway
| Service mới | Lấy ra từ `game.service.ts` | Intent |
|---|---|---|
| `BusinessService` | mở/đóng, chỗ bán, thực đơn, sửa xe, tự bán, điện nước, tick khách | `biz:*` |
| `InventoryService` (mở rộng `inventory.ts`) | kho theo **cửa hàng**, tiêu hao, hết hạn | (dùng chung) |
| `MarketService` | chợ, thanh lý, đồ nghề (Ông Sáu) | `market:*`, `equipment:*` |
| `NeedsService` | đói/khát, ăn uống, sạp NPC | `vendor:*` |
| `BankService` | ATM, PIN, `payOut` (trả 💵/🏦) | `atm:*` |
| `EventService` | khai trương, VIP, sự kiện | `event:*` |
| `FundService` | quỹ xóm, công trình (gộp `projects.ts`) | `fund:*`, `project:*`, `crew:*` |
| `GameService` | **chỉ** vòng đời xóm, tick, chuyển ngày, snapshot, điều phối | — |

- Gateway tách theo nhóm: `gateways/business.gateway.ts`, `jobs.gateway.ts`, `xom.gateway.ts`, `money.gateway.ts`, `debug.gateway.ts`
  (dùng chung `handle()` qua lớp nền).
- **Một hàm duy nhất** lấy cửa hàng: `BusinessService.get(playerId, businessId)` / `.list(playerId)` — xoá 17 chỗ `findFirst({ ownerId })`.
- Quy ước: logic tiền/công thức vào `packages/sim` (đã làm), service chỉ đọc/ghi DB + sổ cái.

### Web
- `ui/business/` : `ShopList`, `ShopPage` (4 tab = 4 file), `ShopOverview`, `NewShopFlow`.
- `ui/menu/` : `MainMenu` (lưới icon), `AnchorBar` (icon neo, ghim/bỏ ghim), `ContextAction` (thay `ActionBar`).
- `store.ts` tách slice: `meSlice`, `shopsSlice` (`activeShopId`), `uiSlice` (sheet/menu), `worldSlice`.

## 6. Lộ trình (mỗi bước một nhánh + PR, chạy đủ test, deploy :5555)

| Bước | Nội dung | Không đổi hành vi? | Kiểm chứng |
|---|---|---|---|
| **A** | Tách server: service + gateway theo miền; gom `BusinessService.get/list` | ✅ thuần tái cấu trúc | e2e server 78/78, Playwright toàn bộ |
| **B** | **Tách mỗi chức năng một sheet** (registry, 35 sheet) + Menu ☰ + icon neo + nút ngữ cảnh; bỏ thanh dưới 5 mục | đổi UI | Playwright cập nhật locator + kịch bản `menu-chinh` |
| **C** | Sổ sách lãi/lỗ theo khoản chi + Tổng quan cửa hàng | đổi UI | kịch bản `so-sach` |
| **D** | Nhiều cửa hàng + kho riêng từng tiệm (migration `InventoryItem.businessId`, intent nhận `businessId`) | đổi luật | e2e mới, `pnpm balance` |
| **E** | Chủ tự do khi có nhân viên (`ownerTied`) + nhiều nhân viên theo quy mô | đổi luật | e2e mới, `pnpm balance` |
| **F** | Tiếp backlog: nội thất theo nghề (3.6), khách ra vào tiệm (3.7), xóm chung (3.8), admin (3.9), nét vẽ toon + đô thị hoá (đã có bản nháp) | | |

Ước lượng: A 1 phiên · B 1 phiên · C 1 phiên · D 1–2 phiên · E 1 phiên.

## 7. Đã chốt (2026-10-02)

1. **Điều hướng**: icon neo trái (🍜 Ăn uống · 🧺 Chợ · 🏪 Cửa hàng · 💼 Việc làm, người chơi tự ghim tối đa 4) + **☰ Menu** lưới
   icon; **bỏ thanh dưới 5 mục**.
2. **Thứ tự**: B (tách chức năng thành sheet riêng — chủ dự án ưu tiên 2026-10-02) → A (tách server) → C → D → E.
3. **Không giới hạn số cửa hàng**; **số nhân viên theo cấp tiệm** — nâng cấp tiệm → to hơn, đông khách hơn, thuê thêm người.
4. **Chuyển kho**: bấm chuyển, chờ vài phút game hàng mới tới.
5. **Kho riêng từng tiệm** (chốt trước đó).
