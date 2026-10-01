# XÓM — Luật thiết kế (Design Bible)

> Tài liệu này là **luật**: mọi tính năng mới phải đối chiếu với các điều dưới đây trước khi làm, và ghi rõ trong
> use case (docs/USECASES.md) nó thuộc hệ thống nào, tuân theo luật nào. Mâu thuẫn với luật → sửa thiết kế, không sửa luật
> (muốn đổi luật thì đổi ở đây trước, có lý do).
>
> Nguồn: các nguyên tắc người chơi/chủ dự án đặt ra (10/2026), diễn giải thành luật có thể kiểm tra được.

## 0. Vòng lặp cốt lõi

```
CHƠI → Khám phá xóm → Gặp người → Kiếm / tiêu tiền → Gây dựng việc làm ăn → Nâng cấp cuộc sống → Sự kiện chung → Khám phá ↺
```

**Luật 0.1** — Mỗi tính năng phải phục vụ ít nhất một mắt xích của vòng lặp. Không phục vụ mắt xích nào → không làm.
**Luật 0.2** — "Làm thật": tiền và tiến bộ đến từ **hành động** của người chơi (làm món, giao hàng, bưng bê…), không có thu nhập tự chạy.

## 1. 👁️ Camera

- Góc nhìn **thứ ba**; về sau có thể thêm góc nhìn thứ nhất (chỉ trong nhà / khi ngồi xe).
- **Cùng một bộ cử chỉ ở mọi cảnh** (phố và trong nhà):
  - **1 ngón kéo** → xoay quanh nhân vật (ngang = xoay, dọc = nghiêng). **Chạm** (không kéo) → đi tới / tương tác.
  - **2 ngón chụm/xoè** → thu/phóng; **2 ngón vặn** → xoay.
  - Không dùng nút xoay trên màn hình (chỉ cử chỉ); có thể có nút "về góc mặc định".
- Tường/nhà che nhân vật thì cắt/làm mờ; góc mặc định mỗi nơi phải thấy được việc cần làm.

## 2. 💰 Kinh tế & tiền tệ

| Loại | Ý nghĩa | Ghi chú |
|---|---|---|
| 💵 **Tiền mặt** | Giao dịch hằng ngày | Mệnh giá **tiền Việt Nam thật**: 1.000 · 2.000 · 5.000 · 10.000 · 20.000 · 50.000 · 100.000 · 200.000 · 500.000đ; giá & thối tiền làm tròn theo mệnh giá có thật (không có tiền lẻ dưới 500đ) |
| 🏦 **Ngân hàng** | Tiền gửi / tiết kiệm, nhận chuyển khoản | Khách trả chuyển khoản vào tài khoản; rút tiền mặt ở cây ATM/ngân hàng; lãi rất nhỏ |
| ⭐ **Uy tín** | Không phải tiền nhưng có giá trị kinh tế | Quyết định lượng khách, giá bán được, ai chịu làm cho mình |
| 🏆 **Danh tiếng / thành tựu** | Địa vị xã hội | Vô danh → Người trong xóm → Có tiếng → Nổi tiếng |

**Luật 2.1** — Mọi biến động tiền đi qua **sổ cái kép** trên server (số nguyên VND), có lý do (`reason`) để thống kê.
**Luật 2.2 — Money sink bắt buộc.** Mỗi nguồn thu mới phải đi kèm (hoặc đã có) chỗ tiêu tương xứng. Danh mục chỗ tiêu:
tiền thuê chỗ/nhà · ăn uống · xăng · thuế/phí chợ · bảo trì/sửa chữa · chi phí kinh doanh (nguyên liệu, điện nước) ·
lương nhân viên · trang trí · xe cộ · nhà ở. Chạy `pnpm balance` mỗi khi đổi số liệu: người chơi chăm chỉ phải **giàu dần nhưng chậm**,
không có chiến lược nào "càng ngày càng giàu không giới hạn".
**Luật 2.3** — Không có thu nhập thụ động không giới hạn (lãi ngân hàng, cho thuê… đều có trần và tốn công quản lý).

