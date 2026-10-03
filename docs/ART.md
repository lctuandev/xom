# Làm lại đồ hoạ: cảnh vật, nhà, nhân vật chi tiết & chân thật hơn (kế hoạch, ĐÃ CHỐT 2026-10-03)

> Góp ý đợt 3 của chủ dự án (2026-10-03): "thiết kế lại các cảnh vật, ngôi nhà, nhân vật… (tất cả) cho chi tiết hơn trong Blender
> sao cho các vật thể trông chân thật hơn nữa (hiện tại còn quá đơn sơ)".
> Đọc kèm: `docs/art/STYLE.md` (style bible v0), `docs/PLAN.md` §1 (ngân sách hiệu năng), `packages/assets/bundles.json`.
> Trạng thái: **đã chốt** (§7): hướng A low-poly chi tiết, nhà & phố trước, tự dựng bằng script Blender.

## 1. Hiện trạng
- Phần lớn cảnh là **Kenney** (city kit roads / commercial, car kit, mini characters) scale ×4 / ×1,6 / ×2,5 — khối hộp, màu
  phẳng, nhìn ra "đồ chơi", không có chất Việt Nam.
- ~20 model tự dựng bằng script Blender (`art/blender/*.py` → `art/export/*.glb`): nhà tranh, nhà cấp 4, nhà ống 1–2 lầu, tạp
  hoá, UBND, trường làng, cây dừa/chuối/tre, ghế nhựa, xe bánh mì / trà sữa, sạp phụ kiện, ATM… — mỗi cái vài trăm tam giác,
  chưa có chi tiết (cửa sắt kéo, ban công, mái ngói, dây điện, biển hiệu thật).
- Nhân vật: 4 dáng Kenney mini (không tóc/áo riêng), chân dung render bằng `chan_dung.py`.
- Nhà xây trên ô đất (bước E bản đồ mở) đang tạm dùng `building-a/c` của Kenney (kiểu phố tây).
- Ngân sách đang đạt: ~50 draw call, ~50k tam giác, asset ~1,5 MB (đo Pixel 7 headless).

## 2. Mục tiêu & ràng buộc
- Nhìn vào là thấy **phố Việt**: nhà ống mặt tiền hẹp nhiều kiểu, mái tôn / ngói, ban công sắt, cửa cuốn / cửa sắt kéo, biển hiệu
  hộp đèn, dây điện rối, xe máy dựng vỉa hè, ghế nhựa, cây bàng / phượng, gạch vỉa hè.
- **Giữ ngân sách điện thoại** (PLAN §1): < 100 draw call, < 80k tam giác trên màn hình, texture < 64 MB, tải lần đầu < 5 MB,
  sàn 30 fps Android tầm trung. Chi tiết phải "rẻ": hình khối + màu đỉnh + một atlas nhỏ, không texture ảnh chụp.
- Vẫn một phong cách thống nhất (STYLE.md) — chi tiết hơn chứ không trộn đồ thật với đồ hoạt hình.

## 3. Hướng phong cách (❓ chọn một)
| Hướng | Mô tả | Hiệu năng | Ghi chú |
|---|---|---|---|
| **A. Low-poly chi tiết** (đề xuất) | Giữ màu phẳng nhưng nhiều hình khối hơn (vát cạnh, khung cửa, ban công, mái ngói gợn), **AO nướng vào màu đỉnh**, một atlas palette 256 px + trim sheet nhỏ cho cửa cuốn / gạch | Tốt (tăng ~2× tris, cùng số draw call nhờ instancing) | Gần kiểu "Happy Citizens / Pocket City" — chân thật hơn mà vẫn nhẹ |
| B. Toon + viền đen | Như A nhưng thêm nét viền (nhánh `feat/phong-cach-toon` đang làm dở) | Thêm 1 pass viền (~+30% draw) | Đẹp, nhưng viền tốn trên máy yếu |
| C. Bán thực (PBR, texture ảnh) | Texture gạch/tôn/gỗ thật, normal map | Vượt ngân sách texture + tải | Không khuyến nghị cho web điện thoại |

## 4. Cách tăng chi tiết mà vẫn rẻ
- **Bộ module nhà ống** (kit): tầng trệt (cửa cuốn / cửa sắt kéo / mặt tiền quán), lầu (cửa sổ, ban công sắt, cây kiểng), mái
  (tôn, ngói, sân thượng có bồn nước inox), biển hiệu hộp — ghép ngẫu nhiên tất định theo ô → hàng trăm biến thể từ ~15 module.
