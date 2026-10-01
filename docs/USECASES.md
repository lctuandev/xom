# XÓM — Kịch bản & Use case

> Tài liệu này mô tả **mọi việc người chơi làm được trong XÓM**, từng bước một, kèm các tình huống
> ngoài đời thật có thể xảy ra và luật game tương ứng. Đây là nguồn để viết test (Playwright + e2e server).
> Plan kỹ thuật và lộ trình: `docs/PLAN.md`.

## 0. Cách đọc

- Mỗi use case có mã `UC-<nhóm><số>`, trạng thái, và **tiêu chí kiểm chứng** (dùng làm test).
- Trạng thái: ✅ đã làm & có test · 🚧 đang làm · ⏳ đã thiết kế, chưa làm.
- Mỗi use case gồm: **Ai / Khi nào** → **Luồng chính** (thao tác cụ thể) → **Đời thật & rẽ nhánh**
  (chuyện gì có thể xảy ra) → **Luật game** → **Kiểm chứng**.

### Nhân vật

| Vai | Mô tả |
|---|---|
| **Người mới** | Vừa tạo tài khoản, có 500.000đ, chưa có nghề |
| **Chủ quầy** | Người chơi có xe hàng / tiệm, tự bán hoặc thuê người |
| **Nhân viên** | Người chơi (hoặc NPC) làm thuê cho chủ quầy khác |
| **Khách** | Người chơi đi mua đồ ở quầy khác, hoặc NPC khách |
| **NPC địa điểm** | Ông Sáu (vựa xe), Bà Năm (chợ), Cô Tư (quán cơm), Anh Tám (bưu cục), Chú Chín (tiệm phụ tùng) |
| **Chú Bảy xe ôm** | NPC dẫn đường, kể chuyện, gợi ý |
| **NPC khách** | Học sinh, dân văn phòng, cô chú trong xóm, khách vãng lai, reviewer |
| **Hệ thống** | Server: đồng hồ, thời tiết, sự kiện, sổ cái |

### Nguyên tắc "đời thật → luật game"

1. **Không ai tự nhiên giàu**: tiền chỉ vào khi *làm* (làm món, sửa xe, bưng cơm…). Đứng im = không có thu nhập.
2. **Phải có mặt**: muốn mua gì, bán gì, làm gì → nhân vật phải ở tận nơi.
3. **Khách là người**: có yêu cầu cụ thể, có kiên nhẫn, biết chê đắt, biết boa, biết bỏ đi, biết nhớ quầy.
4. **Hàng hóa là thật**: nguyên liệu có hạn dùng, có hết, làm món nào tốn nguyên liệu nấy.
5. **Tiền là thật**: mọi đồng đi qua sổ cái; thối sai thì mất tiền hoặc mất uy tín.
6. **Luôn có đường sống**: phá sản vẫn đi làm thuê được; ví không bao giờ âm.
7. **Không ép trả tiền thật**, không năng lượng giới hạn giờ chơi.
8. **Xóm vắng người vẫn sống**: NPC lấp mọi vai trống (khách, nhân viên, chủ tiệm tuyển người).

---

## A. Tài khoản & phiên chơi

### UC-A1 · Tạo tài khoản ✅
**Ai:** người mới · **Khi nào:** lần đầu mở game.
**Luồng:** mở link → "Vào xóm" → tab *Tạo tài khoản* → nhập tên đăng nhập, tên hiển thị (tiếng Việt có dấu), mật khẩu → vào xóm với 500.000đ.
**Đời thật & rẽ nhánh:** tên đã có người dùng · mật khẩu quá ngắn · mạng rớt khi đang gửi · bấm nút hai lần.
**Luật:** username 3–20 ký tự không dấu, không phân biệt hoa thường; tên hiển thị 2–24 ký tự; vốn khởi nghiệp đi qua sổ cái.
**Kiểm chứng:** `apps/server/test/auth.e2e-spec.ts` (409 trùng tên, 400 kèm lỗi từng ô); `apps/web/e2e/*` (luồng đăng ký).

### UC-A2 · Đăng nhập / tự đăng nhập lại ✅
**Luồng:** mở `/play` → nếu còn phiên (cookie 30 ngày) vào thẳng; không thì sang trang đăng nhập rồi quay lại.
**Đời thật:** quên mật khẩu (chưa có email → nhờ quản trị reset) · đăng nhập sai nhiều lần (khóa 15 phút) · mở game trên 2 máy.
**Luật:** refresh token xoay vòng; token cũ hết hiệu lực ngay.
**Kiểm chứng:** `auth.e2e-spec.ts` (xoay vòng, logout thu hồi).

### UC-A3 · Mất mạng / tắt app giữa chừng ✅ (một phần)
**Đời thật:** vào thang máy mất sóng · khóa màn hình · chuyển app nhắn Zalo rồi quay lại.
**Luật:**
- Mất kết nối → quầy **ngừng bán ngay** (không có chủ), sau 30 giây vẫn chưa về thì quầy tự đóng.
- Quay lại trong 30 giây → vào lại như cũ, không mất gì.
- Đơn khách đang chờ lúc mất mạng: khách chờ hết kiên nhẫn thì đi; tiền chưa thu thì không mất gì ngoài cơ hội.
- Đang làm món dở (UC-F4) mà mất mạng → món bỏ dở, nguyên liệu **chưa bị trừ** (chỉ trừ khi giao món thành công).
**Kiểm chứng:** ⏳ Playwright: tắt mạng giả lập giữa ca bán → quầy đóng sau thời gian ân hạn.

### UC-A4 · Mở game trên hai tab/hai máy cùng lúc ⏳
**Luật:** cùng một người chơi chỉ điều khiển từ một nơi; tab mới vào thì tab cũ nhận thông báo "Bạn đang chơi ở nơi khác" và ngắt.

---

## B. Thế giới, di chuyển, thời gian

### UC-B1 · Đi lại trong xóm ✅
**Luồng:** chạm xuống đất → nhân vật đi tới; chụm 2 ngón để zoom.
**Luật:** chỉ đi trên vỉa hè/đường trong phạm vi xóm; chạm tay thì hủy mọi lộ trình tự động.

### UC-B2 · Đi tới địa điểm / tương tác ✅
**Luồng:** bấm "🚶 Đi tới" (ở dòng nhiệm vụ, bảng, hoặc thanh điều hướng) → nhân vật tự đi → tới gần hiện nút hành động ("🧺 Vào chợ · Bà Năm") → bấm để mở.
**Đời thật:** đang đi thì đổi ý (chạm chỗ khác → hủy) · đi ngang địa điểm khác (hiện nút của nơi gần nhất).
**Kiểm chứng:** `apps/web/e2e/nguoi-moi-*.spec.ts`.

### UC-B3 · Một ngày trong xóm ✅
**Luật:** 1 phút thật = 1 phút game; ngày chơi 06:00–22:00 (16 phút thật); ban đêm bỏ qua. Cuối ngày: quầy đóng, đồ ăn tươi hỏng, tổng kết lãi/lỗ.

### UC-B4 · Thời tiết ✅ (bản đầu)
**Hệ thống:** 🌦️ Thế giới thay đổi · **Luật:** 8.1 (buộc thích nghi), 12.1 (không thêm nút), 15 (dữ liệu điều khiển), 11 (âm thanh).
**Đời thật:** trưa nắng gắt người ta mua nước; mưa thì đường vắng, ai có mái che mới bán được; bão thì shipper chạy chậm, khách trả thêm phụ phí;
chiều Sài Gòn hay đổ mưa, nhìn trời kéo mây là biết dọn hàng.
**Luồng:** thanh 🕒 trên HUD hiện kiểu trời (☀️ nắng · 🌫️ âm u · 🌧️ mưa · ⛈️ bão; ban đêm trời quang là 🌙). Trời sắp đổi (trong 90 phút game)
→ thanh giờ hiện "→🌧️" và dải tin báo trước *"Khoảng 14:00 có mưa — chuẩn bị dời vô chỗ có mái"*. Tới giờ: thông báo
*"Trời đổ mưa — xe đẩy vắng khách, tiệm có mái đông lên"*, hạt mưa rơi, trời xám lại, tiếng mưa rào rào; giông thì chớp + sấm, đèn đường bật.
**Luật game:**
- Trời chia khối 2 giờ, chọn theo trọng số theo giờ (chiều hay mưa) + 50% giữ nguyên trời khối trước; **tất định theo (xóm, ngày)** —
  `weatherPlan` trong `packages/sim/src/weather.ts`, bảng số trong `content.weather`.
- Khách: hệ số theo chỗ bán **ngoài trời (xe đẩy)** / **trong nhà (tiệm)** × theo danh mục: mưa xe đẩy ×0,5, tiệm ×1,15, đồ nóng (bánh mì) ×1,15,
  đồ uống lạnh ×0,8; bão xe đẩy ×0,2; nắng đồ uống ×1,2. Quán cơm Cô Tư (có mái) cũng đông/vắng theo hệ số trong nhà.
- Giao hàng: mưa chạy chậm ×0,8 + phụ phí 20%, bão ×0,6 + phụ phí 50% (khách trả, người giao hưởng, tính lúc giao xong);
  đường trơn chạy nhanh dễ móp hàng dễ vỡ hơn (×1,6 / ×2,5).
- Thích nghi: dời xe đẩy vào tiệm có mái, đổi giờ bán, chuyển sang giao hàng lúc bão (phụ phí cao).
**Kiểm chứng:** unit `packages/sim/src/weather.test.ts` (tất định, đủ 4 kiểu, chiều mưa nhiều hơn sáng, hệ số khách, phụ phí, dự báo, đè khoảng trời);
e2e server `weather.e2e-spec.ts` (đồng hồ mang trời, báo trước, lệnh thử chỉ ở dev, phụ phí bão); Playwright `thoi-tiet.spec.ts`.
**Chưa:** mái che nâng cấp cho xe đẩy, "sau mưa khách túa ra", khách gọi ít đá khi trời mưa.

### UC-B5 · Sự kiện trong xóm ✅ (bản đầu: khai trương, khách VIP, mưa lớn)
**Hệ thống:** 🎲 Sự kiện · **Luật:** 9 (sự kiện là dữ liệu, ưu tiên do người chơi tạo), 2.2 (money sink), 8.1, 15.
Sự kiện khai báo trong `content.events`: **ai/khi nào gây ra** (`trigger`: `player` người chơi tạo · `daily` mỗi ngày tung xác suất cho cả xóm ·
`per_hour` cá nhân theo tỉ lệ), **thời lượng**, **ảnh hưởng** (`demand`, `discount`, `weather`, `vip`). Công thức thuần ở `packages/sim/src/events.ts`.

