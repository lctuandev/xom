# XÓM — Bảng theo dõi tính năng

> **Social Life + Business Sandbox Online**, mobile-first (web/PWA → app).
> Tài liệu này trả lời: *tính năng nào đã có, đang làm, cần làm, để sau* — theo 20 mảng của game.
> Chi tiết thao tác & tình huống đời thật: `docs/USECASES.md` (mã UC). Kỹ thuật & lộ trình: `docs/PLAN.md`.
> **Cập nhật file này mỗi khi xong một tính năng** (cùng commit với code).

**Trạng thái:** ✅ đã làm (có test) · 🚧 đang làm · ⏳ cần làm (đã thiết kế) · 💤 để sau (chưa ưu tiên)

**Quyết định nền tảng (đã chốt):** mobile-first — web/PWA trên điện thoại trước (Next.js + R3F), bọc Capacitor lên store sau; server-authoritative (NestJS), tự host rồi đưa ra Internet qua Cloudflare. Xem `docs/PLAN.md` §0.

---

## Ưu tiên tiếp theo (khuyến nghị)

Theo nguyên tắc *"5 hệ thống ưu tiên tuyệt đối"* — (1) multiplayer realtime, (2) nhân vật + di chuyển, (3) một khu phố nhỏ,
(4) kinh doanh + kho + tiền, (5) tương tác giữa người chơi — hiện đã xong (2)(3)(4) ở chế độ một người.
**Phase 1.7 (vào làm) đã xong — nên làm ngay Phase 2 — nhiều người chơi** (mục 1, 8, 9, 10), trước khi mở rộng thêm nghề.

---

## Khung hệ thống — rà soát theo docs/DESIGN.md (10/2026)

| Hệ thống | Đã có | Lệch luật / còn thiếu → việc làm tiếp | Ưu tiên |
|---|---|---|---|
| 👁️ Camera | ✅ Mọi cảnh: 1 ngón kéo xoay/nghiêng, chạm đi tới, 2 ngón thu phóng + vặn | Góc nhìn thứ nhất (sau) | — |
| 💰 Kinh tế | ✅ Sổ cái kép, VND nguyên, thối tiền đủ tờ 1k→200k, **tách 💵 tiền mặt / 🏦 ngân hàng**, cây ATM, lãi có trần | Chuyển tiền tự do giữa người chơi, phí ATM | 3 |
| 💸 Money sink | ✅ Thuê chỗ/nhà, nguyên liệu, hàng hỏng, xe đẩy, ăn ở sạp, **phí chợ/thuế khoán, điện nước tiệm, hao mòn + sửa xe, khai trương**, thanh lý hàng lỗ vốn | Lương nhân viên, trang trí, xăng; **quỹ xóm cho công trình chung ✅ (UC-J5)** | 3 |
| 📈 Tiến trình | ✅ KN từ làm thật (bán món, làm thuê, giao hàng) → cấp độ (vòng KN quanh ảnh đại diện, "🎉 Lên cấp"); danh tiếng 4 bậc; **kỹ năng** (tay nhanh, nhớ món, ăn nói); **mở khoá theo cấp** (khai trương cấp 2, nhà mặt tiền cấp 3) | Kỹ năng theo nghề, mở khoá món/nghề | 3 |
| 🔐 Bảo mật | ✅ Đơn, ca làm, gọi món, sạp ăn, **chợ, vựa xe, nhận việc** đều kiểm đứng gần/giờ | Bắt buộc phải có vị trí (client chưa báo thì hiện vẫn cho qua) | 3 |
| 📊 Đo lường | ✅ Ghi phiên (vào/ra + thời lượng), bước kịch bản, mở quầy, vào ca, mua sạp, chuyển xóm; `pnpm analytics` (DAU/MAU, phiên, D1/D7/D30, nơi bỏ cuộc, nghề chọn, tiền theo lý do) | Biểu đồ theo tuần | — |
| 🌦️ Thế giới thay đổi | ✅ Ngày/đêm, sạp theo giờ, **thời tiết** 4 kiểu (khách, giao hàng, hạt mưa, tiếng mưa/sấm, báo trước) | Giao thông/xe chạy, mái che xe đẩy | 3 |
| 🎲 Sự kiện | ✅ Sự kiện bằng dữ liệu (`content.events`): **khai trương** do người chơi tạo, **khách VIP**, **mưa lớn toàn xóm**; chuyện trong quán (than, cãi, quỵt) | Hội chợ đêm, tan trường sớm, mất điện, tiệc mời bạn | 3 |
| 🔊 Âm thanh | ✅ BGM, SFX, giọng, **ambient phố** (xe chạy, xe máy vù qua, còi, tiếng rao; dày hơn giờ cao điểm) + trong quán (nói chuyện, chén dĩa) + **mưa, sấm** (bus môi trường chỉnh riêng) | Âm theo khoảng cách | 3 |
| 🏠 Tài sản | Thuê nhà mặt tiền làm tiệm | Nhà ở, trang trí, nội thất sưu tầm | 4 |
| 🛵 Phương tiện | Xe máy giao hàng (chỉ là tốc độ) | Xe đạp/xe máy sở hữu, xăng, hư hỏng | 4 |
| 🏪 Làm ăn | Kho, giá, rao hàng, khách, đánh giá, hỏng hàng | Nhà cung cấp/giá biến động, đối thủ, trào lưu | 3 |
| 🧠 Hành vi NPC | Khách quán, NPC ghé sạp/vào quán | Lịch sinh hoạt theo dữ liệu, nhớ quầy quen | 3 |
| 📱 Giao diện | HUD mới tối giản, menu Làm ăn/Nhiệm vụ/Hàng xóm; list dài chia tab dính (chợ, Làm ăn, Hồ sơ, Bảng xóm — Luật 12.3) | Túi đồ 🎒 riêng | 4 |
| ♻️ Giữ chân | Nhiệm vụ hôm nay (không thưởng tiền) | Chợ phiên tuần, mùa, sưu tầm | 4 |

