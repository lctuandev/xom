# Bản đồ mở — xóm lớn dần theo người chơi (kế hoạch, ĐÃ CHỐT 2026-10-03)

> Góp ý đợt 2 của chủ dự án (2026-10-02): ban đầu xóm chỉ có nhà NPC + ô đất trống / nhà cho thuê; người chơi đi làm thuê tới khi
> đủ tiền sắm sạp, rồi chọn ô đất để thuê hoặc tự xây tiệm; mỗi người mở tiệm thì xóm mở rộng thêm ô (như Township); nâng cấp
> tiệm lên nhà nhiều tầng. Tham khảo: Township (ô đất chia sẵn, ô sau đắt hơn, mở theo cấp/dân số), Bit City (mua ô rồi chọn
> công trình, xây xong dân số tăng).
>
> Trạng thái: **đã chốt** (§6) — lưới ô kiểu Township, thuê + mua đứt, chọn mẫu công trình, mở khu mới khi ≥ 70% ô có chủ.

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

## 3. Lưới & khu (chunk)
- Bản đồ hiện đã là **lưới ô** (`content.map`: ô 4 m, 27 × 15 ký tự — `=` đường, `|` đường dọc, `s` vỉa hè, `B`/`H` khối nhà,
  chữ hoa khác = địa điểm). `packages/sim/src/grid.ts` tìm đường A* trên lưới; `scene/Street.tsx` dựng cảnh từ lưới.
- **Khu (chunk)** = một ô phố vuông có đường bao quanh (ví dụ 7 × 5 ô: vỉa hè viền + khối đất giữa). Xóm gốc = khu trung tâm
  (lưới hiện nay). Khu mới ghép vào **4 phía** theo mẫu config (`content.chunks`: lưới ký tự riêng, vị trí ô đất, khu lưu lượng,
  giá gốc) — đường của khu mới nối với đường biên khu cũ nên A* + giao thông chạy tiếp mà không phải sửa.
- **Lưới của một xóm** = lưới gốc + các khu đã mở (theo thứ tự mở) → `MapDef` ghép động gửi xuống client trong `WorldView`;
  server giữ cùng `Grid` để kiểm "đứng gần".
- Ô đất (plot) = một nhóm ô `B` trong khu (thường 2 × 2 ô = 8 × 8 m) có mặt tiền ra vỉa hè.

## 4. Mô hình dữ liệu (đề xuất)
```prisma
model Room {
  // …
  chunks Json @default("[]")          // khu đã mở: [{ chunkId, gx, gz }] (bước A — đã làm)
}
model Plot {
  id        String  @id @default(uuid()) @db.Uuid
  roomId    String  @db.Uuid
  slot      String                    // "<gx>,<gz>:<id ô trong mẫu khu>"
  kind      PlotKind                  // SIDEWALK (xe đẩy) | LAND (đất trống) | HOUSE (nhà NPC cho thuê)
  ownerId   String? @db.Uuid          // mua đứt (null = của xóm)
  tenantId  String? @db.Uuid          // đang thuê
  building  String?                   // id mẫu công trình (content.buildings)
  floors    Int     @default(0)       // 0 = đất trống, 1–3 tầng
  buildDone Int?                      // ngày game xây xong
  @@unique([roomId, slot])
}
```
- `content.lots` hiện nay thành các ô của **khu gốc**; `Business.lotId` → `Business.plotId` (migration: mỗi xóm sinh Plot khu
  gốc, gắn business/lease cũ vào Plot cùng id).
- **Mẫu công trình** (`content.buildings`): sạp có mái, tiệm 1 tầng, nhà 2 tầng, nhà 3 tầng — giá vật liệu, số ngày xây, số bao
  vữa (phụ hồ), cấp tiệm tương ứng, model 3D.