- **🎉 Khai trương (người chơi tạo):** bảng Làm ăn → *🎉 Khai trương · 100.000đ* (pháo giấy 40k, bong bóng 25k, băng rôn 35k — tiền đi qua sổ cái,
  lý do `event`). Phải đang mở quầy và đứng ở quầy; còn ít nhất 30 phút trước khi hết ngày; 3 ngày mới khai trương lại được.
  Trong 3 giờ game: khách ×1,8, mọi món giảm 10% (làm tròn 500đ, đơn có nhãn "🎉 giá khai trương"), quầy có chùm bong bóng,
  **cả xóm thấy tin** trên dải tin + thông báo ("🎉 An khai trương ở Đầu hẻm 12 — giảm 10%, ghé ủng hộ nha!").
  *Đời thật:* khai trương tốn tiền mà chưa chắc lời — đông khách nhưng phải làm kịp, không thì khách bỏ đi kéo uy tín xuống.
- **🕴️ Khách VIP (cá nhân):** quầy đang mở thỉnh thoảng (≈0,35 lần/giờ game) có khách sộp: dặn ít nhất 2 yêu cầu riêng, kiên nhẫn ×0,8;
  làm đúng + nhanh → boa ×5 và uy tín +0,04; làm sai, giảm giá, bỏ khách → uy tín −0,05. Màn làm món có nhãn "VIP · boa đậm".
- **⛈️ Mưa lớn toàn xóm:** 15% số ngày, trong khung 13:00–19:00, kéo dài 90 phút — đè thời tiết thành bão (UC-B4), nên được **báo trước** trên dải tin.

**Kiểm chứng:** unit `events.test.ts` (tất định, khung giờ, tần suất, thời gian chờ, chi phí, VIP dặn ≥2 món); e2e server `events.e2e-spec.ts`
(phải mở quầy, trừ đúng tiền, không khai trương chồng, đơn có giá khai trương; VIP boa đậm + uy tín lên/xuống); Playwright `khai-truong.spec.ts`.
**Chưa:** hội chợ đêm (UC-K1), tan trường sớm, mất điện, kiểm tra VSATTP; tiệc do người chơi mời bạn bè.

### UC-B6 · Xóm rộng, đường xá ra đường xá ✅ (bản đầu)
> Người chơi yêu cầu: map chuẩn chỉnh hơn, đường xá phân chia hợp lý, map rộng hơn, nhiều cảnh vật hơn.

**Bố cục (khoảng 3×2 dãy phố):** một **đường lớn** hai chiều có vạch, ngã tư có **đèn giao thông + vạch sang đường**, hai **đường nhánh**
và **hẻm** nhỏ (chỉ đi bộ/xe máy) dẫn vào khu nhà ở; **chợ** có mái, **công viên** nhỏ (cây, ghế đá), **trường học** (cổng trường),
**toà văn phòng**, **bãi giữ xe**, dãy **nhà phố** (tầng trệt buôn bán, trên ở), quán cà phê vỉa hè.
Vỉa hè rộng để bày sạp; cột điện dây chằng chịt, biển hiệu, mái hiên, dù che, ghế nhựa đỏ/xanh.
**Luật:** bản đồ khai báo trong `packages/content` (đường, lô, khu) — thêm khu mới bằng dữ liệu; mỗi lô bán có hướng mặt tiền;
người đi bộ trên vỉa hè/hẻm, sang đường ở vạch; xe chạy trên làn đường.
**Hiệu năng:** gộp mesh theo khu (instancing), vật ở xa bỏ bớt chi tiết; giữ ngân sách draw call mobile (PLAN §1).
**Đã làm:** bản đồ lưới 27×15 ô (4 m) trong `content.map` (kiểm tra địa điểm/chỗ bán/nhà giao hàng phải đứng trên ô đi được);
phố chính giữ nguyên, 2 đường dọc có ngã tư + đèn giao thông, 2 phố sau, hẻm có vạch sang đường, công viên (cây, hoa, ghế đá),
chợ (dù, ghế nhựa), trường học (sân, hàng rào), toà văn phòng + bãi xe, dãy nhà ở; cây + đèn đường + cột điện dọc vỉa hè;
**tìm đường A\*** (`packages/sim/src/grid.ts`): chạm vào nhà thì đi ra vỉa hè trước nhà, đi vòng qua hẻm/đường dọc, không xuyên nhà;
NPC đi dạo theo đường xá. **Chưa:** xe chạy trên đường, làm mờ nhà che nhân vật.

### UC-B7 · Góc nhìn tự do ✅ (bản đầu)
Chụm 2 ngón: zoom; **xoay 2 ngón**: xoay quanh nhân vật (0–360°); **kéo 2 ngón lên/xuống**: nghiêng (nhìn cao từ trên ↔ gần ngang tầm người);
nút 🧭 đưa về hướng bắc; nút 🎥 đổi nhanh 3 kiểu nhìn (trên cao / sau lưng / cận cảnh). Tường/nhà che nhân vật thì làm mờ.
**Đã làm:** vặn 2 ngón xoay 360°, kéo 2 ngón nghiêng, chụm zoom; nút ↺ ↻ (45°), ⤵ nghiêng, 🧭 về hướng mặc định (kim quay theo camera);
biển hiệu hai mặt chữ xuôi. **Chưa:** làm mờ nhà che nhân vật, nút đổi kiểu nhìn. **Kiểm chứng:** Playwright `goc-nhin.spec.ts`.

### UC-B8 · Ngày và đêm ✅ (bản đầu)
Trời sáng dần từ 05:30, trưa nắng gắt, chiều vàng, **tối từ 18:00**: trời xanh thẫm, **đèn đường bật** (vầng sáng dưới cột),
cửa sổ nhà sáng đèn, bảng hiệu quán sáng, sạp đêm treo bóng đèn. Ngày chơi kéo tới 23:00 để có chợ đêm.
**Luật:** ánh sáng theo phút game của xóm (server); thiết bị yếu thì giảm số đèn thật (dùng vầng sáng giả).
**Đã làm:** màu trời/nắng/ánh sáng theo giờ (bình minh 5:30, trưa, chiều vàng, hoàng hôn, đêm), mặt trời đi đông → tây; tối từ 17:40:
bóng đèn đường sáng + vầng sáng dưới đất, cửa sổ nhà sáng đèn, bóng đèn ở quầy đang mở và các địa điểm — không dùng đèn thật (vài draw call).
**Chưa:** kéo ngày tới 23:00 cho chợ đêm, bảng hiệu hộp đèn.

### UC-B9 · Sạp đồ ăn theo giờ ✅ (bản đầu)
**Sáng (06–10h):** xôi, bánh mì, phở, cà phê cóc. **Trưa (10–14h):** cơm tấm, bún, nước mía. **Chiều (14–18h):** bánh tráng trộn, trà sữa, chè.
**Tối (18–23h):** ốc, lẩu, nướng, hột vịt lộn — bàn ghế nhựa bày ra vỉa hè.
Sạp NPC tự dọn ra/dọn vào đúng giờ (thấy người bày hàng, dọn hàng); người chơi mở quầy cùng giờ thì cạnh tranh khách.
**Đã làm:** 8 sạp trong `content.vendors` (xôi Bà Bảy, phở Chú Hai, cà phê cóc, nước mía, bánh tráng trộn ở cổng trường, chè Cô Năm,
ốc đêm, nướng đêm) — tới giờ thì hiện xe/sạp, biển, người bán, ghế nhựa, vài người ngồi ăn (đổi theo giờ), tối có bóng đèn;
☰ → "🍜 Quán ăn quanh xóm" xem sạp nào đang bày, chạm "Đi tới" là đi theo đường tới, tới nơi mở thực đơn.
**Chưa:** hoạt ảnh bày/dọn hàng, cạnh tranh khách với quầy người chơi.

### UC-B10 · Cảnh sinh hoạt 🚧
NPC có việc để làm: đi làm buổi sáng, học sinh tan trường, người mua đồ ăn sáng đứng chờ, ngồi ghế nhựa ăn, uống cà phê, vào nhà hàng
rồi đi ra, chạy xe máy trên đường, dừng đèn đỏ, người bán dạo đẩy xe. Người chơi **làm khách**: mua đồ ăn ở sạp NPC (tốn tiền, ngồi ăn),
**vào quán cơm Cô Tư ngồi ăn** (thấy quán sống động từ phía khách), trò chuyện với người ngồi cùng bàn.

**Đã làm:** người chơi mua đồ ăn ở sạp (server kiểm giờ bày + đứng gần, tiền qua sổ cái, thân thiết +1), người bán nói một câu,
mình ra ghế nhựa ngồi ăn (có muỗng) vài giây; NPC có việc để làm: ghé sạp gọi món, vào quán cơm/chợ/bưu cục rồi đi ra, đi dạo theo đường.
**Chưa:** xe máy trên đường, dừng đèn đỏ, người bán dạo; người chơi vào quán cơm Cô Tư ngồi ăn như khách.
**Kiểm chứng:** e2e server `xom.e2e-spec.ts` (sạp theo giờ); Playwright `an-sang.spec.ts`.

**Thứ tự làm (mỗi bước deploy):** B8 ngày/đêm + đèn → B7 góc nhìn → B6 map rộng + đường xá → B9 sạp theo giờ → B10 cảnh sinh hoạt & làm khách.

---

## C. Kịch bản người mới (Chú Bảy)

### UC-C1 · Gặp Chú Bảy, chọn hướng đi ✅
**Luồng:** vào xóm lần đầu → Chú Bảy bắt chuyện (3 câu, bấm *Tiếp*) → chọn "Con muốn buôn bán" hoặc "Con đi làm thuê trước".
**Luật:** mọi bảng đang mở tự đóng khi NPC bắt chuyện; tiến độ lưu server, tải lại trang vẫn tiếp tục đúng bước.
**Kiểm chứng:** `nguoi-moi-buon-ban.spec.ts`, `nguoi-moi-lam-thue.spec.ts`.

### UC-C2 · Nhánh buôn bán ✅
Vựa xe Ông Sáu mua xe → chợ Bà Năm nhập hàng → chọn chỗ (gợi ý Đầu hẻm 12) → đẩy xe tới, mở quầy → phục vụ 3 khách → Chú Bảy dặn dò.
**Đời thật:** tiêu hết tiền vào xe và hàng, không còn tiền thuê chỗ → cảnh báo trước khi nhập ("không đủ tiền thuê chỗ hôm nay!"); gợi ý chỗ rẻ hoặc đi làm thuê.

### UC-C3 · Nhánh làm thuê ✅
Quán cơm Cô Tư xin việc → làm 2 việc vặt → Chú Bảy gợi ý tích vốn mua xe.