## 1. 🌐 Online / Multiplayer core

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Đăng ký / đăng nhập username + mật khẩu | ✅ | 1 | UC-A1, A2 |
| Tự đăng nhập lại (refresh token 30 ngày, xoay vòng) | ✅ | 1 | |
| Guest account → gắn tài khoản sau | 💤 | — | Đã chốt không cần (đăng ký thường) |
| Đăng nhập Google/Zalo | 💤 | sau | |
| Hồ sơ người chơi, ID, nickname | ⏳ | 2 | Đang có tên hiển thị |
| Xóm (room) có đồng hồ riêng, tải/lưu | ✅ | 1 | Mỗi người có xóm riêng khi đăng ký, sau đó vào xóm bạn |
| Tạo / vào xóm của bạn (mã, link mời) | ✅ | 2 | UC-J1 · đăng ký từ link vào thẳng xóm; ô link khi không chép được; 30 online / 40 cư dân |
| Sức chứa xóm ✅ · matchmaking, kick ⏳ | 🚧 | 2 | |
| Kết nối lại khi mất mạng / app xuống nền | ✅ | 1 | 30 giây ân hạn, UC-A3 |
| Trạng thái kết nối + ping | ✅ | 0 | HUD |
| Phát hiện AFK | ⏳ | 2 | Quầy vắng chủ đã có (UC-F3) |
| Server là nguồn sự thật (tiền, kho, món, giao dịch) | ✅ | 1 | Client chỉ gửi ý định |
| Đồng bộ vị trí người chơi | ✅ | 2 | 10 Hz khi có thay đổi, nội suy phía client; server chưa kiểm vị trí |
| Hai tab/hai máy cùng lúc | ⏳ | 2 | UC-A4 |

## 1b. 🧭 Giao diện chính (HUD & điều hướng)

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Trên: ảnh đại diện (Hồ sơ), thanh chỉ số 💵 ⭐ 🕒☀️/🌙, dải tin "chuyện trong xóm", nút ⚙️ Cài đặt | ✅ | 1.10 | Tham khảo game nông trại người chơi gửi |
| Dưới: Xóm · Làm ăn · 🎯 Nhiệm vụ (giữa, nổi) · Việc làm · Hàng xóm — chừa chỗ cho tính năng sau (tuyển dụng, bạn bè, chat) | ✅ | 1.10 | |
| Thanh bên trái: 🍜 Ăn uống, 🧺 Chợ | ✅ | 1.10 | Bỏ nút xoay (dùng cử chỉ) |
| Nhiệm vụ: việc đang làm + "Cách buôn bán" tự tích theo tiến độ + mục tiêu hôm nay (không thưởng tiền) | ✅ | 1.10 | |
| Sổ công thức (📖): mỗi món gồm bước nào, bỏ gì; khách hay dặn gì | ✅ | 1.10 | Làm ăn → Công thức |
| Hướng dẫn vào ca từng vai (❓ Cách làm) | ✅ | 1.10 | UC-W1 |
| Trang chủ, đăng nhập, màn hình tải có tranh minh hoạ con hẻm (SVG động: đèn lồng, nồi phở, xe máy) + mẹo chơi | ✅ | 1.10 | |
| Trang chủ: hướng dẫn thêm vào màn hình chính (iOS ảnh khoanh vùng 3 bước, Android cài ngay / menu ⋮), ẩn khi đã cài | ✅ | 1.11 | UC-A5 |
| Logo mới: icon app (mái đình cong, tre làng, đèn lồng, nắng chiều) + chữ XÓM có dấu nón lá — trang chủ, đăng nhập, màn tải, favicon/PWA | ✅ | 1.11 | Góp ý chủ dự án |

