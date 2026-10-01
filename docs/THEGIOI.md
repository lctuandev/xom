# XÓM — Thế giới sống & ký ức người chơi

> Kế hoạch cho nhóm góp ý "thế giới sống": Chuyện của tôi, thế giới chạy khi vắng mặt, giao thông, bản sắc khu phố,
> lịch tuần, luật & hậu quả. Luật thiết kế ở `docs/DESIGN.md`; nghề nghiệp ở `docs/NGHE.md`; luồng chi tiết ở
> `docs/USECASES.md` (nhóm M).
>
> **Hai luật nền không đổi:** (1) tiền chỉ vào ví khi *có người làm* — người chơi hoặc nhân viên được trả lương
> (không thu nhập thụ động không trần); (2) server quyết định mọi thay đổi.

---

## 1. 📖 Chuyện của tôi (Player Story) — làm ngay

**Mục đích:** biến tiến trình thành **ký ức**. Nhìn lại: *"Ồ, quầy này mình bắt đầu từ 1,5 triệu."*

- Server ghi **mốc** vào bảng `StoryEntry` (một mốc mỗi người chỉ ghi một lần, có ngày game và câu đã viết sẵn,
  nên sau này đổi content cũng không làm sai ký ức).
- Mốc là **dữ liệu** (`content.story`): `join` (dọn về xóm với bao nhiêu tiền), `first_cart` (mua xe đầu tiên),
  `first_open` (mở quầy đầu tiên ở đâu), `first_sale` (món đầu tiên bán được), `served_100` / `served_1000`,
  `first_job` (đi làm thuê lần đầu), `first_shop` (thuê nhà mặt tiền mở tiệm), `level_5` / `level_10`,
  `first_five_star`, `first_donate` (góp quỹ xóm), `switch_trade` (đổi nghề), `rich_10m` (có 10 triệu đầu tiên).
- Hồ sơ có tab **📖 Chuyện**: dòng thời gian *Ngày 1 → Dọn về xóm với 1.500.000đ trong túi…*.
- Sau này: chia sẻ "chuyện" thành ảnh (Web Share), chuyện của quầy (ngày khai trương, khách thứ 1.000).

## 2. 📅 Lịch tuần — làm ngay

- Ngày game có **thứ** (ngày 1 = Thứ Hai). Thanh trạng thái ghi *T2…CN*; cuối tuần đông khách hơn ở khu dân cư,
  khu văn phòng vắng (dữ liệu `calendar.weekdays[].demand` theo loại khu).
- **Chợ đêm thứ Bảy 19:00–23:00** (sự kiện theo lịch, dữ liệu): khách đồ ăn/uống/phụ kiện tăng mạnh, dải tin báo trước.
- Sau này: ngày lễ (Tết, Trung Thu, 2/9…), mùa (mùa mưa tháng 5–10), lịch sự kiện cả server.

## 3. 🏙️ Bản sắc khu phố — làm ngay (bản đầu)

- Mỗi chỗ bán thuộc một **khu** (`districts` trong content): *Cổng trường* (sinh viên — đồ rẻ, trà sữa, phụ kiện),
  *Khu chợ* (dân buôn — sửa xe, đồ ăn sáng), *Trong hẻm* (dân cư — tạp hoá, sửa xe), *Phố chính* (văn phòng, buổi tối
  ăn chơi). Mỗi khu có hệ số nhu cầu theo **loại hàng** → cùng một món, đặt sai khu thì vắng.
- **Người chơi làm đổi khu phố (emergent):** càng nhiều quầy *đang mở* cùng nhóm hàng trong một khu thì khu đó
  có **tiếng** ("khu ăn uống") → người qua đường tăng cho cả nhóm (có trần, ví dụ +30%); quá đông cùng một món
  thì vẫn chia khách (cạnh tranh). Bảng xóm hiện *"Cổng trường đang thành khu ăn vặt"*.
- Sau này: bãi giữ xe (người chơi mở) tăng lưu lượng khu, giá thuê chỗ theo độ đông của khu.

## 4. 🌆 Khi bạn vắng mặt — làm ngay (bản đầu, không tiền tự sinh)