### UC-C4 · Người mới lạc hướng ⏳
**Đời thật:** bỏ dở nhiệm vụ đi dạo lung tung; quên mình đang làm gì.
**Luật:** dòng nhiệm vụ luôn hiện; sau 3 phút không tiến triển Chú Bảy chạy xe ngang nhắc một câu; có nút "Bỏ qua hướng dẫn" trong menu.

---

## D. Giao tiếp & trò chuyện

### UC-D1 · Lời thoại hiện trên đầu nhân vật ✅
**Ai:** mọi NPC và người chơi.
**Luồng:** NPC nói → **khung thoại hiện trên đầu** người nói (kiểu game), đuôi khung chỉ vào nhân vật; người chơi bấm vào khung/nút *Tiếp* để sang câu. Lựa chọn trả lời hiện ở dưới (vùng ngón cái); chọn xong câu trả lời hiện trên đầu nhân vật mình.
**Đời thật:** hai người nói cùng lúc · người nói đi khuất màn hình.
**Luật:** mỗi nhân vật tối đa 1 khung; khung tự ẩn sau 4 giây nếu không cần bấm; người nói ngoài màn hình thì khung ghim ở mép màn hình kèm mũi tên chỉ hướng.
**Kiểm chứng:** Playwright: khung thoại của Chú Bảy nằm phía trên nhân vật (toạ độ khung < toạ độ đầu nhân vật trên màn hình).

**Kiểm chứng (đã chạy):** `apps/web/e2e/*` — khung thoại Chú Bảy/Bà Năm nằm trên đầu nhân vật (`[data-bubble]`).
### UC-D2 · Nói chuyện với NPC ✅
**Luồng:** tới gần NPC → nút "💬 Nói chuyện" → chọn chủ đề: *Chào hỏi* · *Hỏi giá hôm nay* · *Hỏi chuyện xóm* (tin đồn: "nghe nói mai mưa", "trường tan sớm") · *Nhờ giúp* (theo nhiệm vụ).
**Luật:** mỗi NPC có **độ thân thiết** 0–100: chào hỏi mỗi ngày +2, mua hàng +1/lần. Thân thiết ≥ 30: Bà Năm bớt 5% giá nhập; ≥ 60: báo trước giá ngày mai.
**Kiểm chứng:** e2e server: thân thiết tăng sau chào hỏi, không tăng 2 lần trong một ngày.

**Kiểm chứng (đã chạy):** `apps/server/test/game.e2e-spec.ts` (thân thiết +1/lần mua, +2 chào/ngày, không cộng 2 lần); Playwright "Hỏi chuyện xóm".
### UC-D3 · Câu nói nhanh & biểu cảm của người chơi ✅
**Luồng:** nút 💬 góc phải → chọn câu có sẵn ("Mời ghé ủng hộ!", "Bánh mì nóng giòn đây!", "Cảm ơn nha", "Xin lỗi, hết hàng rồi") hoặc biểu cảm (👋 😄 🙏 😢) → hiện trên đầu nhân vật.
**Luật:** câu **rao hàng** khi đang đứng ở quầy mở: kéo thêm khách trong 1 giờ game (+10%, hồi chiêu 30 phút game).
**Kiểm chứng:** Playwright: bấm câu rao → khung thoại trên đầu nhân vật; server: hệ số khách tăng trong thời gian hiệu lực.

**Kiểm chứng (đã chạy):** e2e server (rao hàng → thông báo, hồi chiêu); Playwright (câu rao hiện trên đầu).
### UC-D4 · Chat với người chơi khác ⏳ (Phase 2)
Gõ chữ (tối đa 80 ký tự) hoặc câu nhanh; hiện trên đầu. Lọc từ ngữ thô tục; bấm vào người chơi → *Chặn* / *Báo cáo*. Người bị chặn không thấy tin nhắn của mình.

### UC-D5 · Âm thanh: nhạc nền, tiếng thao tác, giọng nói ✅ (bản đầu)
Tổng hợp bằng WebAudio (không file, không lo bản quyền): **nhạc nền** ngũ cung kiểu đàn tranh (ngày tươi, đêm chậm/dịu);
**hiệu ứng**: bấm nút "tách", tiền vào "ting", múc cơm, đặt dĩa, chuông, lỗi "è"; **giọng nói** lầm bầm theo âm tiết mỗi khi ai đó nói
(mỗi người một cao độ; khách bực/cãi nhau thì gắt, nhanh — kèm câu càu nhàu "Làm ăn kiểu gì chậm như rùa vậy!", "Muốn gây hả?").
Cài đặt ⚙️: thanh âm lượng nhạc / hiệu ứng / giọng, nút tắt tiếng (nhớ trên máy). Âm thanh chỉ bật sau cú chạm đầu tiên (luật trình duyệt).
**Chưa:** đọc chữ thật (TTS tiếng Việt), âm thanh môi trường (xe cộ, chợ ồn).

---

## E. Mua sắm (người chơi là khách)

### UC-E1 · Đi chợ mua nguyên liệu ✅
**Ai:** chủ quầy · **Nơi:** chợ đầu mối Bà Năm.
**Luồng:** tới chợ → "🧺 Vào chợ" → thấy **từng nguyên liệu** (không phải món làm sẵn): bánh mì phôi, pa-tê, thịt nguội, xíu mại, trứng, dưa leo, đồ chua, hành ngò, ớt, nước sốt… → chọn số lượng (theo gói: "Bánh mì phôi · 10 ổ") → trả tiền → hàng vào kho của quầy.
**Đời thật & rẽ nhánh:**
- Giá mỗi ngày một khác; sau mưa rau tăng giá.
- **Chợ họp sáng**: trước 12:00 giá gốc; buổi chiều hàng tươi còn ít, đắt hơn 20% ("hàng chiều").
- Mua sỉ (≥ 5 gói) giảm 5%.
- **Mặc cả** (UC-E2).
- Nguyên liệu còn trong kho gần hết hạn → hiện nhãn "sắp hỏng" để dùng trước.
**Luật:** mỗi nguyên liệu có hạn dùng (bánh mì 1 ngày, rau 1 ngày, pa-tê 3 ngày, trân châu 1 ngày, trà khô không hỏng); xuất kho lô cũ trước.
**Kiểm chứng:** e2e server: mua gói → kho tăng đúng số phần; sau 12:00 hàng tươi đắt hơn 20%.

**Kiểm chứng (đã chạy):** e2e server (mua theo gói, thiếu tiền, mặt hàng không tồn tại); unit `recipe.test.ts` (hàng chiều đắt hơn); Playwright mua 10 nguyên liệu.
### UC-E2 · Mặc cả với Bà Năm ⏳
**Luồng:** trong chợ bấm "🤝 Bớt chút đi bà" trước khi trả tiền → Bà Năm trả lời theo độ thân thiết: bớt 5–10% / "Giá này rẻ rồi con" / hơi phật ý (thân thiết −1) nếu mặc cả liên tục trong ngày.
**Luật:** mỗi ngày 1 lần mặc cả có tác dụng; xác suất thành công theo thân thiết.

### UC-E3 · Mua / bán lại xe hàng ✅ · Sửa xe hàng ⏳
**Đời thật:** xe cũ dùng lâu hư bánh, hư khóa tủ kính.
**Luật:** xe hàng có **độ bền** giảm dần theo ngày bán; dưới 30% thì chậm (mỗi món làm lâu hơn); mang tới vựa Ông Sáu sửa (tốn tiền) hoặc tự sửa ở tiệm sửa xe (UC-G).

### UC-E4 · Đi ăn, đi uống ở quầy người khác ⏳
**Ai:** người chơi làm khách.
**Luồng:** tới quầy đang mở (NPC hoặc người chơi khác) → "🛎 Gọi món" → chọn món + yêu cầu (không hành, ít đá…) → đứng chờ → nhận món → trả tiền (có thể boa).
**Đời thật:** chủ quầy làm sai món → mình được *đổi món* hoặc *đòi lại tiền* · chờ lâu → được bỏ đi không trả tiền · món ngon → *khen* (tăng uy tín quầy đó).
**Luật:** ăn uống có tác dụng nhẹ: làm việc nhanh hơn 10% trong 2 giờ game (không bắt buộc, không có thanh "đói" ép chơi).

---

## F. Buôn bán món ăn — tự tay làm

> Thay đổi cốt lõi so với Phase 1: **không còn tự động bán theo nhịp**. Server chỉ quyết định *bao nhiêu khách tới* và *họ muốn gì*; tiền chỉ vào khi người chơi (hoặc nhân viên) **làm đúng món và giao tận tay**.

### UC-F1 · Chuẩn bị quầy ✅
**Luồng:** đẩy xe tới chỗ đã thuê → mở quầy (trả tiền chỗ) → quầy hiện nguyên liệu đang có.
**Đời thật:** quên mua nguyên liệu → quầy mở nhưng món nào thiếu nguyên liệu bị gạch trong thực đơn · xe hư → làm chậm.

### UC-F2 · Thực đơn & giá ✅
**Luồng:** bảng Kinh doanh → *Thực đơn*: bật/tắt từng món ("Bánh mì thịt", "Bánh mì xíu mại", "Bánh mì trứng"), đặt giá từng món; món thêm (thêm trứng +5.000đ, thêm pa-tê +3.000đ).
**Luật:** món chỉ bán được khi đủ nguyên liệu; giá hợp lý theo giá tham chiếu của món; tắt hết món = không có khách.

**Kiểm chứng (đã chạy):** e2e server (tắt hết món bị chặn, đổi giá); khách chỉ gọi món đủ nguyên liệu.
### UC-F3 · Khách tới, xếp hàng ✅
> Góp ý chơi thử (10/2026): chủ quầy **bắt tay làm món** cho khách nào (mở màn làm món) thì khách đó chờ thêm ít nhất 45 giây (một lần) —
> ngoài đời thấy người ta đang làm cho mình thì không bỏ đi giữa chừng. (khách quen, gọi nhiều phần: ⏳)
**Luồng:** khách NPC đi tới trước quầy → khung thoại trên đầu nói yêu cầu **cụ thể**: *"Cho con ổ xíu mại, không hành, nhiều ớt nha!"* → xếp vào hàng chờ (thấy số thứ tự trên đầu).
**Đời thật & rẽ nhánh:**
- Mỗi khách có **kiên nhẫn** (thanh trên đầu, 30–60 giây thật tuỳ kiểu khách: học sinh vội, cô chú thong thả).
- Hàng chờ > 4 người → khách mới thấy đông, bỏ đi (tính là "khách hụt" nhưng ít trừ uy tín).
- Khách gọi món đã hết nguyên liệu → người chơi chọn *"Xin lỗi, hết rồi"* (khách buồn, uy tín −nhẹ) hoặc *gợi ý món khác* (khách 60% đồng ý).
- Khách quen (đã mua ≥ 3 lần, hài lòng) đứng chào tên quầy, kiên nhẫn hơn, boa nhiều hơn.
- Khách gọi 2–3 phần cho cả nhà → mỗi phần yêu cầu riêng.
**Luật:** số khách tới theo mô hình nhu cầu (chỗ bán, giờ, giá, uy tín, thời tiết, đối thủ); **không có chủ ở quầy (và không có nhân viên) thì không có khách dừng lại**.

