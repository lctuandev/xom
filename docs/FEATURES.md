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

## 1. 🌐 Online / Multiplayer core

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Đăng ký / đăng nhập username + mật khẩu | ✅ | 1 | UC-A1, A2 |
| Tự đăng nhập lại (refresh token 30 ngày, xoay vòng) | ✅ | 1 | |
| Guest account → gắn tài khoản sau | 💤 | — | Đã chốt không cần (đăng ký thường) |
| Đăng nhập Google/Zalo | 💤 | sau | |
| Hồ sơ người chơi, ID, nickname | ⏳ | 2 | Đang có tên hiển thị |
| Xóm (room) có đồng hồ riêng, tải/lưu | ✅ | 1 | Mỗi người có xóm riêng khi đăng ký, sau đó vào xóm bạn |
| Tạo / vào xóm của bạn (mã, link mời) | ✅ | 2 | UC-J1 · tối đa 8 người online/xóm |
| Sức chứa xóm ✅ · matchmaking, kick ⏳ | 🚧 | 2 | |
| Kết nối lại khi mất mạng / app xuống nền | ✅ | 1 | 30 giây ân hạn, UC-A3 |
| Trạng thái kết nối + ping | ✅ | 0 | HUD |
| Phát hiện AFK | ⏳ | 2 | Quầy vắng chủ đã có (UC-F3) |
| Server là nguồn sự thật (tiền, kho, món, giao dịch) | ✅ | 1 | Client chỉ gửi ý định |
| Đồng bộ vị trí người chơi | ✅ | 2 | 10 Hz khi có thay đổi, nội suy phía client; server chưa kiểm vị trí |
| Hai tab/hai máy cùng lúc | ⏳ | 2 | UC-A4 |

## 2. 🧍 Nhân vật

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Nhân vật 3D có animation (đi, đứng) | ✅ | 0 | Kenney Mini Characters |
| Tạo nhân vật: tóc, mặt, áo, giày, phụ kiện | ⏳ | 3 | Hệ nhân vật modular (PLAN §5) |
| Biểu cảm / emote (👋 😄 🙏…) | ✅ cơ bản | 1.6 | Câu nói nhanh, UC-D3 |
| Cử chỉ (vẫy tay, bắt tay, high-five) có animation | ⏳ | 2 | |
| Chỉ số: tiền ✅, uy tín quầy ✅, cấp độ / kinh nghiệm ⏳ | 🚧 | | Không có "năng lượng" ép giờ chơi (nguyên tắc 7) |
| Kỹ năng theo nghề (tay nhanh, nhớ món…) | 💤 | | |

## 3. 🏘️ Thế giới / khu phố

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Một con phố: đường, vỉa hè, nhà, cột điện, xe | ✅ | 0 | |
| Địa điểm có người đứng quầy (vựa xe, chợ, quán cơm, bưu cục) | ✅ | 1.5 | Phải đi tới tận nơi |
| Nhà có số (địa chỉ giao hàng) | ✅ | 1.7 | UC-W5 · biển số nhà, ghim đơn kế tiếp |
| Không gian riêng khi vào làm (nội thất, camera ngang tầm mắt) | ✅ | 1.7 | UC-W1 · quán cơm Cô Tư, bưu cục Anh Tám |
| Xóm rộng: đường lớn, ngã tư đèn giao thông, đường nhánh, hẻm, chợ, công viên, trường, văn phòng, bãi xe | ⏳ | 1.10 | UC-B6 · bản đồ khai báo trong content |
| Góc nhìn tự do: zoom, xoay, nghiêng, đổi kiểu nhìn | ✅ | 1.10 | UC-B7 · chưa làm mờ nhà che |
| Ngày/đêm: trời theo giờ, đèn đường, cửa sổ sáng, bảng hiệu sáng | ✅ | 1.10 | UC-B8 · đèn giả, không tốn GPU |
| Sạp đồ ăn NPC theo giờ (sáng/trưa/chiều/tối) | ⏳ | 1.10 | UC-B9 |
| Cảnh sinh hoạt NPC (mua đồ ăn, ngồi ăn, vào quán, xe máy, đèn đỏ) + người chơi làm khách | ⏳ | 1.10 | UC-B10 |
| Ngày 06:00–22:00, ban đêm bỏ qua | ✅ | 1 | |
| Thời tiết (mưa, nắng) | ⏳ | 1.9 | UC-B4 |
| Tương tác vật thể: ngồi, nhặt, đặt, mở cửa | ⏳ | 2–3 | |
| Nhà riêng, trang trí | 💤 | 3 | Mục 14 |

## 4. 💰 Kinh tế

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Tiền mặt, sổ cái kép, ví không âm | ✅ | 1 | |
| Ngân hàng (tiền mặt vs tài khoản), chuyển khoản | ⏳ | 2 | Khách đã có trả chuyển khoản |
| Mua bán với NPC | ✅ | 1.6 | Chợ, vựa xe, khách |
| Mua bán / chuyển tiền giữa người chơi | 🚧 | 2 | Mua món ở quầy nhau ✅ (UC-J3); tặng/chuyển tiền tự do ⏳ |
| Thuê chỗ bán theo ngày | ✅ | 1 | |
| Trả lương (làm thuê NPC) | ✅ | 1 | |
| Trả lương người chơi / NPC làm cho mình | ⏳ | 1.9 | UC-H2…H9 (ký quỹ) |
| Đặt hàng trước | ⏳ | 1.9 | UC-F10 |
| Công cụ cân bằng kinh tế | ✅ | 1 | `pnpm balance` |
| Chống lạm phát (money sink) | ✅ cơ bản | 1 | Thuê chỗ, hàng hỏng, nguyên liệu |

## 5. 🏪 Kinh doanh (data-driven)

| Tính năng | Trạng thái | Phase | Ghi chú |
|---|---|---|---|
| Business = loại + vị trí + sản phẩm + kho + giá + uy tín + doanh thu/chi phí | ✅ | 1–1.6 | Template FOOD / RETAIL |
| Thêm nghề bằng dữ liệu (công thức từng bước) | ✅ | 1.6 | `packages/content` |
| Bánh mì, trà sữa, phụ kiện — tự tay làm món | ✅ | 1.6 | UC-F4…F6 |
| Thực đơn nhiều món, giá từng món | ✅ | 1.6 | UC-F2 |
| Quầy riêng có không gian 3D khi đứng bán | ⏳ | 1.8 | UC-W6 |
| Dịch vụ: sửa xe (SERVICE) | ⏳ | 1.8 | UC-G |
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
| Chat gần (local), chat nhóm, tin nhắn riêng | ⏳ | 2 | UC-D4 |
| Chat toàn server | 💤 | | Cần kiểm duyệt |
| Voice chat theo khoảng cách | 💤 | 4 | |

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
| Review có lời ("ngon nhưng chờ lâu") | ⏳ | 2 | |
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
| Sự kiện ngẫu nhiên (mưa, mất điện, tan trường sớm) | ⏳ | 1.9 | UC-K |
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