## 2. 🧍 Nhân vật

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Nhân vật 3D có animation (đi, đứng) | ✅ | 0 | Kenney Mini Characters |
| Tạo nhân vật: tóc, mặt, áo, giày, phụ kiện | ⏳ | 3 | Hệ nhân vật modular (PLAN §5) |
| Biểu cảm / emote (👋 😄 🙏…) | ✅ cơ bản | 1.6 | Câu nói nhanh, UC-D3 |
| Cử chỉ (vẫy tay, bắt tay, high-five) có animation | ⏳ | 2 | |
| Chỉ số: tiền ✅, uy tín quầy ✅, cấp độ / kinh nghiệm ✅, danh tiếng ✅, kỹ năng ✅ | ✅ | 1.11 | Không có "năng lượng" ép giờ chơi |
| Kỹ năng (tay nhanh, nhớ món, ăn nói) tăng nhờ làm thật + mở khoá theo cấp | ✅ | 1.11 | UC-P1 |
| Thành tựu (dữ liệu, có tiến độ) | ✅ | 1.11 | UC-P2 |
| Thưởng thành tựu + 4 nhiệm vụ hằng ngày (🎁 Nhận, một lần, tiền nhỏ có trần); chấm đỏ 🎯/🏅 khi có thưởng chờ nhận | ✅ | 1.11 | UC-P4 |
| Bảng xóm: giải tuần 7 hạng mục, thị phần theo món, đang hot; số liệu quầy 7 ngày + so TB xóm | ✅ | 1.11 | UC-P2 |
| Bảng xóm dạng modal + bục vinh danh top 1-2-3 (khung vàng/bạc/đồng, vương miện, viền sáng) | ✅ | 1.11 | UC-P2, Luật 12.5 |

## 3. 🏘️ Thế giới / khu phố

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Một con phố: đường, vỉa hè, nhà, cột điện, xe | ✅ | 0 | |
| Địa điểm có người đứng quầy (vựa xe, chợ, quán cơm, bưu cục) | ✅ | 1.5 | Phải đi tới tận nơi |
| Nhà có số (địa chỉ giao hàng) | ✅ | 1.7 | UC-W5 · biển số nhà, ghim đơn kế tiếp |
| Không gian riêng khi vào làm (nội thất, camera ngang tầm mắt) | ✅ | 1.7 | UC-W1 · quán cơm Cô Tư, bưu cục Anh Tám |
| Xóm rộng: đường lớn, ngã tư đèn giao thông, đường nhánh, hẻm, chợ, công viên, trường, văn phòng, bãi xe | ✅ | 1.10 | UC-B6 · bản đồ trong content, tìm đường A* |
| 🗺️ Bản đồ mở: xóm ghép thêm khu bốn phía (lưới kiểu Township) — bước A: lưới ghép theo xóm, cảnh/giao thông/đi bộ dựng lại; bước B: chỗ bán vỉa hè ở khu mới; bước C: 🗺️ bản đồ xóm thu nhỏ trong Chỗ bán + ⛺ sạp có mái trên ô đất (mưa vẫn bán); bước D: 🏷️ mua đứt ô + thuế đất + bán lại | 🚧 | 1.25 | UC-B12 · docs/BANDO.md (còn: xây tiệm, tự mở khu) |
| Góc nhìn tự do: zoom, xoay, nghiêng, đổi kiểu nhìn | ✅ | 1.10 | UC-B7 · chưa làm mờ nhà che |
| Ngày/đêm: trời theo giờ, đèn đường, cửa sổ sáng, bảng hiệu sáng | ✅ | 1.10 | UC-B8 · đèn giả, không tốn GPU |
| Sạp đồ ăn NPC theo giờ (sáng/trưa/chiều/tối) | ✅ | 1.10 | UC-B9 · 8 sạp, mua ăn tại chỗ |
| Cảnh sinh hoạt NPC (mua đồ ăn, ngồi ăn, vào quán, xe máy, đèn đỏ) + người chơi làm khách | 🚧 | 1.10 | UC-B10 · NPC ghé sạp/vào quán ✅, xe cộ ⏳ |
| Ngày 06:00–22:00, ban đêm bỏ qua | ✅ | 1 | |
| Thời tiết (nắng, âm u, mưa, bão): khách, giao hàng, hạt mưa GPU, tiếng mưa/sấm, báo trước trên dải tin | ✅ | 1.11 | UC-B4 |
| Tương tác vật thể: ngồi, nhặt, đặt, mở cửa | ⏳ | 2–3 | |
| Xóm quê: nhà tranh/cấp 4/nhà ống theo **cấp nhà bằng dữ liệu** (content.housing), tiệm tạp hoá, UBND xã, trường làng, rào tre, dừa, chuối, tre — model Blender tự dựng | ✅ | 1.11 | UC-B6 |
| Nhà riêng, trang trí, nâng cấp nhà (dùng cấp nhà ở trên) | 💤 | 3 | Mục 14 |