**Kiểm chứng (đã chạy):** e2e server (khách chỉ gọi món làm được; vắng chủ không có khách); unit (khách không xin thêm thứ quầy không có).
### UC-F4 · Làm bánh mì theo đơn ✅ (khách đổi ý giữa chừng: ⏳)
**Ai:** chủ quầy hoặc nhân viên đứng quầy · **Khi nào:** chạm vào khách đang chờ (hoặc nút "👨‍🍳 Làm món").
**Luồng (màn hình làm món, thao tác từng bước):**
1. **Lấy bánh** — chạm ổ bánh mì (trừ 1 ổ khi giao).
2. **Xẻ bánh** — vuốt dọc ổ bánh.
3. **Phết** — pa-tê / bơ (chạm để thêm, chạm lại để bỏ).
4. **Nhân** — thịt nguội / xíu mại / trứng ốp la / chả lụa (theo yêu cầu).
5. **Rau** — dưa leo, đồ chua, hành, ngò (bỏ đúng thứ khách dặn "không").
6. **Gia vị** — ớt (ít / vừa / nhiều), nước sốt.
7. **Gói giấy** → **Đưa khách** (UC-F7 tính tiền).
Thanh trên cùng luôn hiện yêu cầu của khách để đối chiếu.
**Đời thật & rẽ nhánh:**
- **Làm sai** (khách dặn không hành mà có hành): khách phàn nàn trên khung thoại → chọn *Làm lại* (tốn thêm nguyên liệu) hoặc *Giảm giá 50%* hoặc *Kệ* (uy tín −, khách không quay lại).
- Đang làm thì **hết nguyên liệu** bước giữa chừng → nút bước đó mờ đi, gợi ý "Xin lỗi khách, đổi món".
- Làm **nhanh và đúng** → khách khen, boa; chậm (thanh kiên nhẫn đỏ) → khách than, không boa.
- Đang làm món mà khách khác tới → vẫn xếp hàng, không mất món đang làm.
- Bỏ dở giữa chừng (đóng màn hình) → không trừ nguyên liệu.
**Luật:** chấm điểm món = đúng từng bước so với đơn (0–100%); nguyên liệu trừ theo đúng thứ đã cho vào món; server kiểm tra lại toàn bộ (client chỉ gửi danh sách thao tác).
**Kiểm chứng:** unit test chấm điểm món; e2e server: giao món thiếu nguyên liệu bị từ chối, món sai bị trừ uy tín; Playwright: làm đúng 1 ổ theo đơn "không hành, nhiều ớt".

**Kiểm chứng (đã chạy):** unit chấm món; e2e server (thiếu nguyên liệu bị từ chối, làm sai phải làm lại/giảm giá); Playwright làm đúng 3 món + làm sai 1 món trên iPhone 16 Pro & Pixel 7.
### UC-F5 · Pha trà sữa theo đơn ✅
> Góp ý chơi thử (10/2026): mức đường ghi bằng chữ như khách nói — *Không đường · 0%, Ít đường · 30%, Nửa đường · 50%, Bình thường · 70%, Ngọt nhiều · 100%*.
> (UI chung với bánh mì; chưa có kịch bản Playwright riêng)
**Luồng:** chọn **ly** (M/L) → **trà nền** (trà sữa truyền thống / trà xanh / hồng trà) → **đường** (0 / 30 / 50 / 70 / 100%) → **đá** (không / ít / bình thường) → **topping** (trân châu đen, trân châu trắng, thạch, pudding — có thể nhiều) → **lắc** (giữ nút 1 giây) → **dán nắp** → đưa khách.
**Đời thật:** "ít ngọt, nhiều đá, thêm pudding" · hết đá khi mất điện (UC-K4) · khách đổi ý sau khi gọi ("thôi cho ít đường") — khung thoại cập nhật, món đang pha phải chỉnh theo.
**Luật:** topping tính thêm tiền theo bảng giá của quầy; sai mức đường/đá là lỗi nhẹ (trừ ít điểm), sai topping là lỗi nặng.

### UC-F6 · Bán phụ kiện ✅ cơ bản (trả giá, khách xem chơi: ⏳)
**Luồng:** khách hỏi *"Có kẹp tóc màu hồng hông?"* → tìm đúng món trên sạp (lưới 3×3 món có màu/kiểu) → hỏi *gói quà không?* (khách mua tặng thì có) → gói → tính tiền.
**Đời thật:** khách chỉ xem không mua (30% khách "xem chơi") · khách trả giá ("bớt 5 ngàn đi") → *Đồng ý* / *Bớt 2 ngàn* / *Giữ giá* (khách có thể bỏ đi).
**Luật:** phụ kiện không hỏng; trưng bày đủ màu thì bán được nhiều khách hơn.

### UC-F7 · Tính tiền & thối tiền ✅ (két tiền lẻ, "cho nợ": ⏳)
**Luồng:** giao món → khách đưa tiền (tờ 20k / 50k / 100k / 200k, hoặc *chuyển khoản QR*) → màn hình thối: bấm các tờ tiền (1k, 2k, 5k, 10k, 20k, 50k) để ghép tiền thối → *Đưa tiền thối*.
**Đời thật & rẽ nhánh:**
- **Thối thiếu** → khách đếm lại, đòi đủ (uy tín −, không lời thêm được đồng nào).
- **Thối dư** → khách thật thà trả lại (40%) hoặc lặng lẽ cầm luôn (mình mất phần dư).
- Khách trả **đúng tiền** hoặc **chuyển khoản** → không cần thối.
- Hết tiền lẻ trong két → phải thối bằng tờ to hơn hoặc xin khách chuyển khoản / "cho nợ 2 ngàn".
**Luật:** két tiền lẻ là kho riêng (đổi tiền lẻ ở chợ); tỉ lệ khách chuyển khoản tăng theo khách văn phòng.
**Kiểm chứng:** unit test tính tiền thối; e2e: thối thiếu bị ép bù, thối dư bị mất tiền.

**Kiểm chứng (đã chạy):** unit thối đúng/thiếu/dư; e2e server thối thiếu bị đòi đủ; Playwright ghép tờ tiền thối.
### UC-F8 · Khách quỵt / hiểu lầm ⏳
**Đời thật:** hiếm khi khách ăn xong đi luôn (1/200 đơn), hoặc khách nói đã đưa 100k nhưng thật ra đưa 50k.
**Luật:** chủ quầy có thể *Gọi lại* (60% khách quay lại trả) hoặc *Bỏ qua*; tiền thật khách đưa luôn hiện trên màn hình tính tiền nên hiểu lầm có thể giải thích ("Dạ con nhận 50 ngàn ạ") → khách xin lỗi.

### UC-F9 · Đóng quầy & cuối ngày ✅ (cần cập nhật theo nguyên liệu)
Dọn quầy → tổng kết: doanh thu, tiền boa, nguyên liệu đã dùng / hỏng, khách hụt, món sai, uy tín.
**Đời thật:** bán đồ để qua đêm (nếu cố giữ) → xác suất khách **đau bụng** → uy tín giảm mạnh + có thể bị kiểm tra vệ sinh (UC-K5). Game mặc định tự bỏ đồ hỏng; người chơi không thể bán nguyên liệu quá hạn.

### UC-F10 · Nhận đơn đặt trước ⏳
**Đời thật:** "Mai đám giỗ, đặt giùm cô 30 ổ bánh mì lúc 10 giờ."
**Luật:** NPC gửi đơn đặt (số lượng, giờ lấy, cọc 30%) → nhận hoặc từ chối → tới giờ phải có đủ món làm sẵn → khách trả phần còn lại; trễ hoặc thiếu → mất cọc, uy tín −.

---

## G. Dịch vụ sửa xe (nghề mới, template SERVICE)

### UC-G1 · Mở tiệm sửa xe ⏳
**Luồng:** vựa xe Ông Sáu bán *Bộ đồ nghề sửa xe* (bơm, mỏ lết, ruột xe mẫu) → thuê chỗ (tiệm sửa xe thường ở đầu hẻm, gần ngã tư) → mua **phụ tùng** ở *Tiệm phụ tùng Chú Chín* (ruột xe, bugi, xích, bóng đèn, má phanh).
**Luật:** không có món ăn hỏng; phụ tùng không hỏng nhưng vốn lớn.

### UC-G2 · Khách dắt xe tới 🚧 (thiết kế)
**Luồng:** khách dắt xe máy tới, khung thoại kể **triệu chứng**, không nói bệnh: *"Xe chú đạp hoài không nổ"*, *"Đi nghe cạch cạch ở bánh sau"*, *"Bánh trước xẹp lép"*.
**Đời thật:** một triệu chứng có thể do nhiều bệnh (không nổ: bugi / hết xăng / bình yếu).

### UC-G3 · Chẩn đoán ⏳
**Luồng:** màn hình xe máy với các bộ phận chạm được: *lốp trước / lốp sau / bugi / xích / bình / đèn / phanh* → chọn **thao tác kiểm tra** (nhìn, bóp thử, nhúng nước tìm lỗ thủng, thử đề) → mỗi lần kiểm tra tốn thời gian và hiện kết quả ("Lốp sau: có lỗ thủng nhỏ").
**Luật:** kiểm tra đúng chỗ nhanh → khách tin tưởng; kiểm tra lung tung quá lâu → khách sốt ruột.

### UC-G4 · Báo giá & sửa ⏳
**Luồng:** báo giá (tiền công + phụ tùng) → khách *đồng ý* / *chê đắt* (trả giá) / *thôi để đi chỗ khác* → sửa theo quy trình (ví dụ vá ruột: tháo bánh → lấy ruột → chà nhám → dán miếng vá → bơm → lắp lại) → khách chạy thử → trả tiền.
**Đời thật & rẽ nhánh:**
- Sửa sai bệnh → khách chạy thử vẫn hư → phải sửa tiếp miễn phí hoặc trả tiền lại.
- **Bảo hành**: sửa ẩu → 1–2 ngày sau khách quay lại bắt đền.
- Thay phụ tùng không cần thiết để lấy thêm tiền → xác suất khách phát hiện (người quen chỉ) → uy tín −−.
- Khách xin **khất nợ** ("mai chú gửi") → *Cho khất* (80% khách trả đúng hẹn) / *Không*.