- **AO + "bẩn" nướng vào màu đỉnh** trong Blender (script), không cần texture.
- **LOD 2 mức** cho nhà (gần: đủ chi tiết; xa: khối gộp) + chỉ dựng khu gần camera (nối với bản đồ mở BANDO §8).
- **Instancing** như hiện nay; gộp các module cùng material vào một mesh khi ghép nhà (giữ draw call thấp).
- Nén `gltf-transform` meshopt (đã có trong `pnpm assets`), atlas WebP.

## 5. Thứ tự làm (mỗi bước: script Blender → `art/export` → `pnpm assets` → đo chrome-devtools trước/sau → Playwright ảnh)
1. **Kit nhà ống Việt** (thay `building-*` của Kenney ở phố chính + nhà xây trên ô đất bước E: tiệm 1 tầng, nhà 2 tầng).
2. Nhà cấp 4 / mái tôn / nhà tranh làm lại theo kit; tạp hoá, UBND, trường làng.
3. Đường + vỉa hè gạch, cột điện dây rối, đèn đường kiểu VN, biển báo, nắp cống.
4. **Nhân vật modular**: thân + tóc + áo + quần + nón (nón lá, mũ bảo hiểm) + dép; dùng chung khung xương, đổi màu theo người →
   cũng là nền cho "tạo nhân vật" (FEATURES §2 ⏳). Chân dung render lại bằng `chan_dung.py`.
5. Xe máy kiểu số (không logo hãng), xe đạp, ba gác.
6. Đồ nghề quầy chi tiết (xe bánh mì kính, xe trà sữa, sạp phụ kiện, xe đồ nghề sửa xe) + đồ quán (bàn inox, thùng đá, ly trà đá).
7. Cây: bàng, phượng, dừa, chuối, tre làm lại; chậu kiểng.
8. Nội thất tiệm theo nghề (backlog 3.2 — "nội thất riêng theo nghề").

## 6. Ngân sách từng loại (cập nhật STYLE.md)
| Loại | Tris (gần) | Tris (LOD xa) |
|---|---|---|
| Module nhà (một tầng) | 400–1.200 | — |
| Nhà ống ghép (2–3 tầng) | ≤ 3.500 | ≤ 600 |
| Prop nhỏ | 200–1.500 | — |
| Nhân vật | 2.000–4.000 | — |
| Xe máy | ≤ 3.000 | — |

## 7. Cần chủ dự án chốt ❓
1. Hướng phong cách: **A** (đề xuất) / B / C.
2. Làm theo thứ tự §5 (nhà trước, nhân vật sau) hay ưu tiên nhân vật trước?
3. Có dùng thêm asset trả phí/CC0 bên ngoài (Synty, Kenney mới…) hay tự dựng hết bằng script Blender?

## 7b. Tiến độ
- **Bước 1 (2026-10-03) — kit nhà phố Việt** `art/blender/nha_pho.py`: 6 mẫu (`nha-pho-a…d` cho dãy phố chính qua
  `content.housing.shops`; `tiem-1-tang`, `nha-2-tang` cho nhà xây trên ô đất — thay `building-a/c` Kenney). Tường vát cạnh, AO
  nướng vào màu đỉnh (Cycles), chi tiết mảnh là mặt phẳng 2 tam giác (`plate`) → 250–620 tam giác/nhà, bundle village 111 KB.
  Đo trong game (Pixel 7 headless): draw call không đổi (118–121); tam giác 90k → ~116k. **Cảnh đã vượt ngân sách 80k từ trước**
  — Playwright `nha-pho` chặn hồi quy ở mức hiện tại; kéo về ngân sách là việc riêng (HANDOFF).
- Còn: bước 2 (nhà cấp 4, tạp hoá, UBND, trường theo kit), mái chi tiết hơn (camera nhìn từ trên thấy mái nhiều nhất).

## 8. Đã chốt (2026-10-03)
1. Phong cách: **A. low-poly chi tiết** (màu phẳng, nhiều hình khối hơn, AO nướng vào màu đỉnh, atlas palette nhỏ).
2. Thứ tự: **nhà & phố trước** (kit nhà ống Việt → nhà cấp 4/tạp hoá/UBND/trường → đường, vỉa hè, cột điện) rồi mới nhân vật.
3. Nguồn: **tự dựng bằng script Blender** (`art/blender/*.py`, chạy `blender -b -P`), không mua asset ngoài.