## 4. 💰 Kinh tế

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Tiền mặt, sổ cái kép, ví không âm | ✅ | 1 | |
| Ngân hàng (tiền mặt vs tài khoản), chuyển khoản vào 🏦, cây ATM rút/gửi, lãi rất nhỏ có trần; người mới có sẵn 1tr dự phòng trong 🏦 | ✅ | 1.11 | UC-I6 |
| ATM như thật: đưa thẻ, tạo/nhập/đổi PIN 6 số (sai 3 lần giữ thẻ), rút có phí, nộp tiền, xem số dư, biên lai | ✅ | 1.11 | UC-I6 |
| Chọn cách trả khi mua: tự chọn / 💵 / 🏦; sạp nhỏ chỉ nhận tiền mặt; hàng xóm trả tiền mặt thì chủ quầy thối | ✅ | 1.11 | UC-I8 |
| Mua bán với NPC | ✅ | 1.6 | Chợ, vựa xe, khách |
| Mua bán / chuyển tiền giữa người chơi | 🚧 | 2 | Mua món ở quầy nhau ✅ (UC-J3); tặng/chuyển tiền tự do ⏳ |
| Thuê chỗ bán theo ngày | ✅ | 1 | |
| Trả lương (làm thuê NPC) | ✅ | 1 | |
| Trả lương người chơi / NPC làm cho mình | ⏳ | 1.9 | UC-H2…H9 (ký quỹ) |
| Đặt hàng trước | ⏳ | 1.9 | UC-F10 |
| Công cụ cân bằng kinh tế | ✅ | 1 | `pnpm balance` |
| Giá theo thị trường thật: món, nguyên liệu sỉ, xe đẩy cũ, chỗ vỉa hè, nhà mặt tiền, vốn tích góp | ✅ | 1.11 | DESIGN Luật 2.4 (bảng đối chiếu) |
| Chống lạm phát (money sink): phí chợ/thuế, điện nước, hao mòn + sửa xe, thanh lý hàng tồn | ✅ | 1.11 | UC-I7 |