**Luật 2.4 — Giá theo thị trường thật (xóm quê / thị trấn, 2025–2026).** Giá bán món và giá sỉ nguyên liệu lấy đúng giá chợ;
tài sản (xe, chỗ, nhà) lấy giá thuê/giá đồ cũ thật. Vì 1 ngày game chỉ ~16 phút thật và người chơi phục vụ ít khách hơn ngoài đời
(20–40 khách thay vì 60–100), **lương giờ** là con số duy nhất được nén lại cho cân với lãi buôn bán.

| Mục | Ngoài đời (tham khảo) | Trong game |
|---|---|---|
| Bánh mì thịt / xíu mại / trứng | 15–20k | 16k / 18k / 14k |
| Trà sữa ly M ở xe đẩy | 20–30k | 25–27k |
| Kẹp tóc · móc khoá (giá sỉ → bán lẻ) | 5–10k → 15–35k | 9–11k → 30–35k |
| Xe bánh mì kính (cũ) | 1–1,5tr (mới 3–5tr) | 1,2tr |
| Xe đẩy trà sữa (cũ) | 1–2tr | 1,3tr |
| Sạp bạt + kệ phụ kiện | 0,5–1tr | 600k |
| Chỗ đứng vỉa hè đầu hẻm / gốc cây | 10–30k/ngày | 10–25k |
| Chỗ đông (cổng trường, chợ, trạm xe) | 30–50k/ngày | 30–50k |
| Góc ngã tư | ~100k+/ngày | 120k |
| Nhà mặt tiền nhỏ / lớn ở thị trấn | 2–4,5tr/tháng | 70k / 140k mỗi ngày |
| Sửa xe đẩy (thay bánh, kính, sơn) | 100–200k | tới 12% giá xe (~144k) |
| Vốn tích góp ra bán hàng rong | 1–3tr | 1,5tr |
| Phụ quán cơm / giao hàng | 25–30k/giờ | 10k / 8k mỗi giờ + tiền việc (nén) |

Hoàn vốn xe đẩy 4–9 ngày game (`pnpm balance`) — đủ thấy tiến bộ mà không "giàu sau một buổi".

## 3. 🧍 Nhân vật & 🧠 Hành vi

- Nhân vật người chơi: ngoại hình, tên, chỉ số (cấp, kinh nghiệm, kỹ năng), túi đồ.
- **NPC có lịch sinh hoạt và mục đích**: đi làm sáng, ăn trưa, tan học, ăn tối ngoài quán, về nhà; ghé quầy theo sở thích, ngân sách,
  thời tiết; nhớ quầy quen; phản ứng (than, cãi, khen, boa, quỵt). Hành vi khai báo bằng dữ liệu (archetype + lịch), không hard-code từng con.
- NPC lấp chỗ trống khi ít người chơi (nhân viên, chủ tiệm), nhưng **không bao giờ chiếm chỗ người chơi**.

## 4. 📈 Tiến trình — "mình đang phát triển"

- **Cá nhân**: cấp độ · kinh nghiệm · kỹ năng (tay nhanh, nhớ món, ăn nói…) · uy tín.
- **Làm ăn**: Xe đẩy (nhỏ) → Tiệm (vừa) → Tiệm lớn có nhân viên → Chuỗi.
- **Xã hội**: Vô danh → Người trong xóm → Có tiếng → Nổi tiếng.

**Luật 4.1** — Mỗi phiên chơi (~15 phút) người chơi phải thấy ít nhất một thanh tiến độ nhích lên. **Luật 4.2** — Mở khoá bằng làm thật, không mua bằng tiền thật (không monetization).

## 5. 🏠 Tài sản

Phòng trọ → Căn hộ → Nhà → Tiệm (mặt bằng) → Kho → Văn phòng → Xưởng. Thuê hoặc mua; **trang trí tự do**; **nội thất là đồ sưu tầm**.
Mỗi tài sản có chi phí duy trì (Luật 2.2).

