# Bản đồ mở — xóm lớn dần theo người chơi (kế hoạch, CHỜ CHỐT)

> Góp ý đợt 2 của chủ dự án (2026-10-02): ban đầu xóm chỉ có nhà NPC + ô đất trống / nhà cho thuê; người chơi đi làm thuê tới khi
> đủ tiền sắm sạp, rồi chọn ô đất để thuê hoặc tự xây tiệm; mỗi người mở tiệm thì xóm mở rộng thêm ô (như Township); nâng cấp
> tiệm lên nhà nhiều tầng. Tham khảo: Township (ô đất chia sẵn, ô sau đắt hơn, mở theo cấp/dân số), Bit City (mua ô rồi chọn
> công trình, xây xong dân số tăng).
>
> Trạng thái: **bản nháp** — các mục đánh dấu ❓ cần chủ dự án chốt trước khi viết code.

## 1. Hiện trạng (để biết phải đổi gì)
- Chỗ bán là config chung cho mọi xóm: `content.lots` — 8 chỗ vỉa hè (`kind: cart`, xe đẩy) + 2 nhà mặt tiền (`nha_so_10`,
  `nha_so_24`, `kind: house`), vị trí cố định trên một con phố. Xóm nào cũng giống hệt nhau.
- `Business.lotId` trỏ vào id lô; `Lease (roomId, lotId)` là hợp đồng thuê nhà mặt tiền (UC-F12); cấp tiệm 1–3 (UC-M9) chỉ cho
  nhà mặt tiền, chưa có hình dạng khác nhau.
- Xóm chung 40 cư dân / 30 online (`content.economy.xomResidents/xomOnline`) → người mới vào xóm đông **tranh 10 chỗ**.
- Công trình chung (`content.projects`: đèn đường…) đã có quỹ xóm + phụ hồ người chơi + `buildDays` — dùng lại được cho xây tiệm.

## 2. Mục tiêu
1. Mỗi xóm có **bản đồ riêng lớn dần**: ô đất là dữ liệu theo xóm (bảng `Plot`), không phải hằng số.
2. Đường tiến trình nhìn thấy được (Luật 4): làm thuê → **xe đẩy vỉa hè** (như nay) → **thuê ô đất / thuê nhà** → **tự xây tiệm**
   → **lên tầng** (nhà 2–3 tầng = cấp tiệm 2–3).
3. Money sink lớn, có ý nghĩa (Luật 5): tiền thuê ô, tiền mua ô, vật liệu xây, tiền công phụ hồ, thuế đất mỗi ngày.
4. Xóm đông thì **mở thêm ô** — người mới không hết chỗ; ô xa trung tâm rẻ hơn, ít khách hơn.
5. Server-authoritative như mọi thứ khác: client chỉ gửi ý định (thuê/mua/xây ô X), server kiểm tiền, sở hữu, đứng gần, giờ.

## 3. Mô hình dữ liệu (đề xuất)
```prisma
model Plot {
  id        String  @id @default(uuid()) @db.Uuid
  roomId    String  @db.Uuid          // xóm
  slot      String                    // id ô trong mẫu đoạn phố, vd. "doan2_o3"
  segment   Int                       // đoạn phố thứ mấy (0 = phố gốc)
  kind      PlotKind                  // SIDEWALK (xe đẩy) | LAND (đất trống) | HOUSE (nhà NPC cho thuê)
  ownerId   String? @db.Uuid          // người mua đứt (null = của xóm/NPC)
  tenantId  String? @db.Uuid          // người đang thuê
  building  String?                   // id mẫu công trình đang có (content.buildings)
  floors    Int     @default(0)       // 0 = đất trống, 1–3 tầng
  buildDone Int?                      // ngày game xây xong (null = không xây)
  @@unique([roomId, slot])
}
```
- **Mẫu đoạn phố** là config (`content.segments`): mỗi đoạn ~6–8 ô (vị trí, hướng, loại, khu lưu lượng, giá gốc). Xóm mới chỉ
  sinh đoạn 0 (phố hiện nay); điều kiện mở đoạn kế (❓ mục 6.4) đạt thì server sinh các `Plot` của đoạn đó.
- `content.lots` hiện nay thành **đoạn 0**; `Business.lotId` → `Business.plotId` (migration: mỗi xóm sinh Plot đoạn 0, gắn
  business/lease cũ vào Plot cùng slot).