## 5. 🏪 Kinh doanh (data-driven)

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Business = loại + vị trí + sản phẩm + kho + giá + uy tín + doanh thu/chi phí | ✅ | 1–1.6 | Template FOOD / RETAIL |
| Thêm nghề bằng dữ liệu (công thức từng bước) | ✅ | 1.6 | `packages/content` |
| Bánh mì, trà sữa, phụ kiện — tự tay làm món | ✅ | 1.6 | UC-F4…F6 |
| Sổ đánh giá quầy: khách NPC/hàng xóm chấm sao + viết, chủ quầy trả lời, che từ tục | ✅ | 1.11 | UC-F11 |
| Chat tự gõ (80 ký tự, che từ tục, chống spam) + khung chat có lịch sử; icon neo vẽ tay không nền (Ăn uống, Chợ, Bảng xóm, Cài đặt, Chat) | ✅ | 1.11 | UC-D4, Luật 12.4 |
| Thanh trạng thái gọn (trải tới mép phải, icon vẽ tay tiền/uy tín/no/khát/thời tiết, tiền gọn 1,48tr); cài đặt chuyển sang cột neo phải; thanh dưới icon vẽ tay có nhãn đè ở chân | ✅ | 1.12 | Luật 12.6 |
| Đói / khát (không khoá việc chơi), mục Ăn uống có quầy hàng xóm, khách réo khi chủ vắng quầy | ✅ | 1.11 | UC-B11, Luật 17.2 |
| Quỹ xóm + công trình chung: đề xuất, bỏ phiếu, góp quỹ, thi công, nghiệm thu → khách tăng ở chỗ bán liên quan | ✅ | 1.11 | UC-J5 |
| Giọng thoại theo kiểu khách (Gen Z/teencode/cô chú) + công tắc "thoại mặn" + AI tuỳ chọn (ANTHROPIC_API_KEY) | ✅ | 1.11 | UC-D6 |
| Quầy trà sữa dạng lưới theo góc nhìn người bán (ly M/L, bình trà có vòi, máy dán ly, lưới topping) — bố trí bằng dữ liệu | ✅ | 1.11 | UC-F5 |
| Thực đơn nhiều món, giá từng món | ✅ | 1.6 | UC-F2 |
| Tiệm riêng: thuê nhà mặt tiền, vào tiệm có không gian quán, khách đi vào, bảng quầy dạng lưới | 🚧 | 1.10 | UC-W6 |
| Góp ý chơi thử: quầy trà có dải bước + tô sáng bước kế, bỏ ô khoá trống, lắc → dán nắp → giao theo thứ tự; khung đơn = chân dung khách + bong bóng (như chợ); thông báo gộp một khối không đè; nhân viên: ca cả ngày, trạng thái trong/ngoài ca, hướng dẫn | ✅ | 1.22 | UC-F5, UC-E5, UC-M6 |
| Thanh trạng thái màn hẹp: không tràn (tiền gọn "138k", ẩn bớt số ngày / % đói khát / dự báo theo bề rộng) | ✅ | 1.22 | DESIGN Luật 12.6a |
| 🏪 Mở tiệm như ngoài đời: hợp đồng thuê (cọc 3 ngày + vốn dự phòng, tiền nhà tính cả ngày đóng, hết cọc mất nhà), hộ kinh doanh + đặt tên quán, ATTP (tập huấn + đón đoàn kiểm tra), biển hiệu tên quán; bỏ khoá cấp 3 | ✅ | 1.22 | UC-F12 |
| 🏠 Đòi tiền nhà: chủ nhà NPC (chân dung + thoại) tới nhắc 17h, trả ngay / hẹn **ngày** (phí trễ theo số ngày) / để sau; quá hạn trừ cọc + 🤝, trễ lần 3 hoặc hết cọc thì dẹp tiệm (cả xóm biết); offline chưa hẹn không tính trễ | ✅ | 1.23 | UC-F13 |
| ⚖️ Cân lại kinh tế tiệm: mặt tiền đông khách hơn + khách chịu giá cao hơn ~20% (`priceTolerance`), nhân viên tay ngang người chơi, sửa lương làm tròn mỗi nhịp (10k→12k/giờ); `pnpm balance` có bảng Tiệm + cảnh báo tiệm thua xe đẩy / nhân viên lỗ / nhân viên hơn chủ | ✅ | 1.23 | UC-F12, UC-M6 |
| 🧭 Tổ chức lại giao diện: **mỗi chức năng một sheet riêng** (35 chức năng, registry), ☰ Menu lưới icon 5 nhóm + chấm đỏ, cột neo trái tự ghim tối đa 4, bỏ thanh dưới 5 mục; tách Làm ăn 9 tab, Hồ sơ 5 tab, Việc làm 3 tab, Hàng xóm, Thanh lý | ✅ | 1.24 | docs/IA.md, DESIGN Luật 12.3–12.6 |
| Nút ☰ Menu icon không nền + chữ "Menu" đè dưới; bỏ neo ⚙️ (Cài đặt trong Menu); ghim icon **cả trái lẫn phải** (mỗi bên 4) | ✅ | 1.24 | UC-A6 |
| Nút **‹ Quay lại** ở đầu sheet mở từ sheet khác (nút "›", ô trong Menu) — ngăn xếp `sheetBack` | ✅ | 1.24 | UC-A6 |
| Chú Bảy không bắt chuyện lại mỗi lần vào game (nhớ lời đã nghe); thêm lựa chọn "Con tự lo được" bỏ qua hướng dẫn | ✅ | 1.24 | UC-A1 |
| 📒 **Đánh giá riêng từng cửa hàng** (Review.businessId; sổ, viết, trả lời, uy tín theo đúng cửa hàng) | ✅ | 1.24 | UC-F11 |
| 🏬 Nhiều cửa hàng chạy cùng lúc: đi tới quầy nào thì tự quản lý quầy đó (mở / bán), quầy khác nhân viên bán | ✅ | 1.24 | UC-F14 |
| 🏪 Quầy theo mặt hàng: sheet Quầy 4 thẻ việc (nhập hàng, thực đơn, nhân viên, chỗ) có tình trạng; chợ chỉ hàng của quầy (Xem hàng khác); mở thêm cửa hàng → chọn chỗ | ✅ | 1.24 | UC-F15 |
| 🏗️ Tách server theo miền (BusinessRepo, PaymentService, Broadcast, Bank/Needs/Market/BusinessService, gateway theo nhóm + IntentRunner) — không đổi hành vi | ✅ | 1.24 | docs/IA.md bước A |
| 📊 Sổ sách: thu/chi theo từng khoản (lương nhân viên, điện nước tách khỏi phí), lãi/lỗ hôm nay & 7 ngày, chỉ ra khoản chi lớn nhất; Tổng kết ngày tính đủ khoản | ✅ | 1.24 | docs/IA.md bước C |
| 🚶 Chủ tự do khi có nhân viên: quầy mở mà có nhân viên trong ca thì chủ đi làm thuê / xe ôm / phụ hồ được (chỉ chặn khi không ai bán) | ✅ | 1.24 | UC-M6, HANDOFF 3.4 |
| 🛵 Xe ôm trong `pnpm balance` + cân lại nhịp khách (lãi ~gấp 2 làm thuê thay vì gấp 4); tắt server sạch (chờ tick dở, Prisma đóng sau cùng) | ✅ | 1.24 | UC-N1, HANDOFF §4 |
| 🏬 Nhiều cửa hàng (không giới hạn) + kho riêng từng tiệm + chuyển kho 30 phút game; chọn cửa hàng đang quản lý (chip trên sheet 🏪, 🏬 Các cửa hàng); mở thêm / đổi nghề giữ kho; đứng quầy theo cửa hàng | ✅ | 1.24 | UC-F14, docs/IA.md bước D |
| ⬆️ Cấp tiệm (Quầy nhỏ → Tiệm mở rộng → Tiệm lớn: khách ×1,25/×1,45, thuê 1/2/3 người) + nhiều nhân viên cùng ca (sức làm cộng dồn, lương & phiếu theo người, một người một chỗ) | ✅ | 1.24 | UC-M9, docs/IA.md bước E |
| Kiến trúc đợt 2 (khách quen, nhân viên, hợp đồng + tin cậy, xe ôm, giao thông) | ✅ | 1.19 | docs/KIENTRUC.md |
| 🧑‍🤝‍🧑 Khách quen: 18 cư dân có tên, đếm lần ghé, ❤️ khách quen (kiên nhẫn, rủ bạn, giận khi làm sai), sổ khách quen | ✅ | 1.19a | UC-M5, KIENTRUC §1 |
| 👩‍🍳 Thuê nhân viên NPC bán thay (Thu/Khoa/Dì Sáu, 4 ca), phiếu ca, doanh thu khi vắng có trần, hết hàng về sớm | ✅ | 1.19b | UC-M6, KIENTRUC §2 |
| Rà luồng tiệm: không trả trùng tiền nhà / tiền chỗ, đang thuê nhà không ra vỉa hè, tiền nhà từ ngày sau ngày ký, mở cửa ngay trong tiệm, biển vẫy nhìn dọc phố; nhân viên tới ca tự mở cửa, chủ ở quầy xem nhân viên bán hoặc giành bán; Chú Bảy nói đúng vốn khởi nghiệp | ✅ | 1.22 | UC-F12, UC-M6 |
| 📋 Bảng việc xóm (việc NPC đặt: làm hàng + giao tận nơi trước hạn), escrow thưởng + cọc, 🤝 điểm tin cậy, mất cọc / khoá khi bỏ việc | ✅ | 1.20 | UC-M7, KIENTRUC §3 |
| 📋 Người chơi đăng việc cho nhau (ví giữ hộ, phí ghi sổ vào quỹ xóm), nghiệm thu + chấm sao, quá hạn tự trả, Chú Hai phân xử | ✅ | 1.20b | UC-M8, KIENTRUC §3 |
| 📸 Thợ ảnh: thuê máy, khung ngắm canh khoảnh khắc (server chấm), nộp 3 tấm, ảnh đăng nhóm xóm kéo khách | ✅ | 1.20b | UC-M8, NGHE §3.3 |
| Kế hoạch thế giới sống (Chuyện của tôi, lịch tuần, khu phố, khi vắng mặt, giao thông, luật & hậu quả) | ✅ | 1.16 | docs/THEGIOI.md |
| 📖 Chuyện của tôi: mốc đời người chơi (dữ liệu), tab Chuyện trong hồ sơ | ✅ | 1.16a | UC-M1, THEGIOI §1 |
| 📅 Thứ trong tuần, cuối tuần, chợ đêm thứ Bảy, 📅 Hôm nay trong bảng Xóm | ✅ | 1.16b | UC-M2, THEGIOI §2 |
| 🏙️ Bản sắc khu phố + khu có tiếng nhờ người chơi (emergent), tab 🏙️ Khu phố | ✅ | 1.16c | UC-M3, THEGIOI §3 |
| 🌆 "Trong lúc bạn vắng…" (ngày đã qua, đánh giá, hàng xóm, công trình, giá chợ — không tiền tự sinh) | ✅ | 1.16d | UC-M4, THEGIOI §4 |
| 🚦 Xe cộ trên đường, kẹt xe giờ cao điểm ảnh hưởng giao hàng | ⏳ | 1.17 | THEGIOI §5 |
| ⚖️ Luật & hậu quả: điểm tin cậy, phạt, hoàn tiền, cấm hợp đồng | ⏳ | 1.18 | THEGIOI §6 |
| Kế hoạch nghề nghiệp đợt 1 (10 nghề, cơ chế lõi dùng chung, phụ thuộc giữa người chơi) | ✅ | 1.12 | docs/NGHE.md |
| Dịch vụ: tiệm sửa xe (SERVICE) — khách kể triệu chứng → kiểm tra bộ phận (server trả kết quả) → sửa bằng phụ tùng → chạy thử (sai bệnh thì vẫn hư) | ✅ | 1.12a | UC-G1…G4, NGHE §3.1 |
| Sửa xe nâng cao: báo giá & trả giá, bảo hành, Tiệm phụ tùng Chú Chín, model xe đồ nghề | ⏳ | 1.12a+ | UC-G4 |
| 🚦 Giao thông 3D: xe máy / ô tô / xe buýt instanced (≤ 60, 4 draw call), đông + chậm theo giờ cao điểm, mưa bớt xe máy; giao hàng chậm khi kẹt; tiếng phố theo độ kẹt | ✅ | 1.21 | UC-N2, KIENTRUC §5 |
| 🛵 Xe ôm: trạm gốc me (Chú Lực), thuê xe + xăng, trả giá cuốc, chọn đường lớn (kẹt giờ cao điểm) / hẻm (trơn khi mưa), thối tiền, sao + boa | ✅ | 1.21 | UC-N1, KIENTRUC §4, NGHE §3.2 |
| 🛵 Xe ôm: xe Wave hiện dưới người khi đã thuê, khách ngồi sau lúc chở, đậu đâu cũng chờ khách được, thông báo khách vẫy bấm được + chip trên thanh hành động | ✅ | 1.21 | UC-N1 |
| Bảng việc xóm (hợp đồng + tiền giữ escrow) | ⏳ | 1.13a | NGHE §5 |
| Thợ chụp ảnh / review quán (hợp đồng, tăng khách cho quầy) | ⏳ | 1.13b | NGHE §3.3 |
| 🏗️ Phụ hồ công trình xóm: công trường trên bản đồ, Cai Lâm giao mẻ vữa, trộn đúng định mức (xi măng : cát : nước) có công từ khoản nhân công của công trình, đủ mẻ xong sớm | ✅ | 1.14a | UC-J6, NGHE §3.4 |
| Tiệm tạp hoá + sổ ghi nợ | ⏳ | 1.14b | NGHE §3.5 |
| Tiệm cắt tóc (đi cùng cá nhân hoá) | ⏳ | 1.15 | NGHE §3.6 |
| Làm thuê quán cơm: đứng quầy múc cơm, thu ngân, bưng bê | ✅ | 1.7 | UC-W2…W4 |
| Quán sống động: khách vào/ra, ngồi ăn, trả tiền, đánh giá ⭐, than/gây lộn/quỵt; đồng nghiệp NPC; camera + di chuyển riêng từng vai | ✅ | 1.7 | UC-W8 |
| Giao hàng (DELIVERY) — làm thuê: soạn gói, chạy xe, ký nhận, thu hộ | ✅ | 1.7 | UC-W5 |
| Nhân viên cho quầy của mình | ⏳ | 1.9 | UC-H |
| Nhiều quầy, chuỗi cửa hàng | 💤 | 3 | |
| Creator (quay video, YouTuber) | 💤 | 4 | Mục 18 |
| Barber, tạp hóa, hoa, điện tử, đồ cũ, in ấn… | 💤 | 3+ | Thêm bằng dữ liệu |

