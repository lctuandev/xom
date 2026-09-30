# XÓM — Style bible v0

Mọi asset (mua, tải, tự làm) phải đặt cạnh bộ mẫu gốc và trông như cùng một game.

## Phong cách
- Stylized low-poly, màu phẳng, hơi cartoon, tỉ lệ hơi phóng đại; đọc rõ trên màn hình 6 inch.
- Không texture chi tiết. Màu lấy từ **texture palette** (kiểu colormap của Kenney) hoặc base color phẳng của palette dưới đây.
- Không đổ bóng real-time: bóng tròn mờ dưới nhân vật, không bóng cho prop.
- Material ở runtime là `MeshLambertMaterial` (code tự đổi từ PBR) → đừng dựa vào roughness/metalness để tạo khác biệt.

## Palette (v0)

| Token | Hex | Dùng cho |
|---|---|---|
| `xom-red` | `#e4432d` | ghế nhựa, biển hiệu, nút chính |
| `xom-sun` | `#f6b93b` | điểm nhấn, cảnh báo, mái tôn |
| `xom-leaf` | `#2f7d4f` | cây, dù bạt, biển hiệu phụ |
| `xom-cream` | `#fff6e5` | nền UI, chữ trên biển |
| `xom-ink` | `#2b2118` | chữ UI, viền |
| `xom-sky` | `#bfe3f2` | trời |
| `xom-ground` | `#a9b89c` | đất/cỏ ngoài phố |

Khi đặt màu trong Blender (Base Color là linear), dùng giá trị đã chuyển từ sRGB — xem `art/blender/ghe_nhua.py`.
Palette sẽ mở rộng lên 16–24 màu khi làm thêm asset; thêm màu mới phải ghi vào bảng này.

## Kích thước & quy ước
- 1 unit = 1 m, pivot ở đáy giữa, trục +Y lên (Blender: +Z lên, exporter tự đổi).
- Một ô phố = 4 m. Mặt tiền nhà ống rộng 4 m.
- Người lớn ≈ 1,7 m. Ghế nhựa lùn 0,30 m.
- Scale của từng bộ asset mua/tải được khai báo trong `packages/assets/bundles.json` (Kenney city ×4, nhân vật ×2,5, xe ×1,6).

## Ngân sách polygon
| Loại | Tris |
|---|---|
| Prop nhỏ (ghế, ly, thùng) | 200–1.500 |
| Module nhà | 500–2.000 |
| Nhân vật | 1.500–3.000 |
| Xe | ≤ 6.000 |

## Camera & bố cục
- Camera nhìn dọc theo con phố, lệch nhẹ sang bên (offset `(22, 26, 6)`): trên màn hình dọc, phố chạy từ dưới lên.
- Hệ quả: mặt tiền nhà bị nhìn xiên → **biển hiệu là biển hộp đèn vuông góc với mặt tiền** (đâm ra vỉa hè), không dán phẳng lên tường.
- Biển hiệu vẽ chữ lúc runtime (font Be Vietnam Pro 800), không làm thành asset.

## Asset mẫu gốc (cần hoàn thành)
- [x] Ghế nhựa đỏ lùn — `art/blender/ghe_nhua.py`
- [ ] Bàn inox thấp
- [ ] Xe bánh mì kính
- [ ] Xe máy kiểu số (không logo hãng)
- [ ] Mặt tiền nhà ống (module)
- [ ] Cột điện dây rối
- [ ] Dù bạt / mái hiên
- [ ] Thùng đá xốp, ly trà đá
