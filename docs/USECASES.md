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
| **Người mới** | Vừa tạo tài khoản, có 1.500.000đ vốn tích góp, chưa có nghề |
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
**Luồng:** mở link → "Vào xóm" → tab *Tạo tài khoản* → nhập tên đăng nhập, tên hiển thị (tiếng Việt có dấu), mật khẩu → vào xóm với 1.500.000đ.
**Đời thật & rẽ nhánh:** tên đã có người dùng · mật khẩu quá ngắn · mạng rớt khi đang gửi · bấm nút hai lần.
**Luật:** username 3–20 ký tự không dấu, không phân biệt hoa thường; tên hiển thị 2–24 ký tự; vốn khởi nghiệp đi qua sổ cái.
**Xóm:** không có link mời → vào xóm còn chỗ đông nhất; tick *Lập xóm riêng* → xóm mới; có link mời → vào thẳng xóm đó (UC-J7).
**Hướng dẫn người mới:** Chú Bảy bắt chuyện **một lần** mỗi bước (nhớ trên máy, `xom:seen-dialogues`) — vào lại game không bị bắt
chuyện lại, chỉ còn dòng mục tiêu; câu hỏi đầu có thêm "Con tự lo được, cảm ơn chú" để bỏ qua hướng dẫn.
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


### UC-A5 · Thêm XÓM vào màn hình chính (PWA) ✅
**Đời thật:** người chơi quen mở app từ màn hình chính; Safari không tự hỏi cài, nhiều người không biết làm.
**Luồng:** trang chủ → *📲 Thêm XÓM vào màn hình chính* (ẩn nếu đang mở từ màn hình chính) → modal *Cài XÓM như ứng dụng*,
tự chọn tab theo máy:
- **iPhone / iPad:** 3 bước, mỗi bước một ảnh chụp Safari thật (danh bạ đã làm mờ) có khung đỏ nhấp nháy đúng chỗ bấm:
  ① nút Chia sẻ → ② *Xem thêm* → ③ *Thêm vào Màn hình chính*; Quay lại / Tiếp / Xong; nhắc mở bằng Safari nếu đang trong Zalo.
- **Android:** Chrome cho phép thì có nút *📲 Cài ngay* (hộp cài của hệ thống, `beforeinstallprompt`); luôn có 3 bước qua menu ⋮.
**Kiểm chứng:** Playwright `cai-dat.spec.ts` (cả hai tab, đủ 3 bước).

---

## B. Thế giới, di chuyển, thời gian


### UC-A6 · Tìm chức năng: ☰ Menu + icon neo tự ghim ✅
> Góp ý: "làm ăn đang gộp chung đi làm thuê, thuê nhân viên, kho, mở tiệm/thuê… khó dùng — mỗi tính năng nên tách ra một
> modal/bottom-sheet riêng". Kế hoạch: docs/IA.md.

**Luồng:** màn hình chính chỉ còn thanh số liệu, **hai cột icon neo (trái + phải)**, nút ngữ cảnh, 💬 và **☰ Menu** (icon
không nền, chữ "Menu" nhỏ đè dưới icon, chấm xanh/đỏ = kết nối; ⚙️ Cài đặt chỉ còn trong Menu). Bấm ☰ Menu → lưới icon
chia 5 nhóm (🏪 Cửa hàng · 🧺 Mua bán · 💼 Việc làm · 🏘️ Xóm · 🙂 Tôi), mỗi icon mở **đúng một sheet** của chức năng đó (35
chức năng: Quầy của tôi, Thực đơn & giá, Kho hàng, Chỗ bán, Thuê nhà & giấy tờ, Nhân viên, Sổ sách, Khách quen, Đánh giá, Khai
trương, …). Icon có **chấm đỏ** khi có việc cần làm (hết hàng, chưa chọn chỗ, chưa có xe, đói/khát). **📌 Ghim**: chạm xoay vòng
ghim trái ◀ → ghim phải ▶ → bỏ ghim, mỗi bên tối đa 4 (mặc định trái: Ăn uống · Chợ · Quầy của tôi · Làm thuê; phải: Nhiệm vụ ·
Hàng xóm); trái đầy thì tự sang phải; hai bên đầy thì bị từ chối.
Chức năng phải dùng tại chỗ (Chợ, Vựa xe, ATM, Phụ hồ, Xe ôm khi chưa thuê xe) → nhân vật tự đi tới rồi mở.
Trong mỗi sheet có nút **"›"** chuyển sang chức năng liên quan (Quầy của tôi → Thực đơn, Kho, Chỗ bán, Nhân viên…); sheet mở
bằng "›" hoặc từ Menu có nút **‹ Quay lại** ở góc trái tiêu đề (về sheet trước / về Menu); mở thẳng từ bản đồ thì chỉ có ✕.

**Luật giao diện:** DESIGN Luật 12.3–12.6. Thêm chức năng = một dòng trong `game/features/registry.ts` + một file sheet.

**Kiểm chứng:** Playwright `menu-chinh` (mở Menu, đủ nhóm; không còn neo ⚙️; ghim trái/phải/bỏ, hai bên đầy bị từ chối; mở chức năng
từ icon neo và từ nút "›") + mọi kịch bản cũ chuyển sang `openFeature(page, id)`.

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
**Luồng:** thanh 🕒 trên HUD hiện kiểu trời (☀️ nắng · ☁️ âm u · 🌧️ mưa · ⛈️ bão; ban đêm trời quang là 🌙). Trời sắp đổi (trong 90 phút game)
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
> **Xóm quê (1.11, góp ý chủ dự án):** bỏ nhà cao tầng hiện đại — nhà dân là **nhà tranh / nhà cấp 4 mái ngói / nhà ống 1 lầu**
> theo tỉ lệ trong `content.housing` (cấp nhà bằng dữ liệu, để sau này mua/xây nhà thì nâng cấp dần lên nhà ống 2 lầu…),
> nhà phố là tiệm tạp hoá mái hiên, toà cao tầng thành **trụ sở UBND xã**, trường thành **trường làng** có cột cờ; sân trước có rào tre,
> lu nước, đống rơm; cây dừa, chuối, bụi tre. Model tự dựng bằng Blender (`art/blender/nha_que.py` → bundle `village`, `pnpm assets village`),
> mỗi model 1 material + vertex color = **1 draw call mỗi loại**, 56–324 tam giác.
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


### UC-B11 · Đói / khát + quầy hàng xóm trong mục Ăn uống + khách réo khi chủ vắng ✅ (bản đầu)
**Hệ thống:** 🧍 Nhân vật · 🍜 Ăn uống · 🏪 Làm ăn · **Luật:** 17.2 (không khoá việc chơi), 12.1 (HUD gọn), 15 (dữ liệu).
**Đời thật:** đứng bán cả buổi quên ăn, bụng réo, tay chậm; tranh thủ chạy đi làm tô phở, ly nước mía. Quầy bỏ trống thì khách
tới gọi "ơi có ai bán không", hàng xóm nhắn "khách đứng chờ kìa" — chạy về bán.
**Luật game (`content.needs`, `packages/sim/src/needs.ts`):**
- 🍚 No / 💧 Đỡ khát 0–100: no tụt ~10/giờ game, khát ~14/giờ; đêm ngủ chỉ tính 4 giờ; người mới 80/80.
- Món ở sạp có `food`/`drink` (phở +70 no, nước mía +60 đỡ khát…); mua ở quầy hàng xóm theo loại hàng (đồ ăn sáng +45 no, đồ uống +55 khát).
- Dưới 30%: tay giữ nút chậm ×1,25 + nhắc một lần ("🍚 Bụng réo rồi — ghé 🍜 Ăn uống…"). **Không khoá gì.**
- HUD: chip 🍚/💧 chỉ hiện khi dưới 50% (đỏ nhấp nháy khi dưới 30%), chạm mở *Quán ăn quanh xóm*; Hồ sơ → Tôi có 2 thanh.
- *Quán ăn quanh xóm* có thêm **Quầy hàng xóm đang bán** (đồ ăn/uống, người thật đứng quầy) → *🛒 Tới quầy*.
- Quầy mở mà chủ đi vắng: mỗi ≤ 20 phút game khách réo ở quầy (khung thoại tại quầy) + chủ được báo
  "🔔 Khách đang réo ở quầy … — chạy về bán thôi!".
**Kiểm chứng:** unit `needs.test.ts`; e2e server `needs.e2e-spec.ts` (nhắc đói, ăn phở no lại, khách réo); Playwright `an-sang.spec.ts`
(chip đói → mở quán ăn → ăn xôi → chip biến mất).
**Chưa:** NPC hàng xóm nhắn hộ, uống nước ở nhà, món tự nấu.


