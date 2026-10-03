# Cấu trúc lại: mở & quản lý cửa hàng (góp ý đợt 5 — ĐÃ CHỐT 2026-10-03)

> Chủ dự án (2026-10-03): "cửa hàng / vựa xe và thuê nhà & giấy tờ còn đang conflict gây khó hiểu với nhau, tôi không hiểu cách
> dùng — cấu trúc lại hoặc tách ra riêng hoàn toàn".

## 1. Hiện trạng — một việc "có cửa hàng" bị rải ra 4 nơi
| Việc người chơi muốn làm | Đang ở đâu | Vì sao rối |
|---|---|---|
| Mở cửa hàng mới | 🛒 **Vựa xe Ông Sáu** (phải đi bộ tới): nút "Mua" / "🏪 Mở thêm cửa hàng" | "Mở cửa hàng" lại nằm trong chỗ bán xe; không nói trước sẽ tốn những gì (chỗ, nhà, giấy tờ) |
| Đổi nghề, sửa xe | 🛒 Vựa xe | Cùng màn với mở cửa hàng → dễ bấm nhầm "đổi nghề" thay vì "mở thêm" |
| Chọn chỗ vỉa hè / ô đất, mua đất, xây tiệm | 📍 Chỗ bán | Nhà mặt tiền cũng hiện ở đây nhưng bấm vào lại bảo sang 🏠 |
| Thuê nhà mặt tiền + hộ kinh doanh + ATTP + biển hiệu + tiền nhà | 🏠 Thuê nhà & giấy tờ | Áp cho "cửa hàng đang quản lý" một cách ngầm; ký thuê nhà là dọn luôn cửa hàng đó vào nhà |
| Đang quản lý cửa hàng nào | 🏬 Các cửa hàng + hàng chip ở mọi sheet | Mọi sheet trên đổi theo lựa chọn này mà không nói rõ |

## 2. Đề xuất A (khuyên dùng) — mỗi nơi một việc, mở cửa hàng là một luồng có hướng dẫn
1. **🏬 Cửa hàng của tôi** (trang chủ quản lý, thay "Các cửa hàng"): danh sách thẻ cửa hàng + nút **"＋ Mở cửa hàng mới"**.
2. **Luồng "Mở cửa hàng mới"** (wizard 4 bước, làm ngay trong sheet, không phải đi bộ):
   ① Bán gì (bánh mì, trà sữa, phụ kiện, sửa xe) → ② Kiểu cửa hàng: **🛒 Xe đẩy vỉa hè** / **⛺ Sạp ô đất** / **🏠 Tiệm nhà mặt tiền**
   — mỗi kiểu ghi rõ tổng chi phí ban đầu + mỗi ngày (đồ nghề, tiền chỗ/ô/nhà, cọc, giấy tờ) → ③ Chọn chỗ trên 🗺️ bản đồ → ④ Xác
   nhận & trả. Xong thì có danh sách "việc tiếp theo" (ra chợ nhập hàng; tiệm thì làm giấy tờ).
3. **Mỗi thẻ cửa hàng → trang quản lý của nó** (đúng một cửa hàng, ghi tên trên đầu): Mở/Đóng · Nhập hàng · Thực đơn & giá ·
   Nhân viên · **📍 Chỗ & nhà** (đổi chỗ / tiền nhà / trả nhà / mua đất / xây) · **📜 Giấy tờ** (chỉ tiệm) · Sổ sách · Đánh giá.
   Bỏ khái niệm "cửa hàng đang quản lý" ngầm.
4. **🛒 Vựa xe Ông Sáu** chỉ còn là tiệm sửa/đổi đồ nghề (sửa xe, đổi sang đồ nghề khác cho một cửa hàng) — không còn "mở cửa hàng".
5. Menu ☰ nhóm 🏪: bỏ các ô 📍 Chỗ bán, 🏠 Thuê nhà & giấy tờ riêng lẻ (đã vào trang từng cửa hàng).

## 3. Đề xuất B (gọn, ít đổi) — chỉ tách vai rõ ràng
- 🛒 Vựa xe: chỉ sửa xe + đổi nghề. Nút "🏪 Mở cửa hàng mới" chuyển sang 🏬 Các cửa hàng (vẫn mua đồ nghề như cũ, không cần đi bộ).
- Gộp 📍 Chỗ bán + 🏠 Thuê nhà & giấy tờ thành một sheet **📍 Chỗ bán & giấy tờ** có tab: Vỉa hè/ô đất · Nhà mặt tiền · Giấy tờ.
- Giữ "cửa hàng đang quản lý", nhưng tiêu đề mọi sheet ghi rõ tên cửa hàng đang quản lý.

## 4. Cần chốt ❓
1. Đề xuất **A** (luồng mở cửa hàng + trang từng cửa hàng — đổi nhiều, rõ nhất) hay **B** (gọn, ít đổi)?
2. Mở cửa hàng mới có cần **đi bộ tới tận nơi** (vựa xe / chỗ / nhà) như hiện nay không, hay làm ngay trong sheet rồi chỉ phải tới
   tận nơi khi **mở cửa bán** lần đầu?

## 5. Đã chốt (2026-10-03)
1. **Đề xuất A**: 🏬 Cửa hàng của tôi + luồng "＋ Mở cửa hàng mới" (bán gì → xe đẩy / sạp / tiệm → chọn chỗ → trả) + trang quản lý
   từng cửa hàng; Vựa xe chỉ còn sửa / đổi đồ nghề.
2. **Mở cửa hàng làm ngay trong sheet** (không phải đi bộ tới vựa xe / chỗ / nhà); chỉ phải tới tận nơi khi mở cửa bán.
