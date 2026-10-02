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

## 4. "Cửa hàng của tôi" — luồng Làm ăn mới (gồm 3.2, 3.3, 3.4)

**Mô hình:** người chơi có **nhiều cửa hàng** (`Business` nhiều dòng). Mỗi cửa hàng: nghề + đồ nghề, chỗ bán (vỉa hè hoặc nhà thuê),
**kho riêng**, thực đơn, nhân viên (nhiều người, trần theo quy mô), hồ sơ giấy tờ, số liệu, khách quen, đánh giá.

```
🏪 Cửa hàng của tôi
 ├─ Danh sách thẻ cửa hàng: tên · đang mở/đóng · lãi hôm nay · ⚠ hết hàng / tiền nhà tới hạn · nhân viên trong ca
 │    [+ Mở cửa hàng mới]  → chọn nghề (mua đồ nghề) → chọn chỗ → đặt tên
 └─ Bấm một thẻ → trang cửa hàng (4 tab thay cho 9):
      🏪 Vận hành : mở/đóng · thực đơn & giá · nhân viên ca hôm nay · khách quen
      📦 Kho      : tồn kho cửa hàng này · nhập (đi chợ cho tiệm này) · chuyển hàng giữa các tiệm
      📊 Sổ sách  : doanh thu/lãi hôm nay & 7 ngày, chi phí theo khoản (hàng, lương, nhà, điện nước, thuế), đánh giá
      📁 Hồ sơ    : chỗ bán / thuê nhà, tiền nhà, giấy tờ (hộ kinh doanh, ATTP, biển hiệu), tuyển nhân viên, đổi tên
```

**Luật mới:**
- Chủ **tự đứng bán một cửa hàng một lúc**; cửa hàng khác bán được khi **có nhân viên trong ca**.
- **Chủ được đi làm thuê / xe ôm / phụ hồ / mở tiệm khác** khi mọi cửa hàng đang mở đều có nhân viên (helper chung `ownerTied`).
- **Không giới hạn số cửa hàng** mỗi người (vốn, tiền nhà, nhân viên tự là giới hạn).
- **Cấp tiệm**: tiệm nâng cấp (mở rộng, sửa sang — tốn tiền) thì **to hơn, đông khách hơn**, và **thuê được nhiều nhân viên hơn**
  (content `shopLevels[]`: lưu lượng ×, sức chứa khách, số nhân viên tối đa, chi phí nâng cấp; xe đẩy là cấp thấp nhất, 1 người).
- **Kho riêng từng tiệm**: nhập chợ phải chọn tiệm nhận hàng; nhân viên chỉ bán hàng trong kho tiệm đó; **chuyển kho = bấm
  chuyển, hàng tới sau vài phút game** (đang trên đường thì chưa bán được).
- **📊 Tổng quan cửa hàng**: một bảng so sánh mọi cửa hàng (lãi/lỗ, chi phí lớn nhất, gợi ý "tiệm X lỗ vì lương > lãi gộp").

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
| **B** | Điều hướng mới: Menu ☰ + icon neo + nút ngữ cảnh; bỏ thanh dưới 5 mục; mỗi tính năng một lối vào | đổi UI | Playwright cập nhật locator + kịch bản `menu-chinh` |
| **C** | "Cửa hàng của tôi": trang cửa hàng 4 tab (từ 9 tab), Sổ sách lãi/lỗ, Tổng quan | đổi UI | kịch bản `so-sach` |
| **D** | Nhiều cửa hàng + kho riêng từng tiệm (migration `InventoryItem.businessId`, intent nhận `businessId`) | đổi luật | e2e mới, `pnpm balance` |
| **E** | Chủ tự do khi có nhân viên (`ownerTied`) + nhiều nhân viên theo quy mô | đổi luật | e2e mới, `pnpm balance` |
| **F** | Tiếp backlog: nội thất theo nghề (3.6), khách ra vào tiệm (3.7), xóm chung (3.8), admin (3.9), nét vẽ toon + đô thị hoá (đã có bản nháp) | | |

Ước lượng: A 1 phiên · B 1 phiên · C 1 phiên · D 1–2 phiên · E 1 phiên.

## 7. Đã chốt (2026-10-02)

1. **Điều hướng**: icon neo trái (🍜 Ăn uống · 🧺 Chợ · 🏪 Cửa hàng · 💼 Việc làm, người chơi tự ghim tối đa 4) + **☰ Menu** lưới
   icon; **bỏ thanh dưới 5 mục**.
2. **Thứ tự**: **A trước** (tách code server, người chơi không thấy khác), rồi B, C, D, E.
3. **Không giới hạn số cửa hàng**; **số nhân viên theo cấp tiệm** — nâng cấp tiệm → to hơn, đông khách hơn, thuê thêm người.
4. **Chuyển kho**: bấm chuyển, chờ vài phút game hàng mới tới.
5. **Kho riêng từng tiệm** (chốt trước đó).