## 6. 📦 Kho

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Kho nguyên liệu của quầy, theo lô, hạn dùng, xuất FIFO | ✅ | 1.6 | |
| Túi đồ người chơi (balo) | ⏳ | 2 | Cần khi mua/tặng đồ cho nhau |
| Kho xe (thùng giao hàng) | ✅ | 1.7 | Tối đa 3 đơn/chuyến |
| Thuộc tính item: nặng, hiếm, có thể trao đổi | 💤 | 3 | |

## 7. 🚚 Chuỗi cung ứng

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Nguồn hàng NPC (chợ Bà Năm) | ✅ | 1.6 | |
| Người chơi cung cấp cho người chơi (xưởng → quầy) | 💤 | 3 | PLAN Phase 5 |
| Giao hàng giữa các quầy do người chơi chạy | 💤 | 3 | |

## 8. 🧑‍🤝‍🧑 Xã hội

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Bạn bè (thêm, danh sách, online, vào xóm bạn) | 🚧 | 2 | Danh sách online trong xóm + vào xóm bạn ✅; kết bạn ⏳ |
| Nhóm (party): mời, rời, trưởng nhóm | ⏳ | 2 | |
| Công ty / hội / hợp tác kinh doanh | 💤 | 3–4 | Co-op business PLAN Phase 5 |
| Thân thiết với NPC | ✅ | 1.6 | UC-D2 |