- Lưu `lastSeenAt`; vào lại game thấy thẻ **"Trong lúc bạn vắng (8 giờ)…"**:
  - ⭐ đánh giá mới về quầy mình (khách đã ăn trước đó viết thêm), 💬 số người nhắc tới quầy,
  - 📈 giá chợ hôm nay của nguyên liệu mình hay mua (lên/xuống bao nhiêu %),
  - 🏗️ công trình quỹ xóm xong / có đề xuất mới chờ bỏ phiếu,
  - 🏪 hàng xóm mở quầy mới cạnh mình, sự kiện đã diễn ra (mưa lớn, chợ đêm).
- **Doanh thu khi vắng** chỉ có khi đã **thuê nhân viên** (đi cùng hệ thống thuê người, `docs/NGHE.md`): nhân viên
  bán thay, ăn lương, nhập hàng bằng tiền của chủ — có trần theo kho hàng và giờ làm. Chưa có nhân viên thì
  quầy đóng khi chủ vắng (Luật "tiền chỉ vào khi có người làm").

## 5. 🚦 Giao thông — kế hoạch (làm sau)

- **Xe trên đường**: xe máy (nhiều nhất), ô tô, xe buýt, xe tải giao hàng, người đi bộ — instanced, đi theo làn của
  bản đồ ô (UC-B6), mật độ theo giờ (`trafficProfiles`) — giờ cao điểm 6:30–8:00, 11:30–13:00, 17:00–19:00.
- **Ảnh hưởng gameplay**: kẹt xe giờ cao điểm → giao hàng / xe ôm chậm hơn (đi đường lớn chậm, hẻm nhanh mà xóc);
  khách đi bộ qua quầy nhiều hơn; đèn đỏ ở ngã tư; bãi giữ xe đầy thì khách ít dừng.
- **Hiệu năng (PLAN §1)**: ≤ 60 xe, 1 draw call mỗi loại, tắt xe ở xa camera; trace bằng `chrome-devtools`.
- **Âm thanh**: tiếng xe máy, còi, xe buýt phanh hơi — to theo mật độ.

## 6. ⚖️ Luật & hậu quả — kế hoạch (làm cùng hợp đồng)

| Hành vi | Lợi trước mắt | Hậu quả |
|---|---|---|
| Bán sai món / thối thiếu cố ý | thêm tiền | khách bắt lỗi, uy tín ↓, đánh giá xấu (đã có) |
| Thay phụ tùng không cần (sửa xe) | thêm tiền | xác suất bị phát hiện → hoàn tiền + uy tín ↓↓ |
| Bỏ hợp đồng / trễ hạn | rảnh tay | mất tiền cọc (escrow), điểm tin cậy ↓, bị cấm nhận hợp đồng vài ngày |
| Spam chat, lừa đảo giao dịch | — | tắt tiếng, khoá giao dịch, kiểm duyệt tài khoản |
| Bán hàng hỏng | tiết kiệm vốn | khách đau bụng → phàn nàn, phạt vệ sinh (phí) |

- **Điểm tin cậy** (trust) tách khỏi uy tín quầy: thấp thì không nhận được hợp đồng lớn, chợ người chơi giới hạn.
- Mọi khoản phạt / hoàn tiền đi qua sổ cái với `reason` riêng (`penalty:*`, `refund:*`) để đo lường.

---

## Lộ trình

| Phase | Nội dung | Kiểm chứng |
|---|---|---|
| **1.16a** | 📖 Chuyện của tôi | e2e server mốc; Playwright `chuyen-cua-toi` |
| **1.16b** | 📅 Thứ trong tuần + chợ đêm thứ Bảy | sim test; Playwright `cho-dem` |
| **1.16c** | 🏙️ Khu phố + tiếng khu (emergent) | sim test, `pnpm balance` |
| **1.16d** | 🌆 Trong lúc bạn vắng | e2e server; Playwright |
| 1.17 | 🚦 Giao thông có xe + ảnh hưởng giao hàng | trace hiệu năng, Playwright |
| 1.18 | ⚖️ Hợp đồng + điểm tin cậy + phạt | e2e escrow |