## 6. 🛵 Phương tiện

Đi bộ → Xe đạp → Xe máy → Ô tô → Xe tải. Xe vừa là đi lại vừa là **thiết bị làm ăn**: xe máy giao hàng (chở nhiều đơn hơn, nhanh hơn),
xe tải (nhập hàng số lượng lớn). Có xăng, hư hỏng, gửi xe (Luật 2.2).

## 7. 🏪 Làm ăn — lõi của game

```
Nhà cung cấp → Kho → Định giá → Tiếp thị → Khách → Đánh giá → Doanh thu
```

**Rủi ro bắt buộc có**: hàng tồn · hàng hỏng · đối thủ · giá nguyên liệu biến động · khách phàn nàn · trào lưu thay đổi.
**Luật 7.1** — Không có "mua → bán" một chạm: mỗi khâu là một quyết định hoặc một thao tác của người chơi.

## 8. 🌦️ Thế giới thay đổi

- **Thời gian**: sáng · chiều · tối · đêm (ánh sáng, đèn, sạp mở/dọn theo giờ).
- **Thời tiết**: ☀️ nắng · 🌧️ mưa · ⛈️ bão · 🌫️ âm u — ảnh hưởng khách, giá, giao hàng.
- **Giao thông**: giờ cao điểm đường đông, kẹt xe. **Đám đông**: tối khu ăn uống đông.
**Luật 8.1** — Thế giới thay đổi phải **buộc người chơi thích nghi** (đổi giờ bán, đổi món, đổi chỗ), không chỉ để trang trí.

## 9. 🎲 Sự kiện

Cá nhân (khách VIP ghé quán) · Khu phố (hội chợ) · Toàn server (mưa lớn) · **Do người chơi tạo** (khai trương, tiệc) — loại cuối ưu tiên.
Sự kiện khai báo bằng dữ liệu (điều kiện, thời lượng, ảnh hưởng).

## 10. 🎨 Bản sắc

- **Hình**: 3D stylized low-poly, nhiều màu; **màu**: ấm, vui, hơi hoài cổ; **kiến trúc**: phố Việt (nhà ống, ban công, bảng hiệu, dây điện, hẻm).
- **Âm thanh là bản sắc**: tiếng xe máy, tiếng rao, tiếng quán ăn, còi xe, mưa, tiếng người nói chuyện — nghe là biết "đây là XÓM".

## 11. 🔊 Âm thanh

Các lớp: **Nhạc nền (BGM)** · **Hiệu ứng (SFX)** · **Môi trường (ambient)** · **Giao diện (UI)** · **Nhân vật** · **Xe cộ** · **Làm ăn**.
Sau này: **âm thanh theo khoảng cách** (đứng gần nghe rõ, đi xa nhỏ dần). Mọi lớp chỉnh âm lượng riêng; tắt tiếng một chạm.

## 12. 📱 Giao diện

- HUD **tối giản**: tiền · nhân vật ở giữa · bản đồ / túi đồ · nút **Tương tác** theo ngữ cảnh.
- Hệ thống phức tạp (Làm ăn, Kho, Bản đồ, Xã hội…) nằm trong **menu / sheet**, không bày ra màn hình chính.
**Luật 12.1** — Thêm nút lên màn hình chính phải bỏ/gộp một nút khác. **Luật 12.2** — Mọi thao tác chính trong vùng ngón cái, 360×640 dùng được.
**Luật 12.3** — Sheet có list dài (quá ~1,5 màn hình) thì chia **tab dính** trên đầu vùng cuộn (component `Tabs`):
phần quyết định chính (nút Mở quầy, cách trả tiền…) để trên tab, mỗi tab một nhóm; tab mặc định theo ngữ cảnh
(vd. chưa chọn chỗ bán thì mở tab Chỗ bán). Đang áp: chợ đầu mối (theo nghề + Thanh lý), Làm ăn, Hồ sơ, Bảng xóm.
**Luật 12.4** — Nút neo trên bản đồ là **icon vẽ tay (SVG) không nền, không chữ** — nhìn là biết (tô phở = Ăn uống,
rổ rau = Chợ, cúp = Bảng xóm, bánh răng = Cài đặt, bong bóng = Chat); tên đầy đủ ở `aria-label`/`title`; class `icon-halo`
(quầng trắng + bóng) để nổi trên mọi nền 3D. Cột neo trái tối đa 3 icon (Luật 12.1).
**Luật 12.5 — Sheet hay Modal:** *bottom sheet* cho thao tác trong lúc chơi, cần vẫn thấy bản đồ (chợ, làm ăn, quầy hàng xóm…);
*modal* giữa màn hình (`Modal`) cho nội dung xem trọn vẹn, cần tập trung (bảng xếp hạng, hướng dẫn cài đặt). Bảng xếp hạng
có bục vinh danh 2–1–3: hạng 1 khung vàng + vương miện + viền sáng xoay (tắt khi máy bật giảm chuyển động), hạng 2 bạc, hạng 3 đồng.