## 9. 💬 Giao tiếp

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Khung thoại trên đầu nhân vật | ✅ | 1.6 | UC-D1 |
| Câu nói nhanh, rao hàng | ✅ | 1.6 | UC-D3 |
| Nói chuyện với NPC (chủ đề) | ✅ | 1.6 | UC-D2 |
| Đứng trước quầy: chân dung người bán (render Blender) + ô thoại phía trên sheet — sạp NPC, chợ, vựa xe, quầy hàng xóm, nói chuyện | ✅ | 1.11 | UC-E5 |
| Chat cả xóm gõ chữ ✅; chat gần (local), chat nhóm, tin nhắn riêng ⏳ | 🚧 | 2 | UC-D4 |
| Chat toàn server | 💤 | | Cần kiểm duyệt |
| Voice chat theo khoảng cách | 💤 | 4 | |
| Âm thanh: nhạc nền ngày/đêm, tiếng thao tác, giọng lầm bầm theo nhân vật (giận thì gắt), chỉnh âm lượng | ✅ | 1.10 | UC-D5 · WebAudio, không file |

## 10. 🤝 Tương tác người chơi

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Làm khách ở quầy người khác (gọi món, người thật làm) | ✅ | 2 | UC-J3 · chuyển khoản giữa hai ví |
| Tặng đồ, trao đổi, mời, đi theo | ⏳ | 2 | |
| Làm chung một quầy (co-op) | ⏳ | 2–3 | |
| Chụp ảnh | 💤 | 4 | Mục 18 |

## 11. 🧑 NPC

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| NPC khách: kiểu người, kiên nhẫn, trả tiền mặt/chuyển khoản, nói theo giá | ✅ | 1.6 | |
| NPC khách trong quán: đi lại, ngồi ăn, than chờ lâu, cãi nhau, quỵt tiền, đánh giá | ✅ | 1.7 | UC-W8 |
| NPC đồng nghiệp làm các vị trí người chơi không làm | ✅ | 1.7 | UC-W8 |
| NPC chủ địa điểm có lời thoại, thân thiết | ✅ | 1.6 | |
| NPC dẫn đường (Chú Bảy) + kịch bản | ✅ | 1.5 | |
| NPC có ngân sách, lịch sinh hoạt, quầy yêu thích, nhớ quầy | ⏳ | 1.9 | Khách quen (UC-F3) |
| NPC nhân viên / NPC chủ tiệm lấp chỗ trống | ⏳ | 1.9 | UC-H9 |