---

## H. Làm thuê & tuyển dụng

### UC-H1 · Làm thuê cho NPC ✅ (nâng cấp thành thao tác thật: xem nhóm W)
Quán cơm Cô Tư (phụ quán), Bưu cục Anh Tám (giao hàng). Lương theo giờ; việc vặt có thưởng; rời chỗ làm = nghỉ.
**Cần nâng cấp (🚧):** việc vặt thành thao tác thật —
- *Bưng cơm*: màn hình 4 bàn, khay có 2 dĩa → đưa đúng dĩa đúng bàn theo phiếu gọi món.
- *Giao hàng*: nhận gói hàng → đi bộ/chạy tới địa chỉ trên bản đồ (mũi tên chỉ) → giao tận tay NPC nhận → quay lại.

### UC-H2 · Chủ quầy đăng tin tuyển dụng ⏳
**Ai:** chủ quầy (người chơi) · **Nơi:** bảng Kinh doanh → *Tuyển người*.
**Luồng:** tạo tin:
- **Vị trí**: phụ bán (làm món, tính tiền) · giao hàng · phụ sửa xe.
- **Ca làm**: sáng (6–11) / trưa (11–14) / chiều (14–18) / tối (18–22) / cả ngày.
- **Lương/giờ** (không thấp hơn *lương tối thiểu của xóm* = 10.000đ/giờ).
- **Đãi ngộ**: bao cơm trưa · chia tiền boa (0/50/100%) · thưởng doanh số (x% doanh thu ca) · thưởng chuyên cần cuối tuần.
- **Số người cần**, **yêu cầu** (uy tín tối thiểu, đã làm ≥ N ca).
→ **Ký quỹ** lương 1 ca cho mỗi người cần tuyển (giữ trong sổ cái, rút lại khi gỡ tin).
**Đời thật & rẽ nhánh:**
- Đăng lương cao để câu người rồi không trả → **không thể**: lương được ký quỹ trước, trả tự động.
- Chủ hết tiền giữa tuần → không ký quỹ được ca mới → tin tự tạm ẩn, nhân viên hiện tại được báo "chủ chưa ký quỹ ca mai".
- Tin đăng lâu không ai nhận → gợi ý tăng lương hoặc thêm đãi ngộ; sau 1 ngày game **NPC ứng tuyển** (UC-H9).
**Luật:** tối đa 3 tin/quầy; tin hiển thị trên *Bảng tin tuyển dụng* của xóm (UC-H3).

### UC-H3 · Tìm việc trên bảng tin ⏳
**Ai:** người mới / người đang cần tiền · **Nơi:** *Bảng tin xóm* (cột thông báo cạnh nhà văn hoá) hoặc hỏi Chú Bảy.
**Luồng:** tới bảng tin → danh sách tin (NPC + người chơi) → lọc theo lương, ca, khoảng cách, đãi ngộ → xem chi tiết (đánh giá của chủ từ nhân viên cũ, uy tín quầy) → *Ứng tuyển*.
**Đời thật:** tin lương cao nhưng chủ bị đánh giá "hay trả trễ" · tin gần nhà lương thấp.

### UC-H4 · Ứng tuyển & duyệt ⏳
**Luồng:** ứng viên gửi đơn (kèm lời nhắn ngắn, hồ sơ: số ca đã làm, đánh giá) → chủ nhận thông báo → *Nhận* / *Từ chối* / *Hẹn nói chuyện* (chat) → nhận thì hai bên thấy lịch ca.
**Đời thật:** chủ không trả lời → đơn tự hết hạn sau 1 ngày game · nhiều người cùng ứng tuyển 1 chỗ → ai được nhận trước thì tin giảm số lượng · ứng viên rút đơn.
**Luật:** NPC chủ tiệm tự duyệt theo uy tín ứng viên (người mới luôn được nhận ở NPC có tin "không cần kinh nghiệm").

### UC-H5 · Đi làm theo ca ⏳
**Luồng:** tới giờ ca → nhắc "Sắp tới ca ở quầy Bánh mì Tuấn" → tới quầy → *Vào ca* (chấm công) → làm việc thật (làm món, tính tiền như chủ) → hết ca *Ra ca*.
**Đời thật & rẽ nhánh:**
- **Đi trễ** > 15 phút game → trừ lương giờ đầu; trễ 3 lần → chủ được cảnh báo.
- **Vắng không báo** → chủ được hoàn ký quỹ ca đó, nhân viên bị đánh giá "vắng" tự động.
- **Xin nghỉ trước** (báo ≥ 2 giờ game) → không bị phạt.
- Chủ và nhân viên cùng đứng quầy → phục vụ **song song** 2 khách.
- Chủ đi nhập hàng, nhân viên giữ quầy → quầy **vẫn bán** (có người).
- Nhân viên làm sai món → tiền bồi thường/uy tín trừ vào quầy của chủ (như đời thật); chủ thấy thống kê "món sai theo nhân viên".
**Luật:** quầy có nhân viên trong ca = quầy "có người"; doanh thu vào ví chủ; tiền boa chia theo đãi ngộ đã đăng.

### UC-H6 · Trả lương & đãi ngộ ⏳
**Luật:** lương trả **mỗi giờ game** từ quỹ ký quỹ; bao cơm = nhân viên nhận hiệu ứng "đã ăn" lúc 12:00; thưởng doanh số cộng khi ra ca; thưởng chuyên cần khi đủ 5 ca/tuần. Mọi khoản đi qua sổ cái, hiện trong *Phiếu lương* của nhân viên.

### UC-H7 · Nghỉ việc / sa thải ⏳
**Đời thật:** nhân viên tìm được chỗ lương cao hơn · chủ muốn đổi người · hai bên cãi nhau.
**Luật:** nghỉ việc/sa thải có hiệu lực **sau ca hiện tại** (không bỏ ngang giữa ca); ký quỹ còn lại hoàn cho chủ; hai bên được đánh giá nhau (UC-H8).

### UC-H8 · Đánh giá hai chiều ⏳
Chủ đánh giá nhân viên (đúng giờ, làm đúng món, thái độ); nhân viên đánh giá chủ (trả lương đúng hạn — tự động ghi nhận, môi trường, đãi ngộ đúng như tin đăng). Điểm trung bình hiện trên hồ sơ và tin tuyển dụng.

### UC-H9 · NPC lấp chỗ trống ⏳
**Khi xóm ít người chơi:**
- **NPC nhân viên**: tin tuyển dụng của người chơi không ai nhận sau 1 ngày game → NPC ứng tuyển (tên, tính cách: *siêng* — nhanh, đúng; *lanh lợi* — nhanh, hay sai vặt; *chậm mà chắc*; *hay đi trễ*). Lương NPC đòi theo mặt bằng tin trên bảng.
- **NPC chủ tiệm**: bảng tin luôn có ít nhất 2 tin của NPC (quán cơm Cô Tư, bưu cục, tiệm sửa xe Chú Chín…) để người mới không bao giờ hết việc.
- NPC nhân viên **tự làm món** ở quầy người chơi với tốc độ/độ chính xác theo tính cách → chủ có thể đi nhập hàng, mở quầy thứ hai.
**Luật:** NPC không bao giờ chiếm chỗ của người chơi: khi có người chơi ứng tuyển cùng tin, người chơi được ưu tiên hiển thị; chủ vẫn quyết định.

---

## W. Vào làm — không gian riêng & thao tác như đời thật

> Mỗi nơi làm việc là **một cảnh riêng** (camera ngang tầm mắt, sau quầy), không phải bản đồ nhìn từ trên.
> Bước vào cửa → cảnh bản đồ tắt, cảnh bên trong bật; bước ra → quay lại phố.
> Thu nhập làm thuê = **lương cứng theo giờ khi có làm** + **tiền theo từng việc** (+ thưởng/boa). Đứng không = không có tiền.

### UC-W1 · Vào/ra một nơi làm việc ✅
**Hướng dẫn vào ca:** lần đầu làm một vai, người chủ (Cô Tư / Anh Tám) chỉ việc từng bước (5 bước, nội dung trong `content.jobs[].roles[].guide`);
nút "❓ Cách làm" mở lại bất cứ lúc nào; Cài đặt → "Xem lại hướng dẫn vào làm" để được chỉ lại từ đầu.
**Luồng:** tới cửa quán → "🍚 Vào quán · Cô Tư" → màn hình chuyển vào trong (1 giây) → chọn **vai** (đứng quầy / thu ngân / bưng bê) → *Vào ca*.
Ra ca: nút "🚪 Ra ca" → phiếu lương ca (số việc, lỗi, lương cứng, tiền việc, thưởng, khấu trừ) → quay ra phố.
**Đời thật & rẽ nhánh:**
- Chưa ra ca mà bỏ đi (tắt app, đi ra ngoài) → coi như **bỏ ca**: vẫn nhận tiền đã làm, mất thưởng chuyên cần, chủ nhớ ("bữa trước bỏ ngang").
- Mất mạng giữa ca → có 30 giây vào lại; quá thì hết ca.
- Mỗi lúc chỉ làm một vai; đổi vai phải ra ca.
**Luật:** chỉ vào ca khi quầy riêng đang đóng; mỗi giờ game có ≥ 1 việc hoàn thành thì mới tính lương cứng giờ đó.
**Đã làm:** vào/ra, chọn vai, ra ca → phiếu lương, hết ngày tự ra ca, rời xóm = bỏ ca. **Chưa:** 30 giây vào lại khi mất mạng, chủ nhớ "bỏ ngang".
**Kiểm chứng:** Playwright `nguoi-moi-lam-thue.spec.ts` (vào quán, chọn vai, ra ca có phiếu lương).