## 13. 🌐 Nhiều người chơi

Gần nhau thì thấy nhau · **Nhóm** 4 người · **Hợp tác làm ăn** 2–5 người · **Xóm** 20–50 người · **Thế giới** hàng trăm/nghìn người chia instance.

## 14. 🔐 Bảo mật / chống gian lận

Client chỉ nói **"tôi muốn bán món X"**, không bao giờ nói **"tôi có 1 tỷ"**. Server kiểm: có món X không? giá hợp lệ không?
giao dịch hợp lệ không? (đứng đủ gần, đúng giờ, đủ tiền, đủ thời gian đi bộ…) → rồi mới cộng tiền.

## 15. 🧩 Dữ liệu điều khiển

NPC · Món/đồ · Nghề · Xe · Nội thất · Nhiệm vụ · Sự kiện · Công trình — **đều là dữ liệu** trong `packages/content` (zod validate,
kiểm chéo tham chiếu). Thêm món/nghề mới **không viết lại gameplay**.

## 16. 📊 Đo lường

Ngay từ đầu ghi sự kiện (bảng `GameEvent`): DAU/MAU · thời lượng phiên · giữ chân (D1/D7/D30) · nghề được chọn · tiền kiếm/tiêu (theo `reason`) ·
**nơi người chơi bỏ cuộc** (bước kịch bản, màn hình cuối cùng). Ví dụ: 70% bỏ khi mở quầy lần đầu → onboarding có vấn đề.
**Luật 16.1** — Không thu thập dữ liệu cá nhân ngoài tên đăng nhập; số liệu chỉ để cải thiện game.

## 17. ♻️ Giữ chân — lành mạnh

Lý do quay lại: sự kiện ngày · chợ phiên tuần · mục tiêu làm ăn · bạn bè đang làm gì · trang trí nhà · sưu tầm · mùa · nghề mới.
**Luật 17.1** — **Không** ép đăng nhập bằng phần thưởng điểm danh dồn dập, không thông báo dồn dập, không cơ chế "mất trắng nếu không vào".

## Khung hệ thống

```
XÓM
├── 👁️ Camera            ├── 🌦️ Thế giới thay đổi
├── 🧍 Nhân vật           ├── 🎲 Sự kiện
├── 🧠 AI / Hành vi        ├── 🤝 Xã hội
├── 💰 Kinh tế            ├── 💬 Giao tiếp
├── 🏪 Làm ăn             ├── 🌐 Nhiều người chơi
├── 📦 Kho / túi đồ        ├── 🔐 Bảo mật
├── 🏠 Nhà ở / tài sản     ├── 🎨 Bản sắc
├── 🛵 Phương tiện         ├── 🔊 Âm thanh
├── 🌆 Thế giới mở         ├── 📱 Giao diện
├── 📈 Tiến trình          ├── 📊 Đo lường
└── ♻️ Giữ chân
```

Trạng thái từng hệ thống: docs/FEATURES.md mục "Khung hệ thống".