## 12. ⭐ Uy tín & đánh giá

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Uy tín quầy (sao) theo món đúng, nhanh, giá, thối tiền | ✅ | 1.6 | |
| Review có lời ("ngon nhưng chờ lâu"): sổ đánh giá quầy, chủ quầy trả lời | ✅ | 1.11 | UC-F11 |
| Reviewer ghé, viral | ⏳ | sau | UC-I2 |
| Phiếu lương ca ✅ · uy tín người làm thuê ⏳ | 🚧 | 1.7–1.9 | UC-W7 |

## 13. 📈 Tiến trình

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Vốn → xe đẩy → đổi nghề | ✅ | 1 | |
| Quầy → cửa hàng → nhiều cửa hàng → thuê nhân viên → chuỗi | ⏳ | 1.9–3 | |
| Cấp độ nghề / xã hội, thành tựu, bộ sưu tập | 💤 | 3 | |

## 14. 🏠 Nhà ở — 💤 Phase 3

Mua/thuê nhà, trang trí, nội thất, mời bạn. (Nội thất Kenney đã tải về dùng cho quán/bưu cục ở Phase 1.7.)

## 15. 🚗 Phương tiện

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Xe máy khi giao hàng (nhanh / chậm, hàng dễ vỡ) | ✅ cơ bản | 1.7 | Tốc độ chạy + móp hàng; chưa có model xe máy |
| Sở hữu xe, xăng, bảo dưỡng, độ xe | 💤 | 3 | Nối với nghề sửa xe (UC-G) |

## 16. 🎯 Nhiệm vụ & sự kiện

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Kịch bản người mới rẽ nhánh | ✅ | 1.5 | UC-C |
| Sự kiện ngẫu nhiên (mưa ✅, mất điện, tan trường sớm) | 🚧 | 1.9 | UC-K |
| Sự kiện bằng dữ liệu: khai trương (người chơi tạo, money sink), khách VIP, mưa lớn toàn xóm | ✅ | 1.11 | UC-B5 |
| Sự kiện chung (chợ đêm) | ⏳ | 3 | UC-K1 |
| Sự kiện riêng (reviewer, chủ nhà tăng giá) | ⏳ | sau | |

## 17. 🎉 Theo mùa — 💤 sau Phase 3

Tết, Trung Thu, mùa mưa, mùa hè: trang trí, món theo mùa, nhiệm vụ.

## 18. 📱 Creator / XÓM Social — 💤 Phase 4

Chụp ảnh/quay trong game, đăng lên "XÓM Social", thích/bình luận, trending.

## 19. 🛡️ An toàn & kiểm duyệt

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Server kiểm tra mọi tiền/đồ; client không quyết định | ✅ | 1 | |
| Giới hạn tần suất (REST theo IP, socket 20 thao tác/giây) | ✅ | 1 | |
| Khóa đăng nhập khi sai nhiều | ✅ | 1 | |
| Chặn, báo cáo, tắt tiếng, lọc từ ngữ | ⏳ | 2 | Bắt buộc trước khi mở chat |
| Kick, ban | ⏳ | 2 | |
| Bảo vệ giao dịch giữa người chơi | ⏳ | 2 | |

## 20. 💾 Backend

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Monolith module hóa (Auth, Game, Economy, Orders, Work…) | ✅ | 1 | Không làm microservice ở MVP |
| PostgreSQL + Prisma, migration | ✅ | 1 | |
| Redis (trạng thái xóm, pub/sub nhiều server) | ⏳ | 2 | Đã có container, chưa dùng |
| Deploy Docker cổng 5555, tự chạy lại, backup | ✅ / ⏳ backup | 1 | |
| Cloudflare Tunnel | ⏳ | 4 | |
| Log sự kiện game (thay analytics) | ✅ | 1 | Bảng `GameEvent` |

## Tồn đọng (xem HANDOFF.md §3)

| Tính năng | Trạng thái | Ở đâu |
|---|---|---|
| Tái cấu trúc chức năng / menu / nút, tách service + component lớn | ⏳ | HANDOFF §3.1 |
| Nhiều nhân viên cùng lúc, giới hạn theo quy mô cửa hàng | ⏳ | HANDOFF §3.2 |
| Nhiều cửa hàng cùng lúc + bảng tổng quan cửa hàng | ⏳ | HANDOFF §3.3 |
| Có nhân viên thì chủ đi làm việc khác / tự bán tiệm khác | ⏳ | HANDOFF §3.4 |
| Đòi tiền nhà: nhắc trước hạn, hẹn ngày, chủ nhà dẹp tiệm, modal chân dung NPC | ⏳ | HANDOFF §3.5 |
| Nội thất riêng theo nghề | ⏳ | HANDOFF §3.6 |
| Khách ra vào tiệm (ngoài phố + trong tiệm, cả khi nhân viên bán) | ⏳ | HANDOFF §3.7 |
| Xóm chung: tự xếp xóm đông, lập xóm riêng, danh sách xóm + dọn về | ✅ | UC-J7 |
| Bảng tin xóm (tin nhắn lưu + tin tự động), tên xóm | ⏳ | HANDOFF §3.8 |
| Trang admin `/quan-tri` | ⏳ (đã có plan) | docs/ADMIN.md |