### UC-B12 · Bản đồ mở: xóm ghép thêm khu bốn phía ✅ (bản đầu, bước A–F — docs/BANDO.md)
**Hệ thống:** 🏘️ Thế giới · **Luật:** 4 (tiến trình thấy được — xóm lớn dần), 15 (dữ liệu), 12.3 (hiệu năng điện thoại).
**Đời thật:** xóm đông lên thì người ta san đất, mở đường mới; phố mới lúc đầu vắng, đất rẻ.
**Luồng (bước A):** xóm mở thêm khu → mọi người trong xóm nhận lưới mới ngay (`world.chunks`), cảnh phố, đèn đêm, giao thông,
đường đi bộ dựng lại; vào lại game vẫn thấy khu đã mở. Hiện mở bằng lệnh thử nghiệm `debug:chunk` — bước F tự mở khi ≥ 70% ô có chủ.
**Luật game:** mẫu khu là dữ liệu (`content.chunks`: đông/tây cao bằng bản đồ gốc, bắc/nam rộng bằng; đường ở mép phải nối với
đường gốc — kiểm khi nạp content). `sim/chunks.ts` `composeMap` ghép lưới (góc chéo là đất trống), toạ độ thế giới của bản đồ
gốc giữ nguyên. Server giữ `Room.chunks`, `room.grid` (xe ôm tính quãng đường trên lưới ghép).
**Bước B — chỗ bán ở khu mới:** mỗi mẫu khu có 2–3 chỗ vỉa hè rẻ hơn phố gốc (25–35k/ngày, khách thưa hơn ×0,7–0,85), hiện
trong 📍 Chỗ bán khi khu đã mở; chọn, đẩy xe tới, mở quầy, bán như chỗ cũ. Chưa mở khu thì server từ chối ("Không có chỗ này").
**Bước C (một phần) — 🗺️ bản đồ xóm:** đầu sheet 📍 Chỗ bán là bản đồ thu nhỏ của cả xóm (lưới ghép, vẽ một canvas): chỗ của
mình đỏ, còn trống xanh lá, có người xám, nhà mặt tiền xanh dương, chấm vàng là mình đang đứng. Chạm một chấm → dòng chỗ đó được
tô viền vàng và cuộn tới (quầy đang mở thì nhắc "Đóng quầy rồi mới đổi chỗ được").
**Bước C — ⛺ sạp có mái trên ô đất:** khu đông/tây có 2 ô đất trống cho thuê dựng sạp (mái hiên + ghế nhựa). Luật (chốt
2026-10-03): mưa vẫn bán như trong nhà (`weatherDemand` dùng hệ số trong nhà cho `stall`), khách chịu giá ×1,1, thuê ô 70–80k/ngày
+ phí quản lý 10k/ngày, **dựng sạp 300k** (`economy.stallBuild`, sổ cái lý do `stall_build`, ghi vào phí trong sổ) mỗi lần dọn
tới ô sạp. `pnpm balance`: sạp ~300k/ngày (bánh mì tay vừa) — dưới chỗ đông của phố gốc, trên xe đẩy ở khu mới (~185–235k).
**Bước D — 🏷️ mua đứt ô đất:** dưới mỗi ô sạp trong 📍 Chỗ bán có dòng "Mua đứt · giá" (chưa đứng tại ô thì tự đi tới rồi mở lại
bảng). Luật: chỉ ô sạp có mái (vỉa hè là chỗ chung); phải đứng tại ô; giá = tiền thuê × 40 ngày; chủ ô không trả tiền thuê, mở sạp
trả phí 10k + **thuế đất 15k**/ngày (một phần về quỹ xóm như phí chợ); dọn về ô của mình không phải dựng lại sạp; người khác không
dọn tới được ("Ô đất này của …"), không mua chen khi có người đang thuê; tối đa 2 ô/người/xóm; **bán lại cho xóm 70%** giá mua
(phải đóng quầy trước, quầy ra khỏi ô). Bản đồ: ô đất của mình màu tím. Hoàn vốn ~50 ngày (`pnpm balance` cảnh báo nếu ngoài
20–120 ngày).
**Bước E — 🏗️ xây tiệm trên ô đất của mình:** dòng ô đất của mình có nút "🏗️ Xây 🏬 Tiệm 1 tầng · 2 ngày · 2tr" (rồi 🏢 Nhà 2
tầng · 3 ngày · 4,5tr). Trả một lần (sổ cái lý do `build`, cộng vào giá ô); đang xây thì cọc công trường, không mở sạp ("Đang xây
tiệm trên ô này — xong ngày N"); sang ngày xong thì nhà dựng lên, ô lên cấp tiệm 2 / 3 (khách ×1,25 / ×1,45, thuê 2 / 3 người).
Cấp có hiệu lực theo chỗ bán: nhà thuê theo cấp đã nâng của cửa hàng, sạp theo công trình trên ô, **xe đẩy vỉa hè luôn cấp 1**
(trước đây nâng cấp nhà thuê rồi dọn ra vỉa hè vẫn giữ cấp — đã bịt).
**Bước F — xóm tự lớn:** mỗi lần sang ngày, server đếm chỗ bán của xóm (cả khu đã mở) đang có cửa hàng đặt hoặc đã có chủ mua;
≥ 70% thì mở khu kế tiếp (đông → tây → bắc → nam → đông thứ hai…, tối đa 8 khu) và báo cả xóm "🏗️ Xóm đông quá — mở thêm Khu
phía đông…". Mọi người nhận lưới mới ngay (như bước A).
**Kiểm chứng:** unit `chunks.test.ts` (nối tiếp theo phía, kích thước, toạ độ cũ giữ nguyên, đi bộ sang khu đông, chỗ bán của
khu đứng trên ô đi được ở cả bốn phía); e2e `chunks.e2e-spec.ts` (mở khu, lưu DB, người vào sau thấy; chọn chỗ của khu chỉ khi đã
mở, người khác không chiếm được); Playwright `ban-do-mo` (lưới rộng ra, đi bộ sang khu đông; mở quầy bánh mì ở "Đầu phố mới";
bản đồ trong Chỗ bán rộng ra khi mở khu, chạm chấm chỗ mới thì dòng đó được tô; dựng sạp có mái, mưa vẫn có khách); e2e
`chunks.e2e-spec.ts` (dựng sạp trừ đúng 300k; mua đứt: vỉa hè/đứng xa bị từ chối, chủ dọn về không trả phí dựng, `lotOwned`, hàng
xóm không dùng được, bán lại +70%); unit `weather.test.ts` (sạp mưa = trong nhà), `shop.test.ts` (openDue chủ ô, giá, tiền bán lại);
Playwright `ban-do-mo` (mua đứt ô đang thuê, tiền trừ đúng giá, bán lại; xây tiệm 1 tầng, nhảy ngày, lên cấp 2); e2e xây theo
thứ tự, đang xây không mở được, xong lên cấp, bán lại tính cả tiền xây; unit `staff.test.ts` (`effectiveShopLevel`).
e2e bước F: 6/10 chỗ có người thì không mở, 7/10 thì sang ngày mở khu đông; unit `shouldGrow` / `nextChunkToOpen`.
**Chưa:** phụ hồ góp sức xây tiệm riêng; chỉ dựng khu trong tầm camera; tin mở khu trên bảng tin xóm; model nhà đúng chất Việt.
### UC-P1 · Kỹ năng + mở khoá theo cấp ✅ (bản đầu)
**Hệ thống:** 📈 Tiến trình · **Luật:** 4.1 (mỗi phiên thấy thanh tiến độ nhích), 4.2 (mở khoá bằng làm thật), 15 (dữ liệu).
**Đời thật:** bán lâu thì tay quen, làm nhanh hơn; nhớ khách hay dặn gì; ăn nói khéo thì khách dễ chịu, chờ được lâu hơn.
Người mới chưa ai cho thuê mặt bằng — phải bán được một thời gian, có tiếng trong xóm mới thuê nhà mặt tiền.
**Luật game (content.skills, content.unlocks; công thức ở `packages/sim/src/progression.ts`):**
- ⚡ **Tay nhanh** (+1 khi bán kịp giờ, +1 mỗi việc làm thuê có tiền): mỗi bậc giữ nút (lắc, giữ…) nhanh hơn 8%, tối đa 5 bậc.
- 🧠 **Nhớ món** (+1 khi làm đúng món có lời dặn): từ bậc 1, màn làm món nhắc lại lời dặn thành từng mục ("🧠 Nhớ nè: không hành · nhiều ớt").
- 💬 **Ăn nói** (+1 khi chào hỏi NPC mỗi ngày, +1 khi khách vui ≥ 80%): mỗi bậc khách kiên nhẫn thêm 5%.
- **Mở khoá theo cấp**: cấp 2 tổ chức khai trương, cấp 3 thuê nhà mặt tiền mở tiệm — server kiểm, chỗ bán/nút hiện 🔒 kèm cấp cần.
- Hồ sơ hiện thanh từng kỹ năng + danh sách mở khoá.
**Kiểm chứng:** unit `progression.test.ts`; e2e server `skills.e2e-spec.ts`; Playwright `ky-nang.spec.ts`.
**Chưa:** kỹ năng theo nghề riêng (pha chế, sửa xe), mở khoá món/nghề mới theo cấp.

---

### UC-P2 · Bảng xóm: giải tuần nhiều hạng mục, thị phần, đang hot, số liệu 7 ngày, thành tựu ✅ (bản đầu)
**Hệ thống:** 📈 Tiến trình · 🏪 Làm ăn · 🤝 Xã hội · 📊 Đo lường · **Luật:** 4 (tiến trình thấy được), 13 (nhiều người chơi),
17 (giữ chân lành mạnh — không điểm danh, không streak).
**Đời thật:** cả xóm biết quán nào đông, quán nào ngon, ai siêng; người mới mở quầy đúng chỗ đang thiếu vẫn nổi được.
Không ai thắng mãi chỉ vì chơi lâu — thiên hạ nhớ chuyện tuần này.
**Luồng:**
- *Hàng xóm* → *🏆 Bảng xóm*: tab **Giải tuần** — 7 hạng mục, mỗi hạng mục top 3, tính 7 ngày gần nhất trong xóm:
  💰 doanh thu · 🧮 lãi · 👥 đông khách · ⭐ được tin nhất (≥ 3 đánh giá) · 📈 lên như diều (3 ngày gần so 3 ngày trước) ·
  💼 chăm làm (tiền công làm thuê) · 🤝 thân thiện (kỹ năng Ăn nói). Tab **Thị phần**: % số món bán ra theo từng món.
  Tab **Đang hot**: trời bây giờ + dự báo, giá chợ nhích ≥ 8% so hôm qua, ai đang khai trương, món bán chạy nhất hôm nay.
- *Làm ăn* → *📊 7 ngày qua*: cột doanh thu + lãi từng ngày; có ≥ 2 quầy cùng món thì so "Bạn / TB n quầy" (doanh thu,
  số món mỗi ngày có bán) — chỉ đưa số, người chơi tự rút ra chiến lược.
- *Hồ sơ* → *🏅 Thành tựu*: 11 thành tựu (content.achievements) có thanh tiến độ; mở xong báo "🏅 Thành tựu mới".
**Luật game:** hạng mục và thành tựu là dữ liệu (`content.awards`, `content.achievements`), công thức ở `packages/sim/src/stats.ts`;
server tính từ DailyReport + sổ đánh giá + kỹ năng; thành tựu kiểm cuối ngày và khi mở số liệu, đã mở thì giữ.
**Kiểm chứng:** unit `stats.test.ts`; e2e server `stats.e2e-spec.ts`; Playwright `bang-xom.spec.ts`.
**Để sau (đã lọc từ đề xuất):** team/công ty, chuỗi cung ứng, followers/content, mùa giải + huy hiệu mùa, đấu giá mặt bằng,
thi trang trí "quán đẹp tuần", xếp hạng quận/thành phố. **Không làm:** streak điểm danh (trái Luật 17).

### UC-P4 · Thưởng thành tựu + nhiệm vụ hằng ngày ✅ (bản đầu)
**Hệ thống:** 📈 Tiến trình · 💰 Kinh tế · **Luật:** 4.2 (mở khoá bằng làm thật), 5 (money sink — thưởng nhỏ, có trần),
15 (dữ liệu), 17 (giữ chân lành mạnh — không điểm danh, không streak, quên nhận không mất gì ngoài thưởng hôm đó).
**Đời thật:** bán được mối đầu thì cô chú trong xóm lì xì lấy hên; ngày bán đắt thì tự thưởng ly cà phê.
Góp ý chủ dự án (đợt 2): "thành tựu có mà không thưởng gì thì trông vô dụng".
**Luồng:**
- ☰ Menu → 🎯 *Nhiệm vụ* → mục **Hôm nay**: 4 nhiệm vụ (🥖 Bán 5 món, 🔥 Bán 20 món, 💼 Làm thuê kiếm 50.000đ, 👥 Có hàng
  xóm cùng chơi) có tiến độ `x/y` và 🎁 phần thưởng; xong thì dòng xanh ✅ + nút **🎁 Nhận** → toast "🎁 …: +3.000đ, +15 kinh
  nghiệm", nút thành "✓ Đã nhận". Sang ngày mới thì làm lại từ đầu.
- ☰ Menu → 🏅 *Thành tựu*: mỗi thẻ có 🎁 phần thưởng; thẻ đạt mà chưa nhận xếp lên đầu, có nút **🎁 Nhận** (nhận một lần).
**Luật game (content.dailyQuests, content.achievements[].reward; server `game/rewards.ts`):**
- Server kiểm đạt thật: nhiệm vụ đếm từ sổ hôm nay (`DailyReport.served`, `.wages`) + số người online cùng xóm; thành tựu phải
  đã mở (`Player.achievements`). Chưa đạt → `invalid_state`.
- Nhận một lần: khoá `ach:<id>` / `q:<ngày>:<id>` trong `Player.rewardsClaimed`, đọc lại trong giao dịch (bấm hai lần vẫn một
  lần); dấu nhiệm vụ cũ hơn 7 ngày tự dọn.
- Tiền vào 💵 tiền mặt qua sổ cái (lý do `reward`), XP cộng thẳng. Nhiệm vụ tối đa 11k/ngày (≤ 10% một ngày làm thuê rẻ nhất),
  thành tựu tổng 380k một lần — `pnpm balance` cảnh báo nếu vượt. "Có hàng xóm cùng chơi" chỉ thưởng XP (tránh nuôi nick phụ).
**Kiểm chứng:** e2e server `rewards.e2e-spec.ts` (chưa đạt bị từ chối, nhận một lần, tiền + XP đúng); Playwright
`thuong.spec.ts` (bán 5 món → chấm đỏ 🎯 → nhận thưởng "Bán 5 món" + thành tựu "Mở hàng", tiền mặt tăng đúng, nhận lại không
được, hết chấm đỏ).
**Chấm đỏ:** `MeView.rewards {quests, badges}` = số thưởng đạt mà chưa nhận (server đếm trong `me()`, không truy vấn thêm) →
chấm đỏ trên icon 🎯/🏅 ở cột neo và trong ☰ Menu (`features/alerts.ts`); nhận hết thì tắt. Thành tựu chỉ được ghi mở cuối ngày /
khi mở số liệu, nên chấm 🏅 có thể hiện trễ.
**Chưa:** thưởng *chức năng* (mở khoá) thay cho tiền.

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
### UC-D4 · Chat với người chơi khác 🚧 (gõ chữ ✅, chặn/báo cáo ⏳)
**Luồng:** icon 💬 (bong bóng, không nền) → khung *Chat xóm*: 30 câu gần nhất của người chơi trong xóm (của mình bên phải),
ô *Nói gì với cả xóm…* + *Gửi* (Enter để gửi), bên dưới là câu nói nhanh dạng chip. Có tin mới khi đang đóng khung thì icon hiện số.
**Luật game:** server nhận `chat:text` (1–80 ký tự, gộp khoảng trắng), che từ tục (`content.reviews.banned`), mỗi người cách nhau ≥ 1,5 giây;
câu hiện trên đầu nhân vật cho cả xóm (sự kiện `say`) + vào khung chat; chỉ ghi độ dài vào GameEvent (không lưu nội dung).
**Kiểm chứng:** e2e server `chat.e2e-spec.ts`; Playwright `chat.spec.ts`.
**Chưa:** bấm vào người chơi → *Chặn* / *Báo cáo*; người bị chặn không thấy tin nhắn của mình.

### UC-D5 · Âm thanh: nhạc nền, tiếng thao tác, giọng nói ✅ (bản đầu)
Tổng hợp bằng WebAudio (không file, không lo bản quyền): **nhạc nền** ngũ cung kiểu đàn tranh (ngày tươi, đêm chậm/dịu);
**hiệu ứng**: bấm nút "tách", tiền vào "ting", múc cơm, đặt dĩa, chuông, lỗi "è"; **giọng nói** lầm bầm theo âm tiết mỗi khi ai đó nói
(mỗi người một cao độ; khách bực/cãi nhau thì gắt, nhanh — kèm câu càu nhàu "Làm ăn kiểu gì chậm như rùa vậy!", "Muốn gây hả?").
Cài đặt ⚙️: thanh âm lượng nhạc / hiệu ứng / giọng, nút tắt tiếng (nhớ trên máy). Âm thanh chỉ bật sau cú chạm đầu tiên (luật trình duyệt).
**Chưa:** đọc chữ thật (TTS tiếng Việt), âm thanh môi trường (xe cộ, chợ ồn).

### UC-D6 · Giọng thoại theo kiểu khách (Gen Z, teencode, cô chú) + "thoại mặn" + AI tuỳ chọn ✅ (bản đầu)
**Hệ thống:** 🎭 Bản sắc · 🧠 Hành vi NPC · **Luật:** 10 (bản sắc), 15 (dữ liệu).
**Đời thật:** học sinh "Shop ơi cho em … nha 🥺", "rẻ vãi"; dân văn phòng "nhanh giúp anh, 8h chấm công rồi";
cô chú "bán cho cô … nghen con", "hồi xưa có mấy ngàn hà"; reviewer "chấm 8.5/10".
**Luật game:**
- `content.voice.voices`: mỗi kiểu khách có câu gọi món (`{dish}`), câu khen rẻ / chê đắt / cảm ơn / bỏ đi; thiếu thì dùng câu chung.
- **Thoại mặn** (Cài đặt ⚙️, mặc định bật): câu có thể hơi suồng sã ("vãi", "xỉu ngang"); tắt thì client đổi từ theo
  `content.voice.soften` ngay khi nhận (`soften` trong sim) — áp cho lời gọi món, lời khách, khung thoại.
- **AI tuỳ chọn** (server có `ANTHROPIC_API_KEY`): game **không bao giờ chờ AI** — trả ngay câu dữ liệu hoặc câu AI đã sinh sẵn;
  kho thiếu thì nạp ngầm (claude-haiku-4-5, tối đa 30 lần gọi/giờ, timeout 8s); câu AI phải một dòng, ≤ 120 ký tự,
  không dính từ tục nặng mới dùng; lỗi thì chỉ dùng dữ liệu. Áp cho lời khách khi trả tiền/bỏ đi và đánh giá NPC.
**Kiểm chứng:** unit `progression.test.ts` (voiceAsk, voiceLine, soften); e2e server `voice.e2e-spec.ts` (giọng gọi món, AI giả:
kho nạp ngầm, lọc câu bẩn, lỗi thì quay về dữ liệu).
**Chưa:** giọng riêng cho người bán NPC (Bà Năm, Chú Bảy…), thoại theo thời tiết/sự kiện.

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

### UC-E5 · Đứng trước quầy: chân dung người bán + ô thoại ✅ (bản đầu)
**Ai:** người chơi tới mua / nói chuyện ở sạp NPC (xôi, phở…), chợ Bà Năm, vựa xe Ông Sáu, hoặc quầy của hàng xóm.
**Luồng:** tới nơi → bottom sheet mở như cũ (thực đơn, giá, nút mua). **Phía trên sheet**, trên nền bản đồ, có **chân dung người bán** (tròn, có tên) và **ô thoại** của họ: câu rao / lời chào → chọn món ở quầy hàng xóm thì câu mình dặn ("cho mình bánh mì thịt, không hành") hiện **bên phải** (bong bóng tối), chủ quầy "xác nhận" món + giá bên trái. Nói chuyện với Bà Năm: câu hỏi của mình bên phải, câu trả lời mới nhất bên trái; các câu cũ lùi xuống lịch sử trong sheet.
**Đời thật:** đứng trước quầy là nhìn mặt người bán, nghe họ nói — không phải đọc một danh sách khô; sạp nhỏ thì người bán rao, quầy hàng xóm thì chủ quầy chào khách.
**Luật:**
- Ảnh chân dung là render từ đúng model nhân vật đang đứng trong cảnh 3D (`art/blender/chan_dung.py` → `public/portraits/*.webp`, 160px, ~5KB/ảnh). Dáng người bán sạp là dữ liệu: `vendors[].seller` trong `packages/content`; hàng xóm theo `modelFor(playerId)` (cùng hàm với cảnh 3D).
- Lời chào / xác nhận ở quầy hàng xóm là dữ liệu `counterLines` (`{dish}`, `{price}`); lời sạp NPC lấy từ `vendors[].lines`, lời Bà Năm / Ông Sáu từ `places[].keeper`.
- Đang mở khung thì khung thoại 3D trên đầu người bán và của chính mình **ẩn đi** (tránh lặp chữ); người khác trong xóm vẫn thấy bình thường.
- Không thêm nút lên HUD (Luật 12.1): khung chỉ hiện khi sheet đang mở và nằm trong cùng hộp thoại (trình đọc màn hình đọc "Bà Năm: …", "Bạn: …").
**Kiểm chứng:** Playwright `an-sang` (chân dung Bà Bảy + câu rao trước sạp xôi), `ky-nang` (nói chuyện với Bà Năm: câu "Chào hỏi" bên phải, chân dung Bà Năm), `mua-cua-nhau` (chân dung An, câu dặn "không hành" bên phải, chủ quầy xác nhận món).

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
> **Quầy dạng lưới ✅ (1.11):** theo góc nhìn người bán (ảnh tham khảo của chủ dự án) — chồng ly **M/L** (số còn lại), dãy **bình trà có vòi**
> (Trà sữa / Trà xanh / Hồng trà), **máy dán miệng ly**, ô **PHA LY** hiện các lớp đã cho vào, dải **Đường/Đá** bằng chữ, **lưới khay topping 4×3**
> (ô chưa có hàng mờ, ô chưa mở 🔒), **giữ để lắc**, **giao món**. Bố trí là dữ liệu (`product.counter`: mỗi khu gắn một bước công thức, content kiểm
> khu đúng loại bước và phủ đủ mọi bước) → nghề khác (cà phê, nước mía…) dùng lại được. Kiểm chứng: Playwright `tra-sua.spec.ts`.
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

### UC-F11 · Sổ đánh giá quầy + chủ quầy trả lời ✅ (bản đầu)
**Hệ thống:** ⭐ Uy tín · 🏪 Làm ăn · 🤝 Xã hội · **Luật:** 4 (danh tiếng thấy được), 7 (đánh giá → khách → doanh thu), 14 (server kiểm đã mua).
**Đời thật:** ăn xong khách lên Google Maps/nhóm Zalo khu phố chấm sao, chê chờ lâu, khen rẻ; chủ quán khéo thì vào trả lời,
xin lỗi đàng hoàng — người đọc thấy quán có tâm.
**Luồng:**
- Khách NPC tính tiền xong có ~30% viết đánh giá (khách sộp, reviewer luôn viết); khách chờ lâu bỏ đi ~35% chấm 1–2★.
  Sao theo độ hài lòng; câu theo đúng chuyện vừa xảy ra (sai món, thối thiếu, đắt, chậm, rẻ, nhanh) — `content.reviews.lines`.
- Chủ quầy: ☰ Menu → *📒 Đánh giá* của cửa hàng đang quản lý (đổi cửa hàng ở thanh chọn trên đầu sheet) (điểm trung bình, phân bố sao, 20 đánh giá mới nhất) → *💬 Trả lời*: chọn câu nhanh hoặc tự viết.
  Đánh giá ≤ 2★ hoặc của hàng xóm thì có thông báo.
- Hàng xóm: bảng gọi món quầy hàng xóm hiện *★ 4.2 (15 đánh giá)*; vừa mua xong thì mở ra là ô chấm sao + viết vài chữ.
**Luật game:** chỉ người đã mua ở quầy hôm nay mới viết được, mỗi ngày một lần mỗi quầy, không tự đánh giá mình;
trả lời mỗi đánh giá một lần; trả lời đánh giá ≤ 3★ thì uy tín quầy +1% và *Ăn nói* +1; chữ người chơi viết tối đa 140 ký tự,
từ tục bị che `***`. **Mỗi cửa hàng một sổ riêng** (2026-10-03, góp ý đợt 2): `Review.businessId`, uy tín gỡ lại cũng chỉ của
cửa hàng đó; đổi món ở cùng cửa hàng vẫn giữ sổ; đánh giá cũ được gắn vào cửa hàng cùng món của chủ (migration).
**Kiểm chứng:** unit `progression.test.ts` (sao, tình huống, che từ, trung bình); e2e server `reviews.e2e-spec.ts` (+ cửa hàng
thứ hai có sổ trống riêng);
Playwright `mua-cua-nhau.spec.ts` (Bình chấm 4★, An trả lời).
**Chưa:** đánh giá ảnh hưởng lượng khách mới (hiện qua uy tín), báo cáo đánh giá sai sự thật.

---

### UC-F12 · Mở tiệm theo quy trình đời thật ✅ (bản đầu)
> Góp ý: "mở tiệm khi đủ vốn, đặt tên quán" + "research cách thức hoạt động ngoài đời". Tham khảo: thủ tục mở quán ăn nhỏ
> (đăng ký hộ kinh doanh ở cơ quan cấp huyện 3–5 ngày, giấy chứng nhận cơ sở đủ điều kiện ATTP có kiểm tra thực tế, nhân viên tập
> huấn + khám sức khoẻ), kinh nghiệm thuê mặt bằng (cọc 3–6 tháng, giữ vốn dự phòng 3–6 tháng), biển hiệu + khai trương.

**Luồng (Làm ăn → 🏪 Mở tiệm, có checklist ✅ từng bước, dự toán trước):**
1. **📝 Ký hợp đồng thuê nhà mặt tiền** — cọc **3 ngày tiền thuê** (ví giữ hộ, trả nhà thì hoàn), chủ nhà chỉ cho thuê khi còn
   **vốn dự phòng ≥ 2 ngày tiền thuê**; đồ nghề dọn vào nhà. Tiền nhà **tính mỗi ngày dù mở hay đóng** **từ ngày sau
   ngày ký** (ngày ký có thể đã trả tiền chỗ xe đẩy); **chủ nhà tới đòi** — trả ngay / hẹn ngày / trễ thì trừ cọc, trễ nhiều thì dẹp
   tiệm (UC-F13). Đang thuê nhà
   thì **không dọn quầy ra vỉa hè** (tránh vừa tiền nhà vừa tiền chỗ) — muốn ra thì trả nhà (hoàn cọc).
2. **🏛️ Đăng ký hộ kinh doanh ở UBND phường** — **đặt tên quán** (3–24 ký tự, chữ/số, không trùng trong xóm), lệ phí 100k,
   **chờ xét 3 giờ game** (báo 🏛️ khi duyệt); ghi 📖 *Đăng ký hộ kinh doanh: quán "…" ra đời*.
3. **🧑‍🍳 Giấy ATTP** (chỉ quán ăn uống — bánh mì, trà sữa; sạp phụ kiện, sửa xe không cần): **tập huấn** (150k) → **hẹn đoàn
   kiểm tra** (tới sau 1,5 giờ game) → đoàn tới báo 👮, **chủ phải có mặt ở tiệm trong 60 phút** (trước cửa hoặc trong tiệm) bấm
   *Đón đoàn* → cấp giấy; vắng mặt thì đoàn về, phải hẹn lại.
4. **🪧 Biển hiệu tên quán** (200k) — ngoài phố căn nhà treo biển **tên quán** thay cho "BÁNH MÌ <TÊN NGƯỜI CHƠI>".
5. **Mở tiệm** — ngay trong tiệm có nút **🔓 Mở cửa tiệm**; mở tiệm **không trả tiền chỗ** (tiền nhà đã tính theo hợp đồng), chỉ
   **thuế khoán** ngày có mở + điện nước theo giờ; có nhân viên thì tới ca **nhân viên tự mở cửa** (UC-M6). Ngoài phố có biển chính
   trên mặt tiền + **biển vẫy** vuông góc (nhìn dọc phố vẫn đọc được tên quán). Muốn rình rang thì *tổ chức khai trương* (UC-K).
> Góp ý chơi thử (rà lại): trước đây mở tiệm bị trừ cả "tiền chỗ" như xe đẩy dù tiền nhà đã tính theo hợp đồng, ngày ký bị tính
> tiền nhà dù đã trả tiền chỗ xe đẩy, đang thuê nhà vẫn dọn ra vỉa hè được (trả hai lần) — đã sửa, server e2e `shop-flow`.
**Luật game:** nhà mặt tiền **không khoá theo cấp nữa** — mở bằng vốn + giấy tờ; chọn nhà ở *Chỗ bán* chỉ được khi đang thuê
đúng căn đó; mở tiệm thiếu giấy nào server báo đúng giấy đó; mọi khoản qua sổ cái (`lease_deposit`, `lease_refund`,
`license_fee`, `food_training`, `sign`, `rent`, `rent_from_deposit`); đo lường `shop_lease`, `shop_register`, `shop_certified`,
`shop_unlease` (kèm trả / bị lấy nhà).
**Dữ liệu:** `content.shopSetup`; Prisma `Lease` (ACTIVE / ENDED / EVICTED), `Business.shopName / licenseAt / trained /
inspectAt / certified / signed`; sim `shopEstimate`, `needsFoodCert`, `shopNameError`, `normalizeShopName`, `nextShopStep`.
**Kiểm chứng:** sim `shop.test.ts`; e2e server `shop.e2e-spec.ts` (đi hết quy trình, tên bậy bị từ chối, chưa giấy không mở được,
đón đoàn phải ở tiệm, biển tên quán ngoài phố, trả nhà hoàn cọc; hết tiền trừ cọc rồi bị lấy nhà); Playwright `mo-tiem.spec.ts`;
`tiem-rieng.spec.ts` dùng lệnh dev `debug:shop`.
**Sau này:** gia hạn / tăng giá nhà, khám sức khoẻ nhân viên, đoàn kiểm tra đột xuất phạt khi đồ hỏng, thuế khoán theo doanh thu,
đổi tên quán (làm lại biển), tiệm thứ hai (chuỗi).

## G. Dịch vụ sửa xe (nghề mới, template SERVICE — docs/NGHE.md §3.1)


> **Cân lại kinh tế tiệm (2026-10-02, góp ý "luôn lỗ, tiền nhà 100k/ngày không có lãi"):** sổ cái thật 10 ngày ở Nhà số 10 (sạp
> phụ kiện, Dì Sáu cả ngày) lỗ ~92k/ngày — tiệm có **cùng lưu lượng khách như xe đẩy đầu hẻm** mà chi phí cố định gấp ~4 (tiền nhà +
> thuế khoán + điện nước). Ngoài đời mặt tiền bù bằng **đông khách hơn** (dễ thấy, có chỗ ngồi, biển hiệu) và **khách chịu giá cao
> hơn** (ngồi quán). Nay: nhà số 10 lưu lượng ×1,5, nhà số 24 ×1,25; `lot.priceTolerance = 1,2` — ở tiệm, giá "hợp lý" = giá tham
> khảo × 1,2 (cầu, chấm điểm khách, nhận xét "đắt", gợi ý giá trong thực đơn đều tính theo giá này). Tiền nhà giữ nguyên, giờ chỉ
> ~6–12% doanh thu. `pnpm balance` có bảng **Tiệm**: tiệm tự bán phải lãi hơn xe đẩy tốt nhất, thuê nhân viên cả ngày phải có tiệm
> lãi, nhân viên không hơn chủ; trần lãi theo bậc (xe đẩy ≤ 5 lần làm thuê, tiệm ≤ 6,5 lần).


### UC-F13 · Đòi tiền nhà — chủ nhà tới nhắc, hẹn ngày, dẹp tiệm ✅ (bản đầu)
> Góp ý: "sắp tới hạn trả tiền thuê → thông báo đòi tiền (trả ngay hoặc hẹn ngày); không trả thì chủ nhà tới dẹp tiệm; lúc thu
> tiền hiện modal có chân dung chủ nhà + bong bóng thoại" · "nên hẹn **ngày** trả chứ không hẹn giờ".

**Nhân vật:** mỗi nhà mặt tiền một chủ nhà (`content.shopSetup.rent.landlords`): **Cô Tư Hường** (nhà số 10 — hiền, hay than tiền
điện) · **Chú Năm Lộc** (nhà số 24 — mặt tiền ngã tư, nói thẳng). Câu thoại theo tình huống: nhắc / tới hẹn / cho hẹn / cảm ơn /
trừ cọc / dẹp tiệm.

**Luồng:**
1. Tiền nhà tính **mỗi ngày** từ sau ngày ký (ngày ký không tính), **dù mở hay đóng**; không còn tự trừ mỗi tối.
2. **17:00** còn nợ → **chủ nhà tới**: modal 🏠 *Chủ nhà tới đòi tiền nhà* — chân dung + bong bóng thoại ("Con ơi, tiền nhà
   105.000đ nghen…"), bảng tiền nhà (tiền/ngày, đã trả tới, đang nợ, cọc còn, trễ x/3 lần), chọn **💵 Trả ngay** (chọn 💵/🏦 như
   mọi khoản), **🗓️ Hẹn tới Thứ Tư, ngày 7 · phí trễ 11k** (tối đa 2 ngày, phí 10% số nợ × số ngày hẹn), hoặc **Để sau**.
3. **Hẹn theo NGÀY, không theo giờ:** trong ngày hẹn trả lúc nào cũng được (17:00 ngày hẹn chủ nhà ghé nhắc *"hôm nay tới hẹn rồi
   nghen"*); **qua ngày hẹn** chưa trả là **thất hẹn**.
4. **Chưa hẹn mà quá 20:00** (hoặc **thất hẹn**) → chủ nhà **trừ (nợ + phí trễ) vào cọc**, tính **1 lần trễ**, **🤝 −5 tin cậy**;
   modal ⚠️ *Trễ tiền nhà* + toast.
5. **Trễ lần thứ 3** hoặc **cọc không đủ trừ** → **dẹp tiệm**: mất cọc, đóng tiệm, đồ nghề dọn ra (bán tiếp ở vỉa hè được), mất
   nhà; modal 📦 + **cả xóm nhận tin** *"📦 Cô Tư Hường dẹp "Bánh Mì Cô Tấm" của Tấm ở Nhà số 10 vì nợ tiền nhà"*; ghi 📖 *Bị … dẹp
   tiệm*.
6. Trả bất cứ lúc nào ở **Làm ăn → 🏪 Mở tiệm** (bảng tiền nhà + nút Trả ngay / Hẹn). **Trả nhà** khi còn nợ: chủ nhà trừ nợ vào
   cọc rồi hoàn phần còn lại (cọc không đủ thì phải trả tiền nhà trước).

**Tình huống đời thật:** kẹt vốn (vừa nhập hàng) → xin khất vài bữa, chịu phí; ham bán quên giờ → chủ nhà trừ cọc, lần sau nói
nặng; người thuê "lặn" → chủ nhà giữ cọc, cho người khác thuê.

**Luật game:**
- Chủ tiệm **offline** (chủ nhà không gặp được) và **chưa hẹn** → **không tính trễ**, nợ cộng dồn; chỉ dẹp tiệm khi **nợ vượt
  cọc**. Đã hẹn thì thất hẹn vẫn tính dù offline (hẹn là lời hứa).
- Mọi khoản qua sổ cái: `rent`, `rent_late_fee`, `rent_from_deposit` (cọc → chủ nhà); `GameEvent` `rent_pay`, `rent_promise`,
  `rent_late`, `shop_unlease{status: EVICTED}`. Cọc mất khi bị dẹp tiệm (money sink).
- Số liệu ở `content.shopSetup.rent` (giờ nhắc, hạn, số ngày hẹn, % phí trễ, số lần trễ, tin cậy, chủ nhà + câu thoại); công thức
  thuần ở `packages/sim` (`rentOwed`, `rentLateFee`, `rentPromiseOptions`, `rentShouldRemind`, `rentVerdict`).

**🔁 Tự trả khi tới hạn (góp ý đợt 3, 2026-10-03):** trong bảng tiền nhà (modal chủ nhà và ☰ 🏠 Thuê nhà & giấy tờ) có công tắc
"Tự trả tiền nhà khi tới hạn" (lưu cách trả đang chọn 💵/🏦). Đầu mỗi ngày có nợ thì server tự trả (sổ cái `rent`, báo "🔁 Tự trả
tiền nhà …"); thiếu tiền thì báo một lần trong ngày rồi chủ nhà đòi như thường — không tự vay, không tự hẹn.
**Kiểm chứng:** sim `shop.test.ts` (nợ, phí, hẹn theo ngày, offline, trễ/dẹp) · e2e `rent.e2e-spec.ts` (nhắc → trả; trả nhà khi
nợ trừ cọc; hẹn → cả ngày hẹn không bị đòi → thất hẹn trừ cọc + tin cậy; để sau mãi → trễ 3 lần dẹp tiệm, cả xóm biết, 📖) ·
Playwright `doi-tien-nha` (modal chân dung → hẹn ngày → trả ở 🏪 Mở tiệm).


### UC-F14 · Nhiều cửa hàng, kho riêng từng tiệm, chuyển kho ✅ (bản đầu)
> Góp ý: "đủ tiền thì mở nhiều cửa hàng khác nhau (không phải đổi nghề)"; chốt: **không giới hạn số cửa hàng**, **kho riêng
> từng tiệm**, chuyển kho **bấm chuyển, chờ thời gian**. Kế hoạch: docs/IA.md bước D.

**Luồng:** ở vựa Ông Sáu, đã có quầy thì mỗi đồ nghề có 2 nút: **🏪 Mở thêm cửa hàng** (giữ các quầy cũ, quầy mới thành quầy
đang quản lý) · **🔄 Đổi nghề quầy đang chọn** (bán lại đồ nghề cũ nửa giá, giữ cửa hàng + kho cũ để thanh lý). ☰ Menu →
**🏬 Các cửa hàng**: thẻ từng cửa hàng (món, chỗ, đang bán/đóng, có nhân viên trong ca không) → **Quản lý cửa hàng này**. Mọi
sheet nhóm 🏪 (Quầy, Thực đơn, Kho, Chỗ bán, Nhân viên…) có **hàng chip chọn cửa hàng** trên đầu. **📦 Kho → 🚚 Chuyển sang
cửa hàng khác**: chọn cửa hàng nhận, món, số phần → hàng tới sau **30 phút game** (báo 📦 khi tới). Ở chợ ghi rõ "Nhập hàng
cho: …".

**Luật game:** kho thuộc cửa hàng — nhập chợ vào cửa hàng đang quản lý, làm món / nhân viên bán / làm hàng việc xóm trừ kho
cửa hàng đó; chưa có quầy thì không nhập hàng. Chủ **tự đứng bán một cửa hàng một lúc** (`room.attending`: chủ → cửa hàng),
cửa hàng khác bán được khi có nhân viên trong ca; khách réo / nhân viên bán thay tính theo từng cửa hàng. Đang chở thì hàng
chưa bán được ở đâu. Mỗi cửa hàng thuê được một nhà mặt tiền riêng (từ 2026-10-03 — trước đây mỗi người một căn).
**Đi tới quầy nào thì quản lý quầy đó** (2026-10-03, sửa lỗi "nhiều cửa hàng không chạy cùng lúc được"): trước đây chỉ quầy đang
chọn mới nhận ra chủ đứng quầy → tới quầy thứ hai không mở / bán được. Giờ đứng ở quầy của cửa hàng khác thì tự chọn cửa hàng đó
(toast "🏬 Đang ở … — quản lý cửa hàng này"), mở quầy, bán; quầy cũ có nhân viên trong ca vẫn bán tiếp.

**Sửa lỗi (góp ý đợt 3, 2026-10-03) "đang thuê tiệm thì không mở thêm cửa hàng được":** luật "đang thuê nhà thì trả nhà rồi mới
ra vỉa hè" trước áp cho *người chơi* → mọi cửa hàng khác bị khoá vỉa hè. Giờ chỉ áp cho *cửa hàng đang ở nhà thuê*; cửa hàng
khác đặt ra vỉa hè bình thường. **Thuê nhiều nhà mặt tiền:** mỗi cửa hàng thuê căn riêng — hợp đồng nhận theo căn nhà cửa hàng
đang đặt; ☰ 🏠 Thuê nhà & giấy tờ làm việc với cửa hàng đang quản lý; cửa hàng đã ở nhà thuê thì muốn thuê thêm phải chọn cửa
hàng khác.
**Kiểm chứng:** e2e `shops.e2e-spec.ts` (mở thêm, kho riêng, chọn, chuyển kho có thời gian, không chuyển/chọn cửa hàng người
khác, đổi nghề giữ kho; đứng quầy theo cửa hàng) · Playwright `nhieu-cua-hang` (+ đi về quầy bánh mì tự chuyển cửa hàng, mở lại).

### UC-F15 · Quầy theo mặt hàng: sheet Quầy gọn thành thẻ việc, chợ chỉ hàng của quầy ✅ (bản đầu)
> Góp ý đợt 2 (2026-10-02): "bấm vào quầy nào thì chỉ còn đúng việc của quầy đó — nhập hàng, thuê nhân viên, giá; gom bớt
> dãy nút".

**Luồng:** 🏪 Quầy của tôi → dưới nút Mở/Đóng quầy là **4 thẻ to** của quầy đang chọn, mỗi thẻ ghi tình trạng:
🧺 **Nhập hàng** ("Còn làm được N phần" / đỏ "Hết nguyên liệu …") → tự đi ra chợ, chợ mở sẵn tab nguyên liệu món của quầy ·
🍽️ **Thực đơn & giá** ("x/y món đang bán") · 👩‍🍳 **Nhân viên** ("n/tối đa người") · 📍 **Chỗ bán** (tên chỗ / đỏ "Chưa chọn
chỗ"). Thẻ mở sheet có ‹ Quay lại về Quầy. Kho hàng, Khai trương, Công thức còn ở hàng nút nhỏ cuối sheet.
**Chợ** chỉ hiện nguyên liệu của quầy đang chọn ("📦 Nguyên liệu cho quầy 🥖 Bánh mì"); hàng nghề khác gom sau nút **🧺 Xem hàng
khác** (chưa có quầy thì hiện hết theo tab nghề).
**Mở cửa hàng:** vựa xe Ông Sáu ghi "🏪 Mở cửa hàng: chọn mặt hàng bán", mỗi thẻ đồ nghề có nhãn mặt hàng → **🏪 Mở thêm cửa
hàng** xong thì mở luôn **📍 Chỗ bán** cho cửa hàng mới (mặt hàng → đồ nghề → chỗ). Cửa hàng đầu tiên vẫn theo lời Chú Bảy.
**Luật game:** chỉ là giao diện — mọi việc vẫn qua chức năng sẵn có (server kiểm như cũ).
**Kiểm chứng:** Playwright `quay-viec` (4 thẻ có tình trạng, Thực đơn + Quay lại, Nhập hàng ra chợ chỉ hàng của quầy, Xem hàng
khác), `nhieu-cua-hang` (mở thêm cửa hàng → sheet Chỗ bán).
**Chưa:** một mặt hàng có nhiều đồ nghề (xe đẩy / tủ lớn) để chọn; chỗ bán gợi ý theo khu hợp mặt hàng.

### UC-G1 · Mở tiệm sửa xe ✅ (bản đầu)
**Luồng:** vựa xe Ông Sáu bán *Xe đồ nghề sửa xe* (900k) → mua **phụ tùng** ở chợ (tab 🔧 Sửa xe: miếng vá, ruột xe, bugi, má phanh, bóng đèn) → thuê chỗ, mở tiệm như xe đẩy.
**Luật:** phụ tùng không hỏng theo ngày nhưng vốn lớn (ruột xe 55k/cái). Biển hiệu "SỬA XE {tên}". Khách đông buổi sáng/chiều tan tầm.
**Chưa:** *Tiệm phụ tùng Chú Chín* riêng + Chú Chín dẫn nghề; model xe đồ nghề riêng (đang mượn model sạp).

### UC-G2 · Khách dắt xe tới ✅
**Luồng:** khách tới, nói **triệu chứng** chứ không nói bệnh: *"Bánh sau xẹp lép rồi con ơi"*, *"Đạp hoài không nổ máy"*, *"Thắng kêu két két"*.
**Đời thật:** một triệu chứng có thể do nhiều bệnh — *bánh sau xẹp* có thể là đinh cắm (vá được) hoặc rách ruột (phải thay).
**Dữ liệu:** `products[sua_xe].recipe.variants[].symptoms` (7 bệnh: lủng lốp, rách ruột, non hơi, hỏng bugi, mòn má phanh, cháy đèn, chùng xích).

### UC-G3 · Chẩn đoán ✅
**Luồng:** khung **🔍 Kiểm tra xe** với 6 bộ phận (lốp trước, lốp sau, bugi, xích, phanh, đèn) → chạm một bộ phận → *"Đang xem…"* ~1,2 giây → kết quả: chỗ có bệnh tô đỏ (*"Có cây đinh cắm ở lốp sau, lỗ nhỏ — vá được"*), chỗ khác *"Bình thường"*.
**Luật (server quyết định):** intent `order:inspect` — server mới biết bệnh và trả kết quả; kiểm tra quá 3 chỗ thì mỗi lần khách bớt ~6 giây kiên nhẫn (*"khách bắt đầu sốt ruột…"*). Nghe triệu chứng mà xem đúng chỗ là nhanh nhất.

### UC-G4 · Sửa & chạy thử ✅ (bản đầu)
**Luồng:** các bước tay: *🔧 Tháo ra* → **Cách sửa** (vá ruột / thay ruột / bơm hơi / thay bugi / thay má phanh / thay bóng đèn / tăng xích — lấy phụ tùng trong kho) → *🔩 Lắp lại* → *🛵 Nổ máy thử* → **🛵 Giao xe cho khách chạy thử**.
**Rẽ nhánh:**
- Sửa đúng → *"Máy nổ giòn rồi! Hay quá con!"* → tính tiền (tiền mặt thì thối).
- Sửa sai bệnh → *"Ủa chạy thử vẫn y chang à… chưa đúng bệnh rồi!"* — phụ tùng đã thay thì mất → **🔁 Kiểm tra lại, sửa tiếp** hoặc **💸 Lấy nửa tiền công**.
**Chưa:** báo giá & trả giá trước khi sửa, bảo hành (sửa ẩu 1–2 ngày sau khách quay lại), thay phụ tùng không cần thiết bị phát hiện, khách xin khất nợ, mưa thì nhiều xe hư.
**Kiểm chứng:** sim `recipe.test.ts` (triệu chứng, kết quả kiểm tra, chấm sai bệnh, phụ tùng tiêu hao); e2e server `repair.e2e-spec.ts` (kiểm tra 6 bộ phận, bộ phận lạ bị từ chối, sửa sai → "vẫn hư", sửa đúng → tính tiền); Playwright `sua-xe.spec.ts` (mua xe đồ nghề, phụ tùng, mở tiệm, kiểm tra đúng lốp, sửa sai rồi sửa đúng, thối tiền). `pnpm balance`: tiệm sửa xe ~18 khách/ngày, lãi ~367k (ngang trà sữa / phụ kiện).

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

### UC-W6 · Tiệm riêng — thuê một căn nhà mặt tiền, có không gian quán như Cô Tư 🚧 (thuê + giấy tờ: UC-F12)
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
**Đã làm (bản đầu):** 2 nhà mặt tiền cho thuê (số 10 phố chính 105k/ngày, số 24 cạnh ngã tư đông 210k/ngày) trong danh sách Chỗ bán;
ngoài phố căn nhà có mái hiên + biển "🏪 BÁNH MÌ <TÊN>"; đứng trước cửa bấm "🏪 Vào tiệm" → cảnh trong tiệm (quầy, đồ bày, bàn ghế,
camera xoay được), khách đi từ cửa vào xếp hàng, khung thoại gọi món, nhận món xong đi ra; "👨‍🍳 Làm món cho khách" dùng màn làm món,
"📖 Công thức" ngay trong tiệm. **Chưa:** khách ngồi ăn tại bàn, thuê người phụ. (Bảng quầy dạng lưới cho trà sữa: ✅ 1.11, xem UC-F5.)
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
**Vốn người mới:** 1.500.000đ tiền mặt + **1.000.000đ dự phòng sẵn trong 🏦** (`economy.startingBank`, góp ý chơi thử: mua xe xong chỉ còn ~300k, khó sống) — rút ở ATM khi cần, mua món lớn thì chuyển khoản.
**Luồng:** khách trả chuyển khoản → tiền vào 🏦; khách trả tiền mặt (+ tiền boa) → 💵. Hàng xóm mua của nhau: chuyển khoản nếu tài khoản đủ,
không thì trả tiền mặt. HUD chỉ hiện 💵; 🏦 xem ở Hồ sơ (*🚶 Tới cây ATM gần nhất*) hoặc bảng ATM. Tới cây ATM (ô **N** trên bản đồ: cạnh chợ Bà Năm,
giữa phố gần quán cơm) → *🏧 Rút / gửi tiền · ATM* → chọn số tiền (bội số 10.000đ).
**Luật game:** ví tiền mặt cũ giữ nguyên số dư (migration `bank_account` chỉ thêm loại ví `PLAYER_BANK` + cột lãi); tài khoản `bank:<id>` tạo dần,
không bao giờ âm; ATM chỉ chuyển giữa hai ví của chính mình qua sổ cái (`atm_deposit`/`atm_withdraw`), phải đứng trong 3 m (server kiểm);
cuối ngày lãi 0,2% cho số dư từ 100k, **tối đa 3.000đ/ngày**, làm tròn xuống 500đ (`bankInterest` trong sim) — có trong báo cáo cuối ngày.
**Kiểm chứng:** unit `economy.test.ts` (lãi, trần, bội số ATM); e2e server `bank.e2e-spec.ts` (chuyển khoản vào 🏦, tiền mặt vào 💵, ATM xa/gần,
bội số, rút quá số dư, lãi có trần); Playwright `atm.spec.ts`.
**Máy ATM như thật (bản 2, modal):** màn hình xanh + bàn phím (Huỷ đỏ / Xoá vàng / Đồng ý xanh) + khe thẻ, khe tiền:
*💳 Đưa thẻ vào* → lần đầu **tạo PIN 6 số** (nhập 2 lần; không 6 số giống nhau, không dãy liên tiếp — `pinError`) → **nhập PIN**
→ menu *Rút tiền · Nộp tiền · Xem số dư · Đổi PIN · Nhận lại thẻ* → chọn số tiền (hoặc *Số khác*, nhập theo nghìn đồng)
→ màn xác nhận (rút: **phí 1.000đ/lần** trừ vào tài khoản) → *Máy đang đếm tiền…* → *Mời nhận tiền* → *In biên lai?* (mã GD FTxxx…,
máy, ngày giờ game, số tiền, phí, số dư) → *Giao dịch khác?* → *Nhận lại thẻ*.
**Luật PIN (server):** PIN băm sha256 kèm id người chơi, không lưu thô; mọi giao dịch phải gửi kèm PIN; sai **3 lần** máy giữ thẻ tới hết
ngày game (`Player.atmLockDay`, migration `atm_pin`); đổi PIN phải đúng PIN cũ. e2e `bank.e2e-spec.ts` (tạo/đổi PIN, phí, biên lai, giữ thẻ).
**Model 3D:** cây ATM vẽ bằng Blender (`cay_atm` trong `art/blender/nha_que.py` → bundle village "cay-atm", ~200 tam giác, 1 material,
vẽ instanced): bệ đá, thân tủ xanh ngân hàng, băng vàng, màn hình lõm, bàn phím nghiêng, khe thẻ/tiền/biên lai, mái che + đèn LED, camera;
biển "🏧 XÓM BANK".
**Chưa:** phòng giao dịch + quầy giao dịch viên (mở thẻ, cấp lại PIN khi bị giữ thẻ), chuyển tiền tự do giữa người chơi.

### UC-I8 · Trả bằng gì: 💵 tiền mặt / 🏦 chuyển khoản / tự chọn ✅ (bản đầu)
**Hệ thống:** 💰 Kinh tế · **Luật:** 2 (tách tiền mặt / ngân hàng), 14 (server kiểm ví, kiểm sạp nhận gì).
**Đời thật:** mua ổ bánh mì, gói xôi thì móc tiền mặt; mua xe, trả tiền nhà thì quét mã chuyển khoản. Sạp xôi, cà phê cóc
không có mã QR — chỉ nhận tiền mặt. Hết tiền mặt thì chuyển khoản, hoặc ra cây ATM rút.
**Luồng:** ở chợ Bà Năm, vựa xe Ông Sáu, sạp ăn, quầy hàng xóm có dòng *Trả bằng · 💵 … · 🏦 …* với 3 ô
*Tự chọn* · *💵 Tiền mặt* · *🏦 Chuyển khoản* (nhớ lựa chọn trên máy). Sửa xe, khai trương dùng luôn lựa chọn đó.
**Luật game (`choosePayment` trong sim, server và client dùng chung):**
- *Tự chọn* (mặc định): dưới 200k trả tiền mặt trước, từ 200k chuyển khoản trước; ví ưu tiên thiếu thì dùng ví kia.
  Tiền thuê chỗ + phí chợ khi mở quầy luôn theo *tự chọn*.
- Chọn tay thì chỉ dùng ví đó; thiếu thì báo cách gỡ ("Không đủ tiền mặt — chọn chuyển khoản hoặc ra cây ATM rút").
- Sạp `cashOnly` (xôi Bà Bảy, cà phê cóc) khoá ô chuyển khoản.
- Trả bằng chuyển khoản thì hiện "🏦 Đã chuyển khoản …đ".
- Gọi món ở quầy hàng xóm: chọn 🏦 thì tiền vào tài khoản chủ quầy; trả 💵 thì đưa một tờ (tờ nhỏ nhất đủ trả), chủ quầy
  phải thối lại như khách thường.
**Kiểm chứng:** unit `economy.test.ts` (choosePayment); e2e server `pay.e2e-spec.ts`, `xom.e2e-spec.ts`; Playwright `tra-tien.spec.ts`.

### UC-I7 · Chỗ tiêu bắt buộc: phí chợ/thuế, điện nước, hao mòn + sửa xe, thanh lý hàng ✅ (bản đầu)
**Hệ thống:** 💸 Money sink · 🏪 Làm ăn · **Luật:** 2.2 (mỗi nguồn thu có chỗ tiêu), 7 (rủi ro làm ăn), 14 (sửa xe/thanh lý phải tới nơi).
**Đời thật:** bán vỉa hè thì đóng phí chợ/vệ sinh cho ban quản lý; mở tiệm thì có thuế khoán và tiền điện nước hằng tháng;
xe đẩy bán nhiều thì bánh xe rơ, kính nứt — để lâu khách ngại ghé, bán chậm, hư hẳn thì phải dắt đi sửa; đổi nghề thì đồ cũ bán đổ bán tháo.
**Luật game:**
- Mở quầy lần đầu trong ngày: thuê chỗ **+ phí chợ 5k (xe đẩy) / thuế khoán 15k (tiệm)** — trả một lần/ngày.
- Tiệm (nhà mặt tiền) trả **điện nước 3k mỗi giờ mở cửa**; hết tiền mặt thì trừ tài khoản, hết cả hai thì tiệm tạm đóng.
- **Hao mòn**: mỗi món bán xe mòn 0,6%; từ 50% là "ọp ẹp" (khách ×0,85, nút giữ lâu ×1,6); 100% là hư, không mở được.
  Sửa ở **vựa xe Ông Sáu** (phải đứng đó, đóng quầy): giá = giá xe × độ mòn × 12%, tròn nghìn (xe bánh mì 1,2tr mòn 50% ≈ 72k).
- **Thanh lý hàng tồn** ở chợ Bà Năm: bán hết một loại với 40% giá gốc (tròn 500đ).
- Mọi khoản trên vào báo cáo cuối ngày (dòng "Phí chợ, điện nước, sửa xe, sự kiện"); `pnpm balance` tính phí ngày, điện nước,
  tiền sửa chia theo món → lãi các nghề giảm ~20%, không chiến lược nào "giàu không giới hạn".
**Kiểm chứng:** unit `economy.test.ts` (mòn, tình trạng, tiền sửa, thanh lý); e2e server `sinks.e2e-spec.ts`, `resale.e2e-spec.ts`;
Playwright `thanh-ly.spec.ts`. **Chưa:** quỹ xóm nhận phí để làm công trình chung (UC-K8), lương nhân viên, xăng xe.

---

## J. Nhiều người chơi (Phase 2)

### UC-J1 · Mời bạn vào xóm ✅
**Luồng:** chạm 👥 trên thanh trên → bảng *Xóm*: mã xóm 8 ký tự + nút *📨 Mời bạn* (Web Share → Zalo/Messenger; máy không có thì chép link).
Bạn mở link `/play?xom=<mã>` → chưa có tài khoản thì đăng ký (form báo "📨 Bạn được mời vào xóm…") → **vào thẳng xóm được
mời** (còn chỗ). Đã có tài khoản thì vào game xong bảng Xóm **tự mở** với lời mời → bấm *Vào xóm*. Hoặc nhập mã tay trong bảng Xóm.
Mở game qua `http://IP-mạng-nhà` (không HTTPS, không Web Share / clipboard): chép bằng cách cũ, không được thì **hiện ô link** để tự
chép (lỗi cũ: bấm "Mời bạn" chỉ hiện toast thoáng qua → tưởng không hoạt động).
**Đời thật & rẽ nhánh:**
- Đang mở quầy (bất kỳ cửa hàng nào, kể cả nhân viên đang bán) / đang trong ca → phải đóng quầy, ra ca trước.
- Mang theo tiền, hàng tồn, xe hàng. Chỗ bán cũ đã có hàng xóm dùng → phải chọn chỗ khác.
- Mỗi xóm có đồng hồ riêng: vào xóm lệch ngày thì hàng tồn, sổ sách, tiền thuê dời theo ngày xóm mới (hàng không tự hỏng hay tươi lại).
- Mã sai → "Không có xóm nào mã này"; xóm đủ 30 người online → đợi; đủ 40 cư dân → "kín nhà" (`economy.xomOnline/xomResidents`).
**Kiểm chứng:** e2e server `xom.e2e-spec.ts`, `xom-chung.e2e-spec.ts`; Playwright `xom-chung.spec.ts` (2 người, iPhone 16 Pro + Pixel 7).

### UC-J7 · 🏘️ Xóm chung — hết cảnh mỗi người một xóm ✅ (bản đầu, HANDOFF 3.8)
**Luồng:** đăng ký không có link mời → **tự dọn về xóm còn chỗ đông cư dân nhất** (để xóm nhộn nhịp); tick *Lập xóm riêng* thì có
xóm mới. Bảng 👥 Hàng xóm → **🏘️ Các xóm khác**: mã, cư dân, online, số quầy, ngày → *Dọn về* (xóm kín nhà thì khoá).
**Luật game:** tối đa 40 cư dân / 30 online một xóm (content `economy`); chuyển xóm giữ tiền, hàng, xe như UC-J1.
**Chưa:** tên xóm, bảng tin xóm lưu tin nhắn + tin tự động.
**Kiểm chứng:** e2e server `xom-chung.e2e-spec.ts` (link mời vào thẳng, mã sai bỏ qua, tự xếp xóm, danh sách, dọn về);
Playwright `xom-chung.spec.ts`, `mua-cua-nhau`, `thue-chup-anh` (người thứ hai vào thẳng xóm qua link).

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

### UC-J5 · Quỹ xóm + công trình chung (đề xuất → bỏ phiếu → góp quỹ → thi công → nghiệm thu) ✅ (bản đầu)
**Hệ thống:** 🤝 Xã hội · 💸 Money sink · 🎲 Sự kiện do người chơi tạo · **Luật:** 2.2 (chỗ tiêu chung), 9 (sự kiện người chơi tạo),
13 (nhiều người chơi), 15 (dữ liệu).
**Đời thật:** xóm họp tổ dân phố bàn đổ bê tông hẻm, dựng đèn đường, bắc cầu qua mương; nhà nhà góp tiền theo khả năng,
tổ trưởng giữ quỹ, thuê thợ làm vài ngày rồi cả xóm ra nghiệm thu.
**Luồng:** *Hàng xóm* → *🏗️ Quỹ xóm*:
- Đầu sheet: số dư quỹ + nút *Góp 10k/50k/100k/500k* (chọn 💵/🏦 như mọi khoản trả).
- Tab **📋 Đề xuất**: 6 công trình (`content.projects`) — lý do đời thật, giá, số ngày thi công, chỗ bán được hưởng;
  công trình nâng cấp phải làm cái trước (cầu tre → cầu bê tông).
- Tab **🗳️ Đang bàn / làm**: thẻ đề xuất có 👍 Thuận / 👎 Chống, hạn bỏ phiếu; qua rồi thì thanh "còn thiếu …đ";
  đang thi công thì "nghiệm thu ngày N". Tab **✅ Đã xong**.
**Luật game:**
- Quỹ = ví sổ cái `fund:<xóm>` (không âm): 60% phí chợ/thuế khoán mỗi ngày + tiền hàng xóm góp (không rút ra được).
- Mỗi lúc một đề xuất đang bỏ phiếu; người đề xuất tự thuận. Kiểm phiếu khi cả xóm đã bỏ hoặc hết 4 giờ game:
  thuận > chống thì qua (xóm một người tự quyết).
- Qua → chờ quỹ đủ → trừ quỹ, thi công `buildDays` ngày → nghiệm thu: khách ở các chỗ bán liên quan ×`demand.mult` (nhân dồn).
- Mọi bước báo cho cả xóm (đề xuất, kết quả phiếu, khởi công, nghiệm thu, ai góp bao nhiêu).
**Kiểm chứng:** unit `projects.test.ts`; e2e server `projects.e2e-spec.ts`; Playwright `quy-xom.spec.ts`.
**Chưa:** công trình hiện trên bản đồ 3D (đường lát, đèn, cầu), mở rộng đất/lô bán mới, hạng mục "Người vì xóm" trong Bảng xóm.

### UC-J6 · 🏗️ Phụ hồ công trình xóm ✅ (1.14a)
**Nhân vật:** **Cai Lâm** — cai thầu công trình của xóm, đứng ở công trường chỉ việc.
**Đời thật (đã tra):** phụ hồ trộn vữa theo định mức — vữa xây tường 1 bao xi măng 50 kg : ~9 thùng cát 18 lít, vữa trát 1 : 8,
vữa mác 75 1 : 10; ~18–22 lít nước mỗi bao tuỳ độ ẩm cát. Công nhật phụ hồ 300–450k/ngày (TP HCM cao hơn tỉnh).
**Luồng:** xóm khởi công một công trình (UC-J5) → thông báo *"🏗️ Khởi công … Cai Lâm cần người phụ hồ"* (bấm mở Việc làm) →
công trường hiện trên bản đồ cạnh chỗ bán liên quan (đống cát, bao xi măng, thùng trộn, rào sọc, biển *"x/8 mẻ"*, Cai Lâm) →
Việc làm › 💼 Làm thuê › **🏗️ Phụ hồ** → **🚶 Tới công trường** (tới nơi bảng tự mở) → Cai giao *"Trộn 2 bao vữa xây tường"* + bảng
định mức → đổ **🧱 xi măng (bao) / ⛱️ cát (thùng, +5) / 💧 nước (lít, +20)** → **🪣 Trộn** → đạt: *"Vữa ngon!"* +12k, công trường
thêm một mẻ; sai: Cai nói lỗi (*"ít cát quá, vữa dễ nứt"*, *"nhão quá, chảy hết"*…), đổ bỏ, trộn lại mẻ đó. Mỗi mẻ ~10 phút game.
Đủ số mẻ (8) → **nghiệm thu sớm** *"nhờ bà con phụ hồ"*.
**Luật game:** tiền công **không sinh mới**: khi khởi công, 25% chi phí công trình giữ trong ví `escrow:project:<id>` làm khoản
nhân công, phần còn lại trả nhà thầu; xong công trình mà còn dư thì trả nốt nhà thầu; hết khoản nhân công thì Cai không thuê nữa.
Server kiểm đứng ở công trường, không đang mở quầy / trong ca khác, đợi mẻ trước; xi măng + cát phải đúng, nước lệch ≤ 15%.
Sổ cái: `project`, `project_labor`, `crew_wage`, `project_labor_left`; đo lường `crew_mix` (đạt / hỏng).
**Dữ liệu:** `content.crew` (keeper, laborShare, wagePerMix, mixMinutes, waterTolerance, bags, mixes); `projects[].crewMixes / site`;
`RoomProject.mixes`; `WorldView.sites`; sim `mixOrder`, `mixTarget`, `checkMix`, `laborBudget`, `siteOf`.
**Kiểm chứng:** sim `crew.test.ts`; e2e server `crew.e2e-spec.ts` (khởi công → công trường trong `world` → đứng xa bị từ chối → trộn
thiếu cát bị bắt làm lại, không tiền → trộn đúng có công, ví nhân công giảm → chưa xong mẻ trước không trộn tiếp → đủ mẻ xong sớm,
ví nhân công về 0); Playwright `phu-ho.spec.ts`.
**Sau này:** khiêng gạch, đẩy xe rùa; nhiều người cùng làm một ca (Cai chia việc); kỹ năng *tay nghề phụ hồ* lên thợ hồ.

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

## M. Thế giới sống & ký ức (docs/THEGIOI.md)

### UC-M1 · Chuyện của tôi ✅ (bản đầu)
**Ai:** mọi người chơi. **Luật:** THEGIOI §1, 17.1 (không ép, chỉ ghi lại).
**Luồng:** làm thật thì server ghi **mốc** kèm ngày game: dọn về xóm (với bao nhiêu tiền) → mua xe đầu tiên / đổi nghề →
mở quầy đầu tiên (ở đâu) → thuê nhà mặt tiền mở tiệm → đi làm thuê lần đầu → góp quỹ xóm lần đầu → các thành tựu có câu kể
(món đầu tiên, 100 khách, 1.000 khách, doanh thu 1 triệu / 10 triệu, 10 đánh giá 5★…). Mốc mới hiện thông báo **📖** (thành
tựu đã có 🏅 nên không báo thêm). **Hồ sơ → 📖 Chuyện**: dòng thời gian *Ngày 1 · Dọn về xóm với 1.500.000đ trong túi*…
**Đời thật:** nhìn lại thấy *"quầy này mình bắt đầu từ 1,5 triệu"* — tiến trình có ký ức.
**Dữ liệu:** `content.story` (mốc sự kiện, câu có chỗ trống `{money}`, `{lot}`, `{product}`…) + `achievements[].story`.
Bảng `StoryEntry` (mỗi mốc một lần theo `key`; câu lưu nguyên văn lúc xảy ra — đổi content sau không làm sai ký ức).
**Kiểm chứng:** sim `story.test.ts`; e2e server `story.e2e-spec.ts` (thứ tự mốc, mở lại quầy không ghi trùng, đi làm thuê báo 📖);
Playwright `chuyen-cua-toi.spec.ts` (iPhone + Pixel).
**Sau này:** chia sẻ chuyện thành ảnh, chuyện riêng của từng quầy (ngày khai trương, khách thứ 1.000).

### UC-M2 · Lịch tuần & chợ đêm thứ Bảy ✅ (bản đầu)
**Luồng:** ngày 1 của xóm là **Thứ Hai**; thanh trạng thái ghi `T7·N6` (cuối tuần chữ vàng; giữ lâu xem "Thứ Bảy, ngày 6 · trời…").
Sang ngày mới dải tin báo *"☀️ Sang Thứ Bảy, ngày 6 — cuối tuần, trong hẻm đông vui"*. Bảng **Xóm → 📅 Hôm nay** liệt kê sự kiện cả
xóm trong ngày kèm giờ (*🏮 Chợ đêm thứ Bảy 18:00–22:00*, đang diễn ra thì chữ đỏ).
**Luật (dữ liệu):** `calendar.weekendTraffic` — cuối tuần cổng trường ×0,55, văn phòng ×0,5, trong hẻm ×1,25, gần chợ ×1,2 (vào công
thức khách trong sim). Sự kiện kiểu `weekly` (chợ đêm: thứ Bảy 18:00, 240 phút) với hiệu ứng `categoryDemand` (ăn vặt ×1,4, đồ uống
×1,7, phụ kiện ×1,8) cho mọi quầy đang mở. `pnpm balance` vẫn không cảnh báo.
**Đời thật:** cuối tuần học sinh nghỉ thì xe bánh mì cổng trường vắng — phải dời vào hẻm; tối thứ Bảy cả xóm ra chợ đêm.
**Kiểm chứng:** sim `events.test.ts` (chợ đêm chỉ thứ Bảy, hệ số theo nhóm hàng, cuối tuần theo khu); e2e server `events.e2e-spec.ts`
(nhảy tới thứ Bảy có chợ đêm, ngày thường không); Playwright `cho-dem.spec.ts` (T2 → T7, 📅 Hôm nay có chợ đêm).
**Sau này:** ngày lễ (Tết, Trung Thu, 2/9), mùa mưa, thuê sạp ở chợ đêm (booth), sự kiện cả server.

### UC-M3 · Bản sắc khu phố & khu có tiếng ✅ (bản đầu)
**Luồng:** mỗi chỗ bán thuộc một **khu** (cổng trường 🏫, khu văn phòng 🏢, trong hẻm 🏘️, gần chợ 🧺, ngã tư 🚦). Chọn chỗ bán
thấy *"🏫 Cổng trường · hợp phụ kiện, trà sữa, bánh mì"*. **Bảng xóm → 🏙️ Khu phố**: mỗi khu hợp hàng gì, đang có mấy quầy mở;
khu tụ ≥ 2 quầy cùng nhóm hàng thì *"🍜 Đang thành khu ăn uống · +8% người qua lại"*.
**Luật (dữ liệu, sim):** `trafficProfiles[].likes` (khẩu vị khu theo nhóm hàng) nhân vào người qua lại;
`districtFame` — mỗi quầy cùng nhóm (ăn uống / mua sắm / sửa xe) đang mở trong khu từ quầy thứ hai cộng +8% người qua lại cho
cả nhóm, tối đa +30% (cạnh tranh trực tiếp cùng món vẫn chia khách). `pnpm balance` không cảnh báo.
**Đời thật / emergent:** khu vắng → một người mở quán cà phê → người khác mở trà sữa, quán ăn → khu thành "khu ăn uống".
**Kiểm chứng:** sim `economy.test.ts` (khẩu vị khu, tiếng khu có trần, quầy khác nhóm không ảnh hưởng); Playwright `khu-pho.spec.ts`.
**Sau này:** bãi giữ xe (người chơi mở) tăng lưu lượng khu, giá thuê chỗ theo độ đông, khu có tên riêng do người chơi đặt.

### UC-M4 · Trong lúc bạn vắng… ✅ (bản đầu)
**Luồng:** rời game (đóng tab / mất mạng) thì server ghi mốc `lastSeenAt` + ngày game. Vào lại sau ≥ 10 phút (`content.away.minMinutes`)
thì hiện hộp **🌙 Trong lúc bạn vắng (8 giờ)…**: 📅 xóm đã qua mấy ngày (hàng xóm vẫn chơi), ⭐ đánh giá mới về quầy (số lượng,
trung bình, câu mới nhất), 🧳 hàng xóm mới dọn về, 🏪 ai đang mở quầy, 🏗️ công trình xong / 🗳️ đề xuất chờ bỏ phiếu, 📈📉 giá chợ
nguyên liệu nghề mình đổi bao nhiêu. Không có gì đáng kể thì không hiện.
**Luật:** chỉ kể **chuyện thật** — xóm không có ai online thì đồng hồ dừng (không bịa doanh thu). **Không có tiền tự sinh khi vắng**
(DESIGN: tiền chỉ vào khi có người làm); doanh thu khi vắng chỉ có sau này khi **thuê nhân viên** bán thay (có lương, có trần).
**Kiểm chứng:** sim `away.test.ts` (giá chợ đổi giữa hai ngày); e2e server `away.e2e-spec.ts` (vừa rời → không báo; vắng 30 phút →
đánh giá mới + số ngày, tiền không đổi); Playwright `khi-vang.spec.ts` (lệnh dev `debug:away`, tải lại trang).

### UC-M5 · Khách quen — NPC có trí nhớ ✅ (bản đầu)
**Nhân vật:** 18 cư dân có tên (`content.residents`): Bé Su lớp 5 mê trà sữa, Khoa lớp 9 đá banh, Chị Thảo kế toán, Anh Duy IT, Bà Tư
bán vé số, Chú Lực xe ôm, Bác Hai thợ mộc… (khách vãng lai vẫn là người lạ không tên).
**Luồng:** khách tới quầy là một **cư dân cụ thể** (ưa đúng nhóm hàng ×2, đã quen ×1,5, khách quen ×3). Màn làm món ghi tên +
*"ghé lần 4"*; từ lần thứ 3 khách mở lời *"Bữa nay ghé nữa nè!"*. Mua đúng món lần thứ 5 → **❤️ Khách quen** (báo ❤️, ghi vào
📖 Chuyện "Có khách quen đầu tiên: …"): kiên nhẫn ×1,3, mở lời *"Như mọi khi nha!"*, 20% rủ bạn tới (thêm một khách nhịp sau).
Làm sai / để chờ bỏ về / thối thiếu **2 lần liền** → 💔 giận, mất ❤️. **Làm ăn → ❤️ Khách quen**: sổ ai ghé mấy lần.
**Dữ liệu:** bảng `ResidentVisit` (chủ × cư dân: số lần, chuỗi thất vọng, ngày thành khách quen); `content.regulars` (ngưỡng, hệ số, câu).
**Kiểm chứng:** sim `regulars.test.ts`; e2e server `regulars.e2e-spec.ts` (lần 5 → ❤️, sổ, Chuyện); Playwright `khach-quen.spec.ts`
(lệnh dev `debug:regulars`).
**Sau này:** khách quen giận khi quầy đóng nhiều ngày liền, khách quen giới thiệu bạn bè cụ thể, khách quen dặn món riêng.

### UC-M6 · Thuê nhân viên — bán thay khi vắng ✅ (bản đầu)
**Nhân vật:** bảng tuyển người của Anh Tám (`content.staff.people`): **Thu** (sinh viên năm hai, đúng 95%, 18 phút/món, 15k/giờ),
**Khoa** (lanh tay mà hay quên lời dặn, đúng 80%, 12 phút/món, 13k/giờ), **Dì Sáu** (chậm mà kỹ, đúng 98%, 25 phút/món, 10k/giờ).
> Cân lại (2026-10-02, góp ý "luôn lỗ"): tay nhân viên ngang người chơi (Khoa ≈ tay nhanh, Dì Sáu ≈ tay vừa) — trước đây nhanh gấp 3
lần người chơi nên bán thay lãi hơn chủ tự bán; lương trả theo nhịp 5 phút **cộng dồn phần lẻ** (trước làm tròn mỗi nhịp → 10k/giờ
thành 12k/giờ). `pnpm balance` cảnh báo nếu nhân viên lãi hơn chủ tay nhanh tự bán, hoặc thuê nhân viên ở tiệm nào cũng lỗ.
**Luồng:** Làm ăn → **👩‍🍳 Nhân viên** → chọn ca (sáng 6–11h, trưa 11–14h, chiều 14–18h, tối 18–22h) → **Thuê** (ghi 📖 "Thuê người
đầu tiên…"). Trong ca, quầy đang mở mà chủ **rời quầy** (đi chợ, đi làm thuê) → nhân viên bán thay từng nhịp (khách không réo chủ; từ 2026-10-03 không báo từng đợt
"vừa bán thay bạn" — xem ở 📊 Sổ sách / phiếu ca). Chủ **thoát game** → hết ân hạn, nhân viên bán nốt tới hết ca rồi dọn quầy; vào lại thấy
*"Trong lúc bạn vắng…"* có dòng **👩‍🍳 Thu bán thay 12 món (1 món sai) · thu … · trả lương …**. Có **phiếu ca** (giờ, bán, sai, thu,
lương, khách hụt). Đổi người / đổi ca / cho nghỉ bất cứ lúc nào.
**Có nhân viên thì chủ không bắt buộc đứng bán**: trong ca nhân viên đứng bán, chủ đi lo cửa hàng khác. **Góp ý đợt 3
(2026-10-03):** đã mở được nhiều cửa hàng nên bỏ hết thông báo "làm dùm / bán dùm" — chip *"Khoa đang bán — 🙋 Tôi bán"*, chip
*"đang bán thay — tới 22:00"* khi chủ đi vắng, toast *"vừa bán N món thay bạn"*, toast *"tới ca, mở cửa giúp bạn"*; hai cột icon
trái/phải sát lên dưới thanh nhiệm vụ. Vẫn giữ cảnh báo có ích: *"Quầy vắng chủ"* (không ai bán), *"tới ca mà không mở cửa được"*,
*"nghỉ làm vì không có tiền trả lương"*. **Tới ca mà quầy đang đóng thì nhân viên tự mở cửa** (còn hàng làm được ít nhất một món,
trả phí ngày như chủ mở); chủ tự đóng giữa ngày thì hôm đó nhân viên không mở lại.
**Tình huống đời thật:** nhân viên làm sai thì giảm nửa giá cho khách; người lanh tay bán nhiều mà sai nhiều; hết hàng thì nhân
viên dọn quầy về sớm (chỉ trả lương tới lúc đó, báo 📦 "Nhập thêm hàng nha!"); ví + tài khoản không đủ trả lương → nhân viên nghỉ.
**Chủ tự do (2026-10-02):** quầy đang mở mà **có nhân viên trong ca** thì chủ đi làm thuê, chạy xe ôm, phụ hồ được (nhân viên bán thay); không có nhân viên trong ca thì phải đóng quầy hoặc thuê người trước (`BusinessRepo.ownerTied`).
**Luật game (không thu nhập thụ động không trần):** nhân viên **không tự nhập hàng, không tự mở quầy**; doanh thu có trần = kho
hàng × lãi − lương; lương theo giờ đi qua sổ cái (`staff_wage` → employer), tiền bán (`staff_sale`) vào ví chủ; uy tín quầy thay
đổi theo tay nghề nhân viên; mỗi quầy một người, một ca/ngày.
**Dữ liệu:** `Employee` (quầy → người, ca, ngày thuê), `StaffShift` (phiếu ca); sim `staffShift` (lưu lượng như quầy thường,
sức làm theo phút/món, kho, đúng/sai); báo cáo ngày cộng lương vào dòng phí.
**Kiểm chứng:** sim `staff.test.ts` (bán + lương, hết hàng về sớm, người kỹ ít sai, nhịp 5 phút vẫn bán); e2e server
`staff.e2e-spec.ts` (thuê/cho nghỉ/Chuyện, bán thay khi rời quầy, thoát game → "Trong lúc bạn vắng" có doanh thu + lương);
Playwright `thue-nguoi.spec.ts`.
**Bản 2 (góp ý chơi thử: "đi vắng mà nhân viên không bán, vẫn báo về quầy"):** thêm ca **Cả ngày 6–22h**; mặc định chọn ca
đang diễn ra; báo trước khi chọn ca chưa tới giờ; tab Nhân viên có **📘 Cách dùng** (chọn ca → nhập hàng + mở quầy → rời quầy
trong giờ ca, đừng đóng quầy) và dòng trạng thái *đang trong ca / ngoài giờ làm*; rời quầy thì thanh dưới báo **"👩‍🍳 Thu đang bán
thay — tới 22:00"** thay vì "Quầy vắng chủ" (ngoài ca thì ghi rõ *Thu ngoài giờ làm*).
**Sau này:** người chơi thật nhận làm thuê ở quầy người khác (UC-H2…H9), nhân viên lên tay nghề theo ngày làm, nhiều ca/ngày.


### UC-M9 · Cấp tiệm + nhiều nhân viên ✅ (bản đầu)
> Góp ý: "nhân viên dựa vào level của tiệm: nâng cấp tiệm → to hơn, nhiều khách hơn → cần nhiều nhân viên hơn". docs/IA.md bước E.

**Luồng:** 🏪 Quầy của tôi → **⬆️ Nâng cấp tiệm** (chỉ nhà mặt tiền đang thuê, đóng cửa mới sửa): Quầy nhỏ (cấp 1, 1 người) →
**Tiệm mở rộng** (1,5tr, khách ×1,25, 2 người) → **Tiệm lớn** (3,5tr, khách ×1,45, 3 người). 👩‍🍳 Nhân viên: danh sách người đang
làm (cho nghỉ từng người), "Đang thuê n/tối đa", nút Thuê / Đổi ca / **Đủ người** / **Ở quầy khác**. Bảng tuyển có 5 người (thêm
Chị Hoa, Tuấn Anh).

**Luật game:** cả nhóm trong ca bán chung — sức làm cộng dồn theo tốc độ từng người, mỗi món do một người làm theo tay nghề
người đó; lương + phiếu ca theo từng người; **một người chỉ làm cho một cửa hàng của mình**. Không có ai trong ca thì chủ phải đứng
quầy. `pnpm balance` có bảng "Tiệm lớn đủ nhân viên" với trần 8 lần làm thuê (trà sữa ~1,18tr/ngày sau khi cân lại khách
×1,3/×1,6 → ×1,25/×1,45).

**Kiểm chứng:** sim `staff.test.ts` (2 người bán nhiều hơn 1, lương = tổng, phiếu theo người; luật cấp) · e2e `staff.e2e-spec.ts`
(xe đẩy 1 người + không nâng cấp; tiệm cấp 2 thuê 2 người, cả nhóm bán, phiếu theo người; một người một chỗ) · Playwright
`cap-tiem`.

### UC-M7 · Bảng việc xóm + 🤝 điểm tin cậy ✅ (bản đầu: việc NPC đặt)
**Nhân vật:** **Chú Hai tổ trưởng** giữ bảng, ghi sổ; người đặt việc là cư dân: *Cô Hạnh giáo viên* (bánh mì cho đội bóng),
*Chú tài xế tuyến 19*, *Chị Thảo kế toán* (trà sữa họp chiều), *Bà Năm chợ đầu mối*, *Bé Su lớp 5* (quà sinh nhật), và việc lớn
*họp tổ dân phố* của Chú Hai (cần tin cậy ≥ 60).
**Luồng:** Việc làm → **📋 Việc xóm**: mỗi ngày 3 việc (dữ liệu `content.contracts`), mỗi việc ghi *"Giao 6 bánh mì thịt cho đội
bóng lớp 5 ở Cổng trường trước 11:00"*, 💰 thưởng (đặt số lượng + giao tận nơi nên cao hơn bán lẻ ~20–35%), 🔒 cọc 20%, ⏰ hạn.
**Nhận việc** → tiền thưởng của người đặt + cọc của mình vào **ví giữ hộ (escrow)** → **🔪 Làm N phần** ở quầy mình (trừ nguyên
liệu thật, thiếu thì báo thiếu gì) → **🚶 Tới nơi** (đi bộ thật) → **📦 Giao hàng** (server kiểm đứng đúng chỗ, còn hạn) → nhận
thưởng + lại cọc, 🤝 +5, ghi 📖 "Xong việc đầu tiên trên bảng việc xóm…".
**Tình huống đời thật:** trễ giờ hẹn → người đặt lấy lại tiền, mình **mất cọc** + 🤝 −15 (đã làm hàng thì mất luôn nguyên liệu);
bỏ ngang cũng vậy; bị khách bắt **thối thiếu** → 🤝 −2; người khác nhận trước thì bảng ghi *"🙋 Lan đã nhận"*; không có đồ nghề
đúng nghề thì không nhận được; tin cậy < 30 Chú Hai nhắc, **< 15 bị khoá nhận việc 3 ngày**.
**Luật game:** tiền chỉ vào khi **làm thật** (làm hàng + đi giao); mỗi người một việc một lúc; việc có hạn trong ngày; cọc mất là
money sink (`penalty:contract`); mọi đồng tiền qua sổ cái (`contract_escrow`, `contract_deposit`, `contract_reward`,
`contract_deposit_back`, `contract_refund`); đo lường `contract_take` / `contract_done` / `contract_fail` trong `GameEvent`.
**Dữ liệu:** `Contract` (xóm, ngày, mẫu, số lượng, thưởng, cọc, hạn, người nhận, trạng thái), `Player.trust` / `trustLockDay`,
ví `escrow:<id>` (WalletKind ESCROW); sim `contractOffers`, `contractPay`, `contractIngredients`, `contractText`, `trustAfter`.
**Kiểm chứng:** sim `contracts.test.ts`; e2e server `contracts.e2e-spec.ts` (nhận → làm → giao xa bị từ chối → giao đúng chỗ, tiền
+ cọc + tin cậy + Chuyện; vượt tin cậy / khác nghề bị từ chối; trễ hạn mất cọc; bỏ ngang mãi bị khoá); Playwright `bang-viec.spec.ts`
(lệnh dev `debug:contract`).
**Sau này:** ~~người chơi đăng việc cho nhau~~ (UC-M8), việc phụ hồ / sửa xe tận nhà, tin cậy mở chợ người chơi.

### UC-M8 · 📸 Thuê nhau: chủ quầy thuê thợ chụp ảnh quầy ✅ (1.20b, việc đầu tiên người chơi đăng)
**Nhân vật:** **Chú Hai tổ trưởng** giữ sổ + tiền, phân xử; **Bé Na** (kênh "Na Ăn Gì") chỉ nghề chụp; chủ quầy (người đăng) và
hàng xóm (thợ ảnh).
**Đời thật (đã tra):** sàn việc tự do kiểu Upwork: bên thuê **nạp tiền vào ký quỹ trước**, bên làm nộp sản phẩm → bên thuê có
**hạn duyệt**, quá hạn không phản hồi thì **tự giải ngân**; tranh chấp thì bên thứ ba **xem sản phẩm rồi phân xử**. Thợ chụp tự do
ngoài đời ~150k/giờ, chụp món ~150k/món; quầy nhỏ trong xóm thuê buổi ngắn 60–150k.
**Luồng (chủ quầy):** Việc làm → **📸 Thuê nhau** → *Thuê người chụp ảnh quầy mình* → chọn tiền công (60k/100k/150k) + hạn (2/4/8
giờ) → **Đăng việc · trả trước** (tiền công vào ví giữ hộ, **phí ghi sổ 5%** tối thiểu 2k vào **quỹ xóm**) → có người nhận: thông
báo bấm được → giữ quầy mở → thợ nộp ảnh: thông báo *"bấm để nghiệm thu"* → xem 3 tấm đẹp nhất + điểm bộ ảnh + sao của thợ →
**chấm sao + ✅ Nghiệm thu** hoặc **⚖️ Khiếu nại**. Chưa ai nhận thì **gỡ việc** (hoàn tiền công, phí không hoàn).
**Luồng (thợ ảnh):** tab 📸 Thuê nhau → **Nhận việc · đặt cọc 20%** → **🚶 Tới quầy** (tới nơi bảng tự mở) → **📷 Chụp** (lần đầu
**thuê máy 20k**) → khung ngắm phủ lên cảnh 3D: khoảnh khắc đẹp (😄 khách cười, ♨️ món bốc khói, 🌤️ nắng xiên…) hiện dần, **vòng
ngắm co lại**, xanh khít là lúc bấm → mỗi tấm có điểm (🌟 / 🖼️ / 🌫️), tối đa 8 kiểu → **🖼️ Nộp ảnh** (≥ 3 tấm) → chờ nghiệm thu.
**Tình huống đời thật:** quầy đang đóng → *"chờ chủ quầy mở hàng rồi chụp mới có không khí"*; đứng xa → không chụp được; chủ bận
quên nghiệm thu → **quá 2 giờ Chú Hai tự trả**; ảnh xấu (< 55/100) bị khiếu nại → **hoàn tiền công cho chủ**, thợ lấy lại cọc nhưng
🤝 −5; ảnh đạt mà chủ vẫn khiếu nại → **vẫn trả tiền**, chủ 🤝 −5; trễ hạn / bỏ ngang → hoàn tiền chủ, thợ **mất cọc** + 🤝 −15
(có thể bị khoá).
**Luật game:** tiền công là tiền **người chơi trả người chơi** (không sinh tiền mới); money sink: phí ghi sổ (vào quỹ xóm), thuê máy
ảnh, cọc mất; ảnh được duyệt **đăng lên nhóm xóm**: khách ghé quầy ×(1 + 0,6 × chất lượng) trong 3 giờ; **server chấm từng tấm theo
giờ server** (khoảnh khắc server sinh; bù trễ mạng tối đa 400 ms); mỗi người đăng 1 việc, nhận 1 việc một lúc; không tự nhận việc
mình; cần 🤝 ≥ 30; sổ cái: `gig_escrow`, `gig_fee`, `gig_deposit`, `camera_rent`, `gig_reward`, `gig_deposit_back`, `gig_refund`,
`penalty:gig`; đo lường `gig_post`, `gig_take`, `gig_done`, `gig_disputed`, `gig_fail`.
**Dữ liệu:** `content.gigs` (phí, hạn nghiệm thu, mức tiền công, hạn, máy ảnh, khoảnh khắc, chuẩn đạt, hiệu ứng quảng cáo);
`Gig` (Prisma), `Player.gigs / gigStars`, `Business.adDay / adUntil / adMul`; ví `escrow:gig:<id>`; sim `gigFee`, `gigDeposit`,
`photoMoments`, `shotScore`, `photoQuality`, `adMultiplier`, `disputeVerdict`.
**Kiểm chứng:** sim `gigs.test.ts`; e2e server `gigs.e2e-spec.ts` (đăng → nhận → đứng xa bị từ chối → chụp đẹp → nộp → nghiệm thu
5⭐: tiền, cọc, quỹ xóm, tin cậy, sao, quảng cáo; ảnh xấu → khiếu nại → hoàn tiền; gỡ việc; quá hạn tự trả); Playwright
`thue-chup-anh.spec.ts` (hai người chơi; hook dev `xomShoot()` để bấm đúng lúc vì máy test chỉ vài khung hình/giây).
**Sau này:** thêm loại việc (phụ hồ, sửa xe tận nhà, giao hàng hộ), người nhận đặt giá (đấu thầu), ảnh hiện trên bảng tin xóm.

---

## N. Đi lại & giao thông (docs/KIENTRUC.md §4–5)

### UC-N1 · Chạy xe ôm ✅ (bản đầu)
**Nhân vật:** **Chú Lực** — trưởng trạm xe ôm gốc me (đầu đường, gần ngã tư phía tây), cho người mới thuê *Wave cũ*; khách là
cư dân có tên (Bé Su, Bà Tư vé số, Chị Thảo kế toán…).
**Luồng:** Việc làm → 💼 Làm thuê → **🛵 Chạy xe ôm** → đi tới trạm (tới nơi tự mở sheet) → **Thuê xe 30k/ngày** →
**xe Wave hiện dưới người** (cả ngày, đi đâu cũng ngồi trên xe) → chạy ra chỗ đông người (đầu hẻm, ngã tư, cổng chợ — như xe ôm
ngoài đời đậu chờ bất cứ góc phố nào, trạm chỉ là nơi thuê xe) → chip **🛵 Đậu xe ở đây chờ khách** → **🙋 Đậu xe ở đây chờ khách**
(giờ cao điểm khách tới nhanh, giữa trưa / khuya chờ lâu gấp 3; đi đâu tuỳ ý, ở trong nhà / trong tiệm thì khách chưa thấy) →
khách vẫy **ngay chỗ mình đứng**: thông báo *"🙋 Chị Mai vẫy xe … — bấm để trả giá"* (bấm là mở bảng) + chip đỏ nhấp nháy trên thanh
hành động → *"Chú ơi, chở tui tới Nhà số 15
bao nhiêu?"* (quãng đường, giá chuẩn = 12k + 8k/100 m) → **trả giá**: *Bớt chút ×0,9 · Giá chuẩn · Nhích lên ×1,25 · Nói thách
×1,6* (nói thách thì khách hay *"Mắc quá, thôi tui đi bộ"*; mưa bão khách dễ chịu giá) → **chọn đường**: 🛣️ *đường lớn* (nhanh lúc
vắng, giờ cao điểm kẹt cứng — chậm tới 60%) hay 🏘️ *đi hẻm* (không kẹt, mưa thì trơn, xóc) — sheet báo ước số giây mỗi đường +
độ kẹt → khách **ngồi sau xe** → **chạy thật** theo đường đã chọn (tìm đường A* có trọng số loại ô) → tới nơi **🛬 Tới nơi rồi** → khách chấm sao (nhanh
hơn mong đợi 5⭐, chậm quá 1–2⭐; đi hẻm lúc mưa −1⭐) + boa (5⭐: 2–5k) → **thu tiền**: chuyển khoản, đưa đủ, hoặc tờ lớn phải
**thối tiền** (thối thiếu: −2⭐, mất boa, 🤝 −2) → **trừ xăng** (1k/100 m, cả lượt về trạm) → đậu luôn chỗ vừa trả khách chờ cuốc tiếp.
**Luật game:** tiền chỉ có khi chở thật — server kiểm thuê xe ở trạm, xuất phát đúng **chỗ khách vẫy** (nơi tới
tính từ chỗ đón, ≥ 18 m), tới đúng nơi và **không tới nhanh hơn tốc độ xe cho phép**
(×1,4 sai số); đang mở quầy / đang trong ca làm thuê thì không chạy xe ôm; money sink: thuê xe + xăng; mọi đồng tiền qua sổ cái
(`bike_rent`, `ride_fare`, `ride_tip`, `fuel`), đo lường `ride_rent`, `ride_haggle`, `ride_done`, `ride_abandon`.
**Dữ liệu:** `content.rides` (giá, xăng, mức trả giá, tốc độ đường, câu thoại, sao); `Player.bikeRentDay / rides / rideStars`;
sim `congestion`, `rideFare`, `rideFuel`, `haggleChance`, `routeSpeed`, `rideStars`, `rideTip`, `passengerWait`,
`Grid.path(…, ROUTE_WEIGHTS)`.
**Kiểm chứng:** sim `rides.test.ts`; e2e server `rides.e2e-spec.ts` (chưa thuê / thuê xa trạm bị từ chối; đậu giữa xóm vẫn có khách, thông báo
`open: "ride"`, khách có model, rời chỗ đón thì không xuất phát được; cuốc đủ bước: tiền thuê,
giá, tới nhanh quá bị từ chối, thu tiền + xăng, Chuyện; nói thách bị từ chối); Playwright `xe-om.spec.ts` (thuê xe → xe dưới người → ra đường lớn giữa xóm đậu chờ → bấm
thông báo / chip → trả giá → khách ngồi sau xe → tới nơi, thu tiền).
**Sau này:** khách quen gọi riêng xe ôm uy tín, xe hao mòn → tiệm sửa xe, mua xe riêng, chở hàng thuê, giao thông 3D (UC-N2).

### UC-N2 · Giao thông trên đường ✅ (bản đầu)
**Luồng:** đường lớn có **xe máy** (nhiều nhất, người lái áo màu), **ô tô**, **xe buýt** xanh chạy theo làn hai chiều (đường ngang
và dọc từ bản đồ ô). **Giờ cao điểm** (7:00, 18:00) đông gấp ~4 lần giữa trưa và chạy chậm lại (kẹt); **mưa** bớt xe máy.
Cùng một độ kẹt `congestion(minute)` với xe ôm (UC-N1): đường lớn chậm, xe **giao hàng** (UC-W5) chậm tới 35% giờ cao điểm,
tiếng phố (xe rì rì, xe máy chạy ngang, còi) dày theo độ kẹt.
**Luật / hiệu năng (PLAN §1):** tối đa 60 xe, 4 InstancedMesh = 4 draw call, mỗi khung chỉ cập nhật ma trận; xe chỉ để nhìn (không
va chạm). Đo CPU ×4 (Playwright + CDP, máy không GPU): giờ tan tầm tắt giao thông 3,9 FPS, bật 56 xe 4,4 FPS → không tốn thêm đáng kể.
**Kiểm chứng:** Playwright `giao-thong.spec.ts` (giờ tan tầm nhiều xe hơn giữa trưa ≥ 15 xe, không quá 60).
**Sau này:** đèn đỏ ở ngã tư, xe dừng nhường người đi bộ, model xe máy / xe buýt vẽ bằng Blender, tiếng xe theo vị trí xe.

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