## 5. Luồng người chơi
1. **Người mới** (như nay): làm thuê → mua xe đẩy → thuê chỗ vỉa hè theo ngày.
2. **Thuê ô / thuê nhà**: ☰ Menu → 🗺️ **Bản đồ xóm** (sheet mới; gộp 📍 Chỗ bán + 🏠 Thuê nhà): bản đồ lưới nhìn từ trên, mỗi ô
   có trạng thái (trống, đang thuê, của ai, đang xây), giá, khu khách. Đi tới tận ô → "Thuê ô này" (đất trống: dựng sạp có mái)
   hoặc "Thuê nhà" (nhà NPC, như UC-F12).
3. **Mua đứt ô**: giá theo khu + vị trí (góc phố, gần chợ đắt hơn; khu mở sau rẻ hơn); mua rồi không trả tiền thuê, đóng **thuế
   đất** mỗi ngày (sink nhỏ). Trần số ô mỗi người (vd. 3) để không ai ôm hết đất.
4. **Xây tiệm**: trên ô của mình chọn mẫu công trình → trả vật liệu → công trường 3D (giàn giáo) → phụ hồ (mình hoặc người chơi
   khác, tiền công từ chi phí) trộn đủ vữa + đủ ngày → thành tiệm (dùng lại `ProjectService` / UC phụ hồ).
5. **Lên tầng** = nâng cấp tiệm (gộp UC-M9): nhà 1 → 2 → 3 tầng, mỗi tầng thêm khách × và chỗ cho nhân viên; đang xây thì đóng.
6. **Xóm mở rộng**: ≥ 70% ô đất (LAND + HOUSE) của các khu đã mở có chủ/người thuê → server mở khu kế (thứ tự xoắn ốc quanh khu
   gốc), tin "🏗️ Xóm mở thêm khu mới phía đông". Khu mới rẻ hơn, ít khách lúc đầu; khách theo mật độ tiệm.

## 6. Bước làm (mỗi bước một commit, test xanh + deploy)
| Bước | Nội dung | Ghi chú |
|---|---|---|
| A ✅ | `content.chunks` + ghép lưới động theo xóm (`Room.chunks` JSON — gọn hơn bảng riêng) gửi trong `WorldView`; client dựng cảnh / A* / giao thông từ lưới ghép | Xong 2026-10-03 (UC-B12); mở khu bằng `debug:chunk` |
| B | Bảng `Plot` + migration từ `lotId`; server đọc chỗ bán từ Plot | Đổi ~50 chỗ dùng `content.lot()` → qua một `PlotRepo` |
| C | Sheet 🗺️ Bản đồ xóm (lưới từ trên, gộp Chỗ bán + Thuê nhà); thuê ô đất trống dựng sạp có mái | Mobile-first, Pixel 7 |
| D | Mua đứt ô + thuế đất + trần số ô; `pnpm balance` thêm chiến lược "mua ô" | Money sink lớn |
| E | `content.buildings` + xây tiệm (vật liệu, ngày, phụ hồ), công trường 3D; lên tầng = cấp tiệm | Gộp UC-M9 |
| F | Tự mở khu mới khi ≥ 70% ô có chủ; bảng tin xóm | Hiệu năng: chỉ dựng khu trong tầm camera |

## 7. Đã chốt (2026-10-03)
1. Hình dạng: **lưới ô kiểu Township** — xóm ghép thêm khu bốn phía.
2. Sở hữu: **thuê + mua đứt** (thuế đất mỗi ngày, trần số ô mỗi người).
3. Xây: **chọn mẫu công trình** có sẵn.
4. Mở khu mới: **≥ 70% ô đã có chủ**.

## 8. Rủi ro / lưu ý
- Hiệu năng điện thoại (PLAN §1): lưới lớn dần → instancing + chỉ dựng khu gần camera; trace bằng `chrome-devtools` CPU ×4.
- Giao thông + NPC đi bộ hiện đọc lưới tĩnh — bước A phải cho chúng đọc lưới ghép.
- Chuyển xóm khi có ô đất/tiệm: chủ vẫn giữ ô ở xóm cũ (tiệm đóng, thuế đất vẫn tính) — cần luật rõ ở bước D.