### UC-W2 · Quán cơm Cô Tư — đứng quầy múc cơm ✅
> Góp ý chơi thử (10/2026): khay còn ít mà khách gọi nhiều phần → vẫn múc được phần còn lại và có nút **🔔 Không đủ · báo bếp**;
> khay hết giữa chừng (đã múc dở) cũng hiện nút báo bếp — không còn bị kẹt.
**Không gian:** quầy inox dài; các khay/nồi: cơm, sườn nướng, bì, chả trứng, trứng ốp la, dưa leo–cà chua, canh; chồng dĩa; khách xếp hàng phía trước quầy.
**Luồng một dĩa:**
1. Khách tới đọc món (khung thoại + phiếu gọi món): *"Cơm sườn bì chả, thêm trứng, không dưa nha con"*.
2. **Lấy dĩa** (chạm chồng dĩa → dĩa xuất hiện trên quầy).
3. **Múc/gắp** từng món: chạm khay → một vá/một miếng rơi lên dĩa (thấy trên dĩa 3D). "Thêm cơm" = múc cơm 2 lần.
4. **Đưa dĩa** cho khách (chạm khách / nút "Đưa dĩa").
**Đời thật & rẽ nhánh:**
- Gắp nhầm → nút *Đổ bỏ làm lại* (tốn món, trừ vào tiền việc); đưa sai → khách trả lại, Cô Tư nhắc.
- **Khay hết món** (sườn còn 0) → bấm *"Báo bếp"* → 20 giây sau bếp mang khay mới; khách đang chờ món đó có thể đổi món hoặc đợi.
- Giờ cao điểm (11–13h, 17–19h) khách xếp hàng dài; khách chờ quá lâu thì bỏ đi → Cô Tư phàn nàn.
- Khách quen gọi "như mọi khi" → phiếu hiện món khách quen (khách quen có tên).
**Luật:** tiền việc mỗi dĩa đúng; dĩa sai trừ; 3 lỗi/giờ → Cô Tư nhắc; 6 lỗi hoặc 5 khách bỏ đi trong ca → *"Thôi hôm nay con về nghỉ đi"* (hết ca, vẫn nhận tiền đã làm).
**Đã làm:** lấy dĩa, múc từng khay (thấy trên dĩa 3D), đổ bỏ, báo bếp khi hết khay, khách xếp hàng có khung thoại, khách bỏ về, bị cho nghỉ khi quá lỗi. **Chưa:** khách quen "như mọi khi".
**Kiểm chứng:** e2e server `work.e2e-spec.ts` (đứng quầy, bị cho nghỉ); Playwright múc đủ món theo phiếu (iPhone 16 Pro + Pixel 7).

### UC-W3 · Quán cơm — thu ngân ✅
> Góp ý chơi thử (10/2026): bàn thối tiền luôn hiện **🧾 Tổng tiền món** và **💵 Khách đưa** — không bắt người chơi tự nhớ.
**Không gian:** quầy tính tiền có máy tính tiền, bảng giá, ngăn kéo tiền.
**Luồng:** khách ăn xong tới quầy, đưa phiếu → **bấm từng món trên máy tính tiền** (cơm sườn 35k, thêm trứng 6k, trà đá 3k…) → máy hiện tổng → *Báo giá* cho khách → khách trả (chuyển khoản / tiền mặt) → **thối tiền** từ ngăn kéo (như UC-F7) → *Xong*.
**Đời thật & rẽ nhánh:**
- Bấm thiếu/dư món → báo giá sai: khách phát hiện tính dư (phàn nàn, sửa lại), tính thiếu thì quán mất tiền.
- Khách xin *ghi sổ* (khách quen, Cô Tư cho phép tối đa 1 lần/ngày).
- **Cuối ca kiểm két:** tiền trong ngăn kéo phải khớp doanh thu; lệch thì **trừ vào lương** (thiếu) hoặc nộp dư cho chủ.
**Luật:** tiền việc mỗi lượt đúng; thối sai tiền → lệch két.
**Đã làm:** máy tính tiền bấm từng món, báo giá, tính dư → khách bắt sửa, tính thiếu/thối thiếu → lệch két trừ lương cuối ca. **Chưa:** ghi sổ.
**Kiểm chứng:** e2e server (thiếu két bị trừ); Playwright bấm máy theo phiếu → thu/thối tiền.

### UC-W4 · Quán cơm — bưng bê ✅
**Không gian:** 6 bàn đánh số, cửa bếp ra món.
**Luồng:** bếp đặt dĩa ra (dĩa có kẹp phiếu số bàn) → **chạm dĩa để bưng** (tối đa 2 dĩa) → **chạm đúng bàn** để đặt → bàn đã ăn xong → *Dọn bàn* (chạm chén dĩa bẩn → mang vào bếp).
**Đời thật:** bưng nhầm bàn → khách bàn đó bảo "không phải của con", phải mang đúng; để dĩa nguội lâu → khách chê; bàn bẩn khách mới không ngồi.
**Luật:** tiền việc mỗi dĩa đúng bàn + mỗi lần dọn bàn.
**Đã làm:** cửa bếp ra dĩa kẹp số bàn, đặt đúng/nhầm bàn, khách ngồi ăn rồi bàn bẩn, dọn bàn (nửa tiền việc). Hiện cầm 1 dĩa mỗi lần.
**Kiểm chứng:** e2e server (bưng bê); Playwright đặt đúng bàn.

### UC-W5 · Bưu cục Anh Tám — giao hàng tận nơi ✅
**Không gian:** bưu cục có **kệ hàng** (thùng/gói dán mã), quầy nhận, xe máy ở cửa.
**Luồng một chuyến:**
1. **Nhận đơn:** Anh Tám đưa *phiếu giao* (mã đơn XM-4821, người nhận, địa chỉ "Nhà số 7 đầu hẻm", ghi chú "dễ vỡ", COD 85.000đ).
2. **Soạn hàng:** tìm trên kệ gói đúng mã (các gói nhìn giống nhau, phải đọc mã) → chạm để lấy → *Quét mã* xác nhận.
3. **Ra xe, đi giao:** quay ra phố; bản đồ có **ghim địa chỉ** + mũi tên; nhân vật chạy xe (nhanh hơn đi bộ). Chọn *Chạy nhanh* / *Chạy chậm*: hàng *dễ vỡ* mà chạy nhanh → có thể móp (khách từ chối nhận).
4. **Tới nơi:** chạm *"🔔 Gọi khách"* → người nhận ra cửa (khung thoại). 
5. **Giao & ký nhận:** đưa hàng → khách kiểm hàng → *Đưa điện thoại ký nhận* → người nhận ký (thấy nét ký hiện dần) → người chơi **kiểm tên người ký** so với phiếu: đúng người / người nhà nhận hộ (chọn quan hệ: vợ, chồng, con, hàng xóm) / *không phải người nhận* (không được giao) → *Xác nhận đã giao*.
6. **Thu COD:** khách trả tiền mặt/chuyển khoản → thối tiền nếu cần.
7. **Về nộp tiền:** quay lại bưu cục, *Nộp tiền COD* → khớp thì nhận tiền chuyến + thưởng.
**Đời thật & rẽ nhánh:**
- **Khách vắng nhà** (15%): gọi không ai nghe → *Gửi hàng xóm* (người nhận đồng ý qua tin nhắn) / *Hẹn giao lại* (quay lại sau 1 giờ game) / *Hoàn về bưu cục* (không có tiền chuyến).
- **Sai địa chỉ / giao nhầm nhà** → người ở nhà đó nói "không phải nhà tôi" → phải tìm đúng nhà.
- **Khách không đủ tiền COD** → khách xin trả phần còn lại bằng chuyển khoản, hoặc hẹn lại.
- **Khách từ chối nhận** (hàng móp, đặt nhầm) → mang hàng về hoàn.
- Mất tiền COD (thối nhầm) → **trừ tiền chuyến**; thiếu nhiều → Anh Tám tạm ngưng giao.
- Trời mưa (UC-B4): giao lâu hơn nhưng thưởng mưa +30%.
**Luật:** mỗi chuyến tối đa 3 đơn (chọn thứ tự giao tối ưu); tiền chuyến theo khoảng cách; giao trễ hạn (phiếu có giờ hẹn) giảm thưởng.
**Đã làm:** nhận tối đa 3 đơn, soạn đúng mã trên kệ (gói giống nhau), ra phố có biển số nhà + ghim, chạy nhanh/chậm (hàng dễ vỡ móp → từ chối), gọi khách, người mở cửa (chính chủ / người nhà / người lạ), đưa điện thoại ký nhận có nét ký, từ chối người lạ → hẹn lại, thu hộ + thối tiền, vắng nhà (gửi hàng xóm / hẹn lại / hoàn), về nộp tiền (thiếu thì trừ tiền chuyến), tiền chuyến theo khoảng cách. **Chưa:** khách thiếu tiền COD, mưa, giờ hẹn giao, model xe máy.
**Kiểm chứng:** e2e server `work.e2e-spec.ts` (cả chuyến); Playwright `giao-hang.spec.ts` một chuyến đủ bước (iPhone 16 Pro + Pixel 7).

### UC-W8 · Quán sống động — khách thật sự đi, ngồi, ăn, trả tiền, đánh giá, gây chuyện ✅ (bản đầu)
> Người chơi yêu cầu: bấm là **thấy hành động diễn ra** (bê dĩa đi tới bàn), khách ra vào quán, quán chi tiết như thật,
> góc nhìn rộng quan sát được khách; **mỗi vị trí có góc nhìn, cách di chuyển, thao tác riêng**.

**Một vòng đời khách (server mô phỏng, client diễn):**
1. **Vào quán** qua cửa (thấy đi từ ngoài vỉa hè vào) → **xếp hàng** ở quầy cơm, khung thoại gọi món.
2. **Quầy múc** (người chơi đứng quầy, hoặc Cô Tư nếu người chơi làm vai khác) → dĩa ra **cửa bếp** kèm số bàn; khách **đi tới bàn trống, ngồi chờ**.
3. **Bưng dĩa** (người chơi bưng bê, hoặc bé Út) → nhân vật **cầm dĩa trên tay đi tới bàn** → đặt dĩa.
4. **Ăn** (ngồi ăn, dĩa vơi dần, uống trà đá) → ăn xong **đứng dậy tới quầy thu ngân**, bàn để lại chén dĩa bẩn.
5. **Trả tiền** (người chơi thu ngân, hoặc Cô Tư) → khách **đi ra cửa**, để lại **đánh giá ⭐ + một câu** trên đầu (và vào thống kê ca).

**Mỗi vị trí một góc nhìn — một cách di chuyển — một kiểu thao tác:**
| Vai | Góc nhìn | Di chuyển | Thao tác |
|---|---|---|---|
| Đứng quầy | Sau quầy nhìn ra cửa: thấy khay món, hàng khách, cửa ra vào, một phần phòng ăn | Đứng tại quầy (xoay người theo khay) | Lấy dĩa → chạm khay múc → đưa dĩa; báo bếp khi hết khay |
| Thu ngân | Sau máy tính tiền nhìn ra quầy + cửa: thấy khách ăn xong đi tới | Đứng tại máy | Bấm máy theo phiếu → báo giá → thu/thối; **la lên khi khách bỏ đi chưa trả** |
| Bưng bê | Nhìn chéo từ trên cao toàn phòng ăn, camera đi theo mình | **Tự đi**: chạm sàn để đi tới đó; chạm dĩa ở cửa bếp để cầm (tối đa 2 dĩa); chạm bàn để tự đi tới và đặt | Bưng đúng bàn; dọn bàn bẩn (đứng dọn vài giây); **can ngăn** khách cãi nhau |
| Giao hàng | Rộng cả bưu cục: kệ, quầy Anh Tám, cửa ra xe | Đi tới kệ để soạn | Chạm gói đúng mã |

