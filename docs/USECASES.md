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

### UC-B4 · Thời tiết ⏳
**Đời thật:** trưa nắng gắt người ta mua nước; mưa thì đường vắng, ai có dù/mái che mới bán được; mưa xong khách túa ra.
**Luật:** mỗi ngày có dự báo (xem ở HUD); nắng: đồ uống +30% khách; mưa: khách −50%, quầy **có mái che** (nâng cấp) chỉ −20%; sau mưa 1 giờ khách +20%.
**Kiểm chứng:** unit test `@xom/sim` hệ số thời tiết; Playwright: HUD hiện biểu tượng thời tiết.

### UC-B5 · Sự kiện trong xóm ⏳
Hội chợ đêm cuối tuần · đám cưới trong hẻm (đặt 50 phần bánh mì) · tan trường sớm · mất điện (trà sữa không có đá) · kiểm tra vệ sinh an toàn thực phẩm. Chi tiết ở nhóm K.

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
### UC-F3 · Khách tới, xếp hàng ✅ (khách quen, gọi nhiều phần: ⏳)
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
### UC-F5 · Pha trà sữa theo đơn ✅ (UI chung với bánh mì; chưa có kịch bản Playwright riêng)
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

### UC-H1 · Làm thuê cho NPC ✅
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

---

## J. Nhiều người chơi (Phase 2)

- **UC-J1 Mời bạn vào xóm** — link/QR chia sẻ qua Zalo; tối đa 4 người/xóm (sau mở rộng).
- **UC-J2 Thấy nhau** — di chuyển, lời thoại trên đầu, biển hiệu tên chủ.
- **UC-J3 Mua của nhau** — người chơi làm khách ở quầy người chơi (UC-E4): chủ quầy làm món theo yêu cầu *của người thật*.
- **UC-J4 Tuyển nhau làm** — UC-H2…H8 giữa người chơi.
- **UC-J5 Tranh chỗ** — chỗ bán đã có người thuê trong ngày thì người khác không thuê được; đấu giá chỗ đẹp theo tuần (⏳).
- **UC-J6 Chống quấy rối** — chặn, báo cáo, lọc từ ngữ; không cho đứng chắn trước quầy người khác quá 1 phút (bị đẩy nhẹ ra).

---

## K. Sự kiện đời sống

| Mã | Sự kiện | Ảnh hưởng |
|---|---|---|
| UC-K1 | Hội chợ đêm cuối tuần | Gian hàng tạm, khách đông, nhiều hạng mục thắng (doanh thu, món đẹp, phục vụ) |
| UC-K2 | Mưa | Xem UC-B4 |
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
| **Phase 1.7 — Sửa xe & chợ phụ tùng** | G1–G4 · E3 (độ bền xe) · H1 nâng cấp (bưng cơm, giao hàng thật) |
| **Phase 1.8 — Tuyển dụng (NPC trước)** | H2–H9 với NPC nhân viên / NPC chủ tiệm · E2 · F10 · B4 |
| **Phase 2 — Nhiều người** | D4 · E4 · J1–J6 · H2–H8 giữa người chơi |
| **Sau đó** | K1–K7 · I2 · I4 · I5 · F8 |