- **Mẫu công trình** là config (`content.buildings`): sạp có mái, tiệm 1 tầng, nhà 2 tầng, nhà 3 tầng — giá vật liệu, số ngày
  xây, số bao vữa cần (phụ hồ), cấp tiệm tương ứng, model 3D.

## 4. Luồng người chơi
1. **Người mới** (như nay): làm thuê → mua xe đẩy → thuê chỗ vỉa hè theo ngày.
2. **Thuê ô / thuê nhà**: ☰ Menu → 🗺️ **Bản đồ xóm** (sheet mới; thay 📍 Chỗ bán + 🏠 Thuê nhà): mỗi ô có trạng thái (trống,
   đang thuê, của ai, đang xây), giá, khu khách. Đi tới tận ô → "Thuê ô này" (đất trống: dựng sạp có mái) hoặc "Thuê nhà"
   (nhà NPC, như UC-F12 hiện nay).
3. **Mua đứt ô đất** (❓ 6.2): giá theo đoạn + khu; mua rồi không trả tiền thuê, chỉ đóng **thuế đất** mỗi ngày (sink nhỏ, có
   trần — không để ai ôm hết đất).
4. **Xây tiệm**: trên ô của mình chọn mẫu công trình → trả vật liệu → công trường hiện 3D (giàn giáo) → phụ hồ (mình hoặc người
   chơi khác, nhận tiền công từ chi phí) trộn đủ vữa + đủ ngày → xong thì thành tiệm (dùng lại `ProjectService` / UC phụ hồ).
5. **Lên tầng** = nâng cấp tiệm (gộp UC-M9): nhà 1 → 2 → 3 tầng, mỗi tầng thêm khách × và chỗ cho nhân viên; xây lên tầng thì
   tiệm đóng vài giờ game.
6. **Xóm mở rộng**: đạt điều kiện → tin "🏗️ Xóm mở thêm đoạn phố mới phía đông" trên bảng tin; đoạn mới rẻ hơn, ít khách hơn lúc
   đầu, đông dần khi có nhiều tiệm (khách theo mật độ tiệm).

## 5. Các bước làm (mỗi bước một commit, test xanh + deploy)
| Bước | Nội dung | Ghi chú |
|---|---|---|
| A | Bảng `Plot` + `content.segments` (đoạn 0 = lots hiện nay) + migration gắn business/lease cũ; server đọc lô từ Plot | Không đổi gameplay — chỉ chuyển dữ liệu |
| B | Sheet 🗺️ Bản đồ xóm (gộp 📍 Chỗ bán + 🏠 Thuê nhà), ô đất trống thuê theo ngày dựng sạp có mái | Mobile-first, kiểm Pixel 7 |
| C | Mua đứt ô + thuế đất; `pnpm balance` thêm chiến lược "mua ô" | Money sink lớn |
| D | `content.buildings` + xây tiệm trên ô (vật liệu, ngày, phụ hồ), công trường 3D | Dùng lại ProjectService |
| E | Lên tầng = cấp tiệm; model nhà 2–3 tầng (Blender / nhánh art `feat/phong-cach-toon`) | Gộp UC-M9 |
| F | Mở đoạn phố mới theo điều kiện; sinh cảnh đoạn mới; bảng tin xóm | Camera/đường đi phải nối liền |

## 6. Cần chủ dự án chốt ❓
1. **Hình dạng bản đồ lớn dần**: (a) **phố dài thêm từng đoạn** (đề xuất — khớp cảnh một con phố + camera hiện nay) hay
   (b) lưới ô vuông kiểu Township (đẹp hơn nhưng phải làm lại cảnh, đường đi, giao thông).
2. **Sở hữu đất**: (a) **thuê + mua đứt** (đề xuất — mua đứt là mục tiêu lớn, có thuế đất làm sink) hay (b) chỉ thuê (đơn giản,
   không lo người giàu ôm đất).
3. **Xây tiệm**: (a) **chọn mẫu công trình có sẵn** (đề xuất — sạp mái / tiệm 1 tầng / nhà 2–3 tầng) hay (b) tự sắp đặt tường,
   cửa (tự do nhưng nặng việc, nặng render trên điện thoại).
4. **Khi nào mở đoạn phố mới**: (a) **≥ 70% ô đang có người thuê/sở hữu** (đề xuất — theo nhu cầu thật), (b) theo số cư dân,
   (c) cả xóm góp quỹ xây "đường mới" như công trình chung (sự kiện chung, gắn kết).