**Đời thật & rẽ nhánh:**
- **Chờ lâu** → khách than (khung thoại đỏ "Sao lâu vậy!"); bấm *🙏 Xin lỗi* → khách chờ thêm một chút; bỏ mặc → khách bỏ về, đánh giá 1⭐.
- **Gây lộn** (hiếm): hai bàn cãi nhau / khách say lớn tiếng → mọi vai thấy cảnh báo; bưng bê đi tới bàn *✋ Can ngăn*; không ai can → khách xung quanh bỏ về, đánh giá thấp.
- **Quỵt tiền** (hiếm): khách ăn xong đi thẳng ra cửa → *📢 Gọi lại* kịp thì khách quay lại trả; không kịp → quán mất tiền.
- **Đánh giá** ⭐1–5 theo: chờ bao lâu, múc đúng không, bưng đúng bàn không, có được xin lỗi/can ngăn không. 5⭐ có khi **boa** cho người làm.
- Server kiểm **thời gian đi bộ**: bưng dĩa tới bàn phải mất đủ thời gian đi từ cửa bếp tới bàn (không "dịch chuyển").

**Quán chi tiết hơn:** gạch lát, tường ốp gạch men nửa dưới, bảng thực đơn có giá, quạt trần quay, đèn tuýp, bàn thờ Thần Tài,
tủ nước ngọt có đèn, nồi cơm điện, ống đũa – hũ ớt – hộp khăn giấy trên bàn, cửa kính có biển "ĐANG MỞ CỬA", cửa sổ nhìn ra phố.

**Đã làm:** máy trạng thái khách `packages/sim/src/floor.ts` (thời gian co giãn theo đồng hồ xóm); đồng nghiệp NPC (Cô Tư múc, chị thu ngân,
bé Út bưng + dọn bàn); khách than → xin lỗi; gây lộn → can ngăn (bưng bê phải đi tới bàn); quỵt → gọi lại; đánh giá ⭐ + boa 5⭐;
server kiểm thời gian đi bộ của bưng bê (cửa bếp ↔ bàn); camera riêng từng vai (đứng quầy/thu ngân nhìn qua quầy, bưng bê camera đi theo),
chạm sàn để đi, chạm dĩa/bàn để tự đi tới làm; quán có gạch bông, ốp gạch men, cửa ra phố, cửa sổ, bảng giá, quạt trần quay,
bàn thờ Thần Tài, TV, tủ nước ngọt, bếp có máy hút mùi, bồn rửa, tủ lạnh, nồi cơm.
**Bản 2 (theo góp ý người chơi):** camera lùi xa thấy cả quán, **kéo một ngón xoay 360°, chụm để thu/phóng** ở mọi vai (tường phía camera tự ẩn);
bưng bê **tự đi tới cửa bếp lấy dĩa → bưng tới bàn → tới nơi mới bấm "Giao món"** (nút hành động chỉ hiện đúng chỗ, danh sách
"việc cần làm" để chạm là đi tới — không còn lưới bàn nên quán lớn cỡ nào cũng dùng được); **lau bàn thấy khăn chạy trên mặt bàn**;
khách **ăn thấy muỗng đưa lên xuống, cơm vơi dần**; đứng quầy: **phiếu ghi rõ công thức phải múc** (cơm sườn = cơm + sườn + dưa + canh,
tích ✓ khi múc đủ, múc thừa báo đỏ), quầy khay dạng lưới có tên + số phần, dĩa đang múc chạm để bỏ bớt, nút "Đưa món".
**Chưa:** khách say, nhiều người chơi cùng làm một quán (Phase 2), bưu cục sống động tương tự, **quầy riêng của người chơi là một căn nhà
có không gian quán như Cô Tư** (UC-W6).
**Kiểm chứng:** unit `floor.test.ts` (vòng đời, than/xin lỗi, quỵt, gây lộn, bàn/đi bộ); e2e server `work.e2e-spec.ts`
(bưng bê cầm dĩa → đi tới bàn, khách trả tiền ra về có đánh giá); Playwright `nguoi-moi-lam-thue.spec.ts` (3 vai, iPhone 16 Pro + Pixel 7).

### UC-W6 · Tiệm riêng — thuê một căn nhà mặt tiền, có không gian quán như Cô Tư 🚧
> Người chơi yêu cầu: user có tiệm là một căn nhà (như quán Cô Tư) thì mới có không gian quán; cách bày quầy tham khảo
> ảnh quầy trà sữa (ly M/L, bình trà, lưới topping, máy dán nắp) — khách tới quầy gọi món, mình chạm từng ô rồi bấm đưa món.

**Luồng:** bảng Kinh doanh → *Chỗ bán* có thêm **nhà mặt tiền** (tiền thuê/ngày cao hơn xe đẩy, không bị mưa nắng, có bàn cho khách ngồi)
→ mở tiệm → trên phố căn nhà có **biển hiệu tên mình**, cửa mở; tới cửa bấm *🏪 Vào tiệm* → cảnh trong tiệm:
quầy của mình (theo nghề: tủ kính bánh mì / quầy trà sữa), khách **đi từ cửa vào, xếp hàng ở quầy, khung thoại gọi món**,
mình làm món trên **bảng quầy** (các ô nguyên liệu/khay dạng lưới có tên + số còn lại, chạm từng ô theo lời khách) → *Đưa món* → tính tiền.
Khách mua mang về đi ra cửa; khách ăn tại chỗ ngồi bàn (như quán Cô Tư).
**Đời thật:** tiệm đông thì cần người phụ (UC-H, tuyển NPC/người chơi) — vị trí mình không làm thì người phụ làm;
tiền điện nước tính vào tiền thuê; bảng hiệu, bàn ghế nâng cấp dần.
**Luật:** mở tiệm = đứng quầy trong tiệm; ra khỏi tiệm = quầy vắng chủ (như UC-F3); một người một chỗ bán (xe đẩy **hoặc** nhà).
**Đã làm (bản đầu):** 2 nhà mặt tiền cho thuê (số 10 phố chính 70k/ngày, số 24 cạnh ngã tư đông 120k/ngày) trong danh sách Chỗ bán;
ngoài phố căn nhà có mái hiên + biển "🏪 BÁNH MÌ <TÊN>"; đứng trước cửa bấm "🏪 Vào tiệm" → cảnh trong tiệm (quầy, đồ bày, bàn ghế,
camera xoay được), khách đi từ cửa vào xếp hàng, khung thoại gọi món, nhận món xong đi ra; "👨‍🍳 Làm món cho khách" dùng màn làm món,
"📖 Công thức" ngay trong tiệm. **Chưa:** bảng quầy dạng lưới riêng cho trà sữa (như ảnh tham khảo), khách ngồi ăn tại bàn, thuê người phụ.
**Kiểm chứng:** Playwright `tiem-rieng.spec.ts`.

### UC-W7 · Phiếu lương & uy tín người làm ⏳
Mỗi ca có phiếu lương chi tiết. Người làm có **uy tín làm thuê** (đúng giờ, ít lỗi, không bỏ ca): uy tín cao → được nhận vai khó hơn/lương cao hơn (thu ngân cần uy tín ≥ 60), chủ NPC gọi làm thêm; uy tín thấp → một số nơi không nhận.

---

## I. Kinh tế & uy tín

### UC-I1 · Uy tín quầy ✅ (sẽ mở rộng)
Tăng khi: món đúng, nhanh, giá hợp lý, khách quen. Giảm khi: sai món, thối thiếu, khách chờ lâu bỏ đi, hết hàng, đồ không đảm bảo.
Hiện dạng sao ★ trên biển hiệu và trong bảng Kinh doanh.

### UC-I2 · Reviewer ghé quầy ⏳
NPC reviewer (hiếm) gọi món khó → làm hoàn hảo → *"🔥 Bánh mì Tuấn đang viral"*: khách ×3 trong 1 ngày game; làm tệ → review 1 sao, khách −30% một ngày.

### UC-I3 · Cạnh tranh ✅ (mô hình) / hiển thị ⏳
Quầy cùng loại gần nhau chia khách theo giá & uy tín. Có thông báo "Quầy đối diện vừa giảm giá".

### UC-I4 · Phá sản & làm lại ⏳
**Đời thật:** lỗ liên tục, hết vốn, không trả nổi tiền chỗ.
**Luật:** ví không âm; bán lại xe nửa giá; luôn có việc làm thuê; Chú Bảy gợi ý "Làm thuê vài ngày rồi làm lại con". Không có nợ lãi cắt cổ.

### UC-I5 · Sổ sách ✅ (cuối ngày) / Lịch sử giao dịch ⏳
Xem từng khoản tiền vào/ra (sổ cái) theo ngày: bán món, boa, nhập hàng, thuê chỗ, lương trả/nhận.

### UC-I6 · Tiền mặt & ngân hàng, cây ATM ✅ (bản đầu)
**Hệ thống:** 💰 Kinh tế · **Luật:** 2 (💵/🏦 tách riêng), 2.1 (sổ cái kép), 2.3 (lãi có trần), 12.1 (HUD chỉ 💵), 14 (đứng gần mới dùng ATM).
**Đời thật:** khách quét mã chuyển khoản thì tiền vào tài khoản, không cầm được ngay; muốn đi chợ trả tiền mặt thì phải ra cây ATM rút;
cuối tháng ngân hàng trả chút lãi, không ai sống bằng lãi gửi vài trăm nghìn.
**Luồng:** khách trả chuyển khoản → tiền vào 🏦; khách trả tiền mặt (+ tiền boa) → 💵. Hàng xóm mua của nhau: chuyển khoản nếu tài khoản đủ,
không thì trả tiền mặt. HUD chỉ hiện 💵; 🏦 xem ở Hồ sơ (*🚶 Tới cây ATM gần nhất*) hoặc bảng ATM. Tới cây ATM (ô **N** trên bản đồ: cạnh chợ Bà Năm,
giữa phố gần quán cơm) → *🏧 Rút / gửi tiền · ATM* → chọn số tiền (bội số 10.000đ).
**Luật game:** ví tiền mặt cũ giữ nguyên số dư (migration `bank_account` chỉ thêm loại ví `PLAYER_BANK` + cột lãi); tài khoản `bank:<id>` tạo dần,
không bao giờ âm; ATM chỉ chuyển giữa hai ví của chính mình qua sổ cái (`atm_deposit`/`atm_withdraw`), phải đứng trong 3 m (server kiểm);
cuối ngày lãi 0,2% cho số dư từ 100k, **tối đa 3.000đ/ngày**, làm tròn xuống 500đ (`bankInterest` trong sim) — có trong báo cáo cuối ngày.
**Kiểm chứng:** unit `economy.test.ts` (lãi, trần, bội số ATM); e2e server `bank.e2e-spec.ts` (chuyển khoản vào 🏦, tiền mặt vào 💵, ATM xa/gần,
bội số, rút quá số dư, lãi có trần); Playwright `atm.spec.ts`.
**Chưa:** phí rút ở ATM khác ngân hàng, chuyển tiền tự do giữa người chơi, trả lương nhân viên qua tài khoản.

### UC-I7 · Chỗ tiêu bắt buộc: phí chợ/thuế, điện nước, hao mòn + sửa xe, thanh lý hàng ✅ (bản đầu)
**Hệ thống:** 💸 Money sink · 🏪 Làm ăn · **Luật:** 2.2 (mỗi nguồn thu có chỗ tiêu), 7 (rủi ro làm ăn), 14 (sửa xe/thanh lý phải tới nơi).
**Đời thật:** bán vỉa hè thì đóng phí chợ/vệ sinh cho ban quản lý; mở tiệm thì có thuế khoán và tiền điện nước hằng tháng;
xe đẩy bán nhiều thì bánh xe rơ, kính nứt — để lâu khách ngại ghé, bán chậm, hư hẳn thì phải dắt đi sửa; đổi nghề thì đồ cũ bán đổ bán tháo.
**Luật game:**
- Mở quầy lần đầu trong ngày: thuê chỗ **+ phí chợ 5k (xe đẩy) / thuế khoán 15k (tiệm)** — trả một lần/ngày.
- Tiệm (nhà mặt tiền) trả **điện nước 3k mỗi giờ mở cửa**; hết tiền mặt thì trừ tài khoản, hết cả hai thì tiệm tạm đóng.
- **Hao mòn**: mỗi món bán xe mòn 0,6%; từ 50% là "ọp ẹp" (khách ×0,85, nút giữ lâu ×1,6); 100% là hư, không mở được.
  Sửa ở **vựa xe Ông Sáu** (phải đứng đó, đóng quầy): giá = giá xe × độ mòn × 25%, tròn nghìn (xe bánh mì mòn 50% ≈ 40k).
- **Thanh lý hàng tồn** ở chợ Bà Năm: bán hết một loại với 40% giá gốc (tròn 500đ).
- Mọi khoản trên vào báo cáo cuối ngày (dòng "Phí chợ, điện nước, sửa xe, sự kiện"); `pnpm balance` tính phí ngày, điện nước,
  tiền sửa chia theo món → lãi các nghề giảm ~20%, không chiến lược nào "giàu không giới hạn".
**Kiểm chứng:** unit `economy.test.ts` (mòn, tình trạng, tiền sửa, thanh lý); e2e server `sinks.e2e-spec.ts`, `resale.e2e-spec.ts`;
Playwright `thanh-ly.spec.ts`. **Chưa:** quỹ xóm nhận phí để làm công trình chung (UC-K8), lương nhân viên, xăng xe.

---

## J. Nhiều người chơi (Phase 2)

### UC-J1 · Mời bạn vào xóm ✅
**Luồng:** chạm 👥 trên thanh trên → bảng *Xóm*: mã xóm 8 ký tự + nút *📨 Mời bạn* (Web Share → Zalo/Messenger; máy không có thì chép link).
Bạn mở link `/play?xom=<mã>` → chưa có tài khoản thì đăng ký (giữ nguyên link) → vào game xong (hết lời Chú Bảy) bảng Xóm **tự mở** với lời mời → bấm *Vào xóm*.
Hoặc nhập mã tay trong bảng Xóm.
**Đời thật & rẽ nhánh:**
- Đang mở quầy / đang trong ca → phải dọn quầy, ra ca trước (không bỏ khách giữa chừng).
- Mang theo tiền, hàng tồn, xe hàng. Chỗ bán cũ đã có hàng xóm dùng → phải chọn chỗ khác.
- Mỗi xóm có đồng hồ riêng: vào xóm lệch ngày thì hàng tồn, sổ sách, tiền thuê dời theo ngày xóm mới (hàng không tự hỏng hay tươi lại).
- Mã sai → "Không có xóm nào mã này"; xóm đủ 8 người online → đợi.
**Kiểm chứng:** e2e server `xom.e2e-spec.ts`; Playwright `xom-chung.spec.ts` (2 người, iPhone 16 Pro + Pixel 7).

### UC-J2 · Thấy nhau ✅ (cơ bản)
Hàng xóm đi lại trên phố (vị trí gửi 10 lần/giây khi có thay đổi, nội suy mượt), **bảng tên trên đầu**, câu nói nhanh hiện trong khung thoại kèm tên người nói.
Vào quán/bưu cục thì biến khỏi phố (bảng Xóm ghi "ở Quán cơm…"); trong quán chỉ nghe người cùng quán. Tắt app → biến mất khỏi xóm.
Quầy của hàng xóm hiện ở chỗ bán kèm tên chủ.
**Chưa:** dáng nhân vật riêng cho từng người (Phase 3), chat gõ chữ (UC-D4).
### UC-J3 · Mua của nhau ✅
**Luồng:** tới quầy hàng xóm đang mở (bảng Xóm → *🛒 Tới quầy*, hoặc tự đi tới) → *🛒 Gọi món · quầy An* → chọn món trên thực đơn của họ,
tự chọn size/mức đường…, *dặn thêm* (không hành, thêm bơ…) → thấy câu mình sẽ nói + giá → *Gọi món*.
Lời gọi món hiện trên đầu chính mình; chủ quầy thấy đơn "👤 Bình (hàng xóm)" trong hàng chờ như khách thường và **làm tay** từng bước.
Làm sai → người mua thấy "❌ Sai phần rau rồi", chủ làm lại hoặc giảm giá; tính tiền → **chuyển khoản từ ví người mua sang ví chủ** (sổ cái), không boa tự động.
**Đời thật & rẽ nhánh:**
- Món chủ quầy không đủ nguyên liệu → hiện "hết", không gọi được. Quầy đông (đủ hàng chờ) → đợi. Chủ vắng quầy → đợi chủ về.
- Đứng xa quầy (> 6 m, server kiểm) hoặc đang ở trong quán → không gọi được. Mỗi lúc chờ một món.
- Không đủ tiền → không gọi được; tới lúc tính tiền mà ví hụt → chủ xin lỗi khách.
- Chủ không làm kịp (chờ 3 phút) → người mua bỏ đi, quầy mất uy tín như khách thường.
**Kiểm chứng:** e2e server `xom.e2e-spec.ts` (xa quầy, gọi trùng, làm sai → đúng, tiền đi giữa hai ví); Playwright `mua-cua-nhau.spec.ts`.
**Chưa:** người mua chấm sao/nhận xét, boa tay, ăn món (hiện chỉ nhận món), trả tiền mặt giữa hai người.
- **UC-J4 Tuyển nhau làm** — UC-H2…H8 giữa người chơi.
- **UC-J5 Tranh chỗ** — chỗ bán đã có người thuê trong ngày thì người khác không thuê được; đấu giá chỗ đẹp theo tuần (⏳).
- **UC-J6 Chống quấy rối** — chặn, báo cáo, lọc từ ngữ; không cho đứng chắn trước quầy người khác quá 1 phút (bị đẩy nhẹ ra).

---

## K. Sự kiện đời sống

| Mã | Sự kiện | Ảnh hưởng |
|---|---|---|
| UC-K1 | Hội chợ đêm cuối tuần ⏳ | Gian hàng tạm, khách đông, nhiều hạng mục thắng (doanh thu, món đẹp, phục vụ) |
| UC-K2 | Mưa ✅ | Xem UC-B4 |
| UC-K3 | Tan trường sớm | Quầy gần trường đông đột xuất 1 giờ |
| UC-K4 | Mất điện | Không có đá (trà sữa bán kém), đèn quầy tắt buổi tối |
| UC-K5 | Kiểm tra vệ sinh ATTP | Ngẫu nhiên; quầy từng bán đồ hỏng / nhiều món sai bị nhắc nhở hoặc phạt nhẹ |
| UC-K6 | Đám giỗ / đám cưới | Đơn đặt trước số lượng lớn (UC-F10) |
| UC-K7 | Lễ Tết | Giá nguyên liệu tăng, khách tăng, món đặc biệt theo mùa |

---

## L. Hệ thống & lỗi

| Mã | Tình huống | Hành vi mong đợi |
|---|---|---|
| UC-L1 | Mất mạng khi đang làm món | Món bỏ dở, nguyên liệu không bị trừ; khách chờ tiếp nếu còn kiên nhẫn |
| UC-L2 | Tải lại trang | Vào lại đúng vị trí quầy (nếu quầy đang mở), đúng bước kịch bản |
| UC-L3 | Server khởi động lại | Người chơi tự kết nối lại; đồng hồ xóm tiếp tục từ lần lưu gần nhất (≤ 10 phút game) |
| UC-L4 | Bấm liên tục / spam | Giới hạn 20 thao tác/giây; thao tác trùng (đưa 1 món 2 lần) bị từ chối an toàn |
| UC-L5 | Gian lận từ client | Server kiểm tra mọi thứ: nguyên liệu có thật, món đúng/sai, tiền thối, vị trí (Phase 2) |
| UC-L6 | Máy yếu | Tự hạ độ phân giải khi FPS tụt; bỏ bớt NPC trang trí |

---

## Lộ trình theo use case

| Giai đoạn | Use case |
|---|---|
| **Phase 1.5** ✅ | C1–C3, B2, H1 (cơ bản), phục vụ "Đưa hàng" |
| **Phase 1.6 — Làm thật** ✅ | D1, D2, D3 · E1 · F1–F7, F9 · I1 · L1 |
| **Phase 1.7 — Vào làm (không gian riêng)** ✅ | W1–W5 (quán cơm 3 vai, giao hàng tận nơi) · phiếu lương ca (một phần W7) · W8 quán sống động |
| **Phase 1.10 — Xóm lớn sống động** ⏳ | B6 map rộng, đường xá · B7 góc nhìn tự do · B8 ngày/đêm, đèn · B9 sạp theo giờ · B10 cảnh sinh hoạt, làm khách |
| **Phase 1.8 — Sửa xe & chợ phụ tùng** | G1–G4 · E3 (độ bền xe) · W6 (quầy riêng 3D) |
| **Phase 1.9 — Tuyển dụng (NPC trước)** | W7 (uy tín người làm) · H2–H9 với NPC nhân viên / NPC chủ tiệm · E2 · F10 · B4 |
| **Phase 2 — Nhiều người** 🚧 (J1–J3 ✅) | D4 · E4 · J1–J6 · H2–H8 giữa người chơi |
| **Sau đó** | K1–K7 · I2 · I4 · I5 · F8 |
