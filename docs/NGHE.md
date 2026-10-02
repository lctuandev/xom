# XÓM — Kế hoạch nghề nghiệp & việc làm

> Tài liệu sống. Bổ sung cho `docs/DESIGN.md` (luật) và `docs/USECASES.md` (luồng chi tiết từng use case).
> Mọi nghề là **dữ liệu** trong `packages/content`; mỗi nghề chỉ ghép lại các **cơ chế lõi** bên dưới, không viết hệ thống riêng.

---

## 0. XÓM là game gì (chốt)

**XÓM là sandbox đời sống & làm ăn nhiều người chơi trong một xóm Việt Nam.** Không có class cố định, không có một
cách chơi đúng. Sáng chạy xe ôm, trưa phụ quán cơm, chiều mở xe trà sữa, tối đi chụp ảnh khai trương cho hàng xóm.

```
Khám phá → Gặp người → Làm việc → Kiếm tiền → Tiêu / đầu tư → Lớn lên → Chơi cùng nhau → Khám phá
```

Lộ trình gợi ý, không bắt buộc:

```
Làm thuê (không cần vốn) → tích vốn → mở xe đẩy / tiệm nhỏ → thuê người → mở rộng → hệ sinh thái
```

**Không bắt chọn nghề lúc vào game.** Nghề là thứ người chơi *đang làm*, không phải danh tính. Hồ sơ ghi lại
"nghề hay làm" (theo giờ làm thật) để hiện trên bảng xóm và mở khoá kỹ năng.

---

## 1. Chọn nghề cho XÓM

Lọc từ 8 nhóm đề xuất (F&B, bán lẻ, vận chuyển, dịch vụ, sản xuất, sáng tạo, kinh doanh lớn, đời sống) theo 4 tiêu chí:

1. **Hợp một xóm Việt Nam** — thấy được ngoài đời ở xóm/phường (không làm "văn phòng agency" khi xóm chưa có văn phòng).
2. **Chơi được bằng tay trên điện thoại** — có thao tác thật, không phải bấm một nút chờ tiền (Luật 7.1).
3. **Ghép từ cơ chế lõi có sẵn** — càng dùng lại nhiều càng tốt (§2).
4. **Tạo phụ thuộc giữa người chơi** — nghề này cần nghề kia (§4).

### Đợt 1 — MVP nghề (phase 1.12 → 1.14)

| # | Nghề | Nhóm | Tầng | Cách kiếm tiền | Trạng thái |
|---|---|---|---|---|---|
| 1 | Xe bánh mì · xe trà sữa | 🍜 F&B | 2 | bán món tự làm | ✅ có |
| 2 | Sạp phụ kiện | 🛍️ Bán lẻ | 2 | nhập sỉ bán lẻ | ✅ có |
| 3 | Phụ quán cơm (múc cơm / thu ngân / bưng bê) | 💼 Làm thuê | 1 | lương giờ + tiền việc | ✅ có |
| 4 | Giao hàng bưu cục | 🚚 Vận chuyển | 1 | tiền chuyến | ✅ có |
| 5 | **Tiệm sửa xe** | 🔧 Dịch vụ | 2 | tiền công + phụ tùng | ✅ bản đầu (UC-G1…G4) |
| 6 | **Xe ôm** | 🚚 Vận chuyển | 1 | tiền cuốc | ⏳ |
| 7 | **Thợ chụp ảnh / review quán** | 🎬 Sáng tạo | 1→2 | hợp đồng chụp, tiền quảng cáo | ⏳ |
| 8 | **Phụ hồ công trình xóm** | 🏗️ Xây dựng | 1 | công nhật từ quỹ xóm | ⏳ |
| 9 | **Tiệm tạp hoá** (có sổ ghi nợ) | 🛍️ Bán lẻ | 2 | bán lẻ nhiều mặt hàng | ⏳ |
| 10 | **Tiệm cắt tóc** | 🔧 Dịch vụ | 2 | tiền công | ⏳ (đi cùng cá nhân hoá) |

### Đợt 2 — mở rộng khi kinh tế đợt 1 chạy ổn

| Nghề | Vì sao để sau |
|---|---|
| 🌾 Vườn rau / nuôi gà → bán cho chợ & người chơi | cần hệ thống mùa vụ + chợ người chơi |
| 🚛 Xe ba gác / xe tải chở hàng, kho | cần hợp đồng + nhiều người chơi buôn bán |
| 🏠 Nhà trọ cho thuê, môi giới mặt bằng | cần hệ thống tài sản (mua nhà) |
| 🎪 Tổ chức sự kiện (đám cưới, chợ đêm) | cần hợp đồng nhiều bên |
| 🐶 Thú cưng | không phải lõi kinh tế |
| 💻 Thợ sửa điện thoại / máy tính, dev freelancer | khi xóm có khu văn phòng / trường lớn |

---

## 2. Cơ chế lõi (engine) — mọi nghề ghép từ đây

| Cơ chế | Đã có | Dùng cho |
|---|---|---|
| **Ca làm (Shift)** — vào nơi làm, chọn vai, lương giờ + tiền việc, lỗi → nghỉ | ✅ quán cơm, bưu cục | phụ quán, giao hàng, phụ hồ, xe ôm |
| **Khách & đơn (Order)** — khách tới, nêu yêu cầu, chờ, trả tiền, đánh giá | ✅ quầy | bán món, bán lẻ, sửa xe, cắt tóc |
| **Kho (Inventory)** — nhập theo lô, hỏng, FIFO | ✅ | nguyên liệu, phụ tùng, hàng tạp hoá |
| **Làm ra (Production)** — các bước tay theo công thức | ✅ khay / lưới | món ăn; **sửa xe dùng biến thể "chẩn đoán → sửa"** |
| **Đi đường (Transport)** — ghim, đường đi, chạy nhanh/chậm | ✅ giao hàng | xe ôm, giao đồ ăn, chở hàng |
| **Hợp đồng (Contract)** — bên thuê, bên nhận, yêu cầu, hạn, tiền giữ, uy tín | ⏳ **mới** | chụp ảnh, phụ hồ, đặt hàng số lượng lớn |
| **Uy tín & đánh giá** | ✅ | mọi nghề |
| **Sổ cái tiền** (LedgerService) | ✅ | mọi nghề — **tiền giữ của hợp đồng đi qua ví `escrow:`** |
| **Kỹ năng** | ✅ | mỗi nghề một kỹ năng, mở khoá thao tác |
| **Chỗ / tài sản (Lot, House)** | ✅ thuê | mọi tiệm |

**Quy tắc dữ liệu:** thêm nghề = thêm config (`templates`, `products`/`services`, `jobs`, `npcs`, `places`) +
câu thoại + âm thanh. Không `if (business === "sua_xe")` trong code.

---

## 3. Chi tiết từng nghề (đợt 1)

Mỗi nghề có: **người dẫn** (NPC dạy nghề) · **luồng** · **hướng dẫn** · **hành vi khách / thế giới** · **âm thanh** ·
**tiền vào / tiền ra** · **tiến trình** · **câu chuyện**.

### 3.1 🔧 Tiệm sửa xe — template `SERVICE` (UC-G1…G4)

**Người dẫn:** **Chú Chín** — thợ già, mở *Tiệm phụ tùng Chú Chín* cạnh vựa xe. Cộc nhưng thương người mới;
câu cửa miệng *"Nghe xe nói gì đã, đừng vội tháo."*

**Câu chuyện:** Chú Chín sửa xe cho cả xóm 30 năm, giờ mắt kém muốn "truyền nghề". Người chơi mua bộ đồ nghề ở vựa
Ông Sáu, lấy phụ tùng của chú. Sửa đủ 20 xe → chú giao "mối quen" (khách VIP sửa định kỳ). Có khách là
**thằng Tí** — chạy xe ẩu, tuần nào cũng thủng lốp, rất hợp để luyện tay.

**Luồng một khách:**
1. Khách dắt xe tới quầy, khung thoại kể **triệu chứng**, không nói bệnh: *"Xe đạp hoài không nổ"*, *"Bánh sau xẹp lép"*.
2. Màn **chẩn đoán**: hình xe máy, các bộ phận chạm được (lốp trước, lốp sau, bugi, xích, bình điện, đèn, phanh).
   Mỗi lần **kiểm tra** tốn vài giây và hiện kết quả: *"Lốp sau: thấy đinh cắm"*, *"Bugi: bình thường"*.
3. **Báo giá** = tiền công (theo bệnh) + giá phụ tùng. Khách đồng ý / chê đắt (giá cao hơn chuẩn thì có thể bỏ đi).
4. **Sửa**: lấy đúng phụ tùng trong kho (ruột xe, bugi, má phanh, bóng đèn…), làm các bước tay (tháo → thay → lắp).
5. Khách **chạy thử**: đúng bệnh → trả tiền, khen; sai bệnh → xe vẫn hư → khách bực, uy tín giảm, phải sửa lại.

**Hành vi:** một triệu chứng nhiều bệnh (không nổ: bugi / hết bình / nghẹt xăng) → phải loại trừ. Kiểm tra lung tung
lâu → khách sốt ruột. Thay phụ tùng không cần thiết → có xác suất khách phát hiện → uy tín −−.
Trời mưa → nhiều xe chết máy, thủng lốp (ổ gà) → khách đông.

**Âm thanh:** cờ lê lách cách, bơm hơi xì xì, đề máy "rì rì… nổ", máy nổ giòn khi sửa xong, khách thở phào.

**Tiền:** vào = tiền công (20k–80k) + chênh phụ tùng; ra = bộ đồ nghề (một lần), phụ tùng (vốn), tiền chỗ, phí chợ,
hao mòn đồ nghề. Phụ tùng không hỏng theo ngày nhưng vốn lớn.

**Tiến trình:** kỹ năng *Tay nghề sửa xe* → mở bệnh khó hơn (xích, bình điện, phanh) và rút thời gian kiểm tra.
Xe đẩy đồ nghề → tiệm sửa xe trong nhà mặt tiền → thuê thợ phụ.

### 3.2 🛵 Xe ôm — việc làm (Transport)

**Người dẫn:** **Anh Tám** (bưu cục) cho thuê xe máy theo ngày nếu chưa có xe.
**Câu chuyện:** đầu ngõ có "trạm xe ôm" dưới gốc me; mấy chú xe ôm già nhường mối cho người mới nếu người mới lễ phép.

**Luồng:** đứng ở trạm → NPC vẫy (*"Xe ôm! Chợ bao nhiêu con?"*) → **trả giá** (theo khoảng cách; nói thách quá thì
khách đi bộ) → đưa mũ bảo hiểm → chạy theo ghim (chọn đường: đường lớn kẹt giờ cao điểm, hẻm nhanh mà xóc) → tới
nơi → khách trả tiền mặt (thối tiền) → khách chấm sao.
**Hành vi:** giờ cao điểm đông khách nhưng kẹt xe; mưa → khách nhiều, trả thêm; khách say xỉn ban đêm, khách quên đồ.
**Âm thanh:** tiếng xe máy, còi, mưa lộp độp trên áo mưa, khách nói chuyện phiếm trên đường.
**Tiền:** vào = tiền cuốc; ra = thuê xe / xăng (money sink mới), sửa xe → **cần tiệm sửa xe của người chơi**.

### 3.3 📸 Thợ chụp ảnh / reviewer — Sáng tạo (Contract)

**Người dẫn:** **Bé Na** — học sinh lớp 11 có kênh "Na Ăn Gì" 3 nghìn người theo dõi, cần người quay phụ.
**Luồng:** nhận **hợp đồng** trên *Bảng việc xóm*: chụp ảnh khai trương quầy X, review món ở quầy Y, chụp ảnh cưới.
Tới nơi → chế độ chụp (khung ngắm, chờ đúng khoảnh khắc: khách cười, món bốc khói, pháo giấy nổ) → chọn 3 ảnh đẹp
nhất → nộp. Điểm ảnh theo bố cục + khoảnh khắc → tiền hợp đồng + **quầy được tăng khách (boost)** vài giờ.
**Phụ thuộc người chơi:** chủ quầy *thuê* thợ ảnh khi khai trương; reviewer làm quầy đông → hai người kiếm tiền từ nhau.
**Âm thanh:** tiếng màn trập, "1, 2, 3 cười!", tiếng xóm reo khi đăng bài viral.
**Đã làm (UC-M8):** chụp ảnh quầy theo việc chủ quầy đăng ở tab 📸 Thuê nhau — thuê máy 20k, khung ngắm canh khoảnh khắc (server
chấm theo giờ server), nộp 3 tấm đẹp nhất, chủ nghiệm thu + chấm sao; ảnh đăng nhóm xóm kéo khách. Chưa có: review món, ảnh cưới.

### 3.4 🏗️ Phụ hồ công trình xóm — Contract × Quỹ xóm (UC-J5)

**Người dẫn:** **Cai Lâm** — cai thầu công trình của xóm.
**Luồng:** công trình quỹ xóm đang thi công (cầu, đường, ao) mở **ca phụ hồ**: trộn hồ (đúng tỉ lệ cát/xi măng/nước),
khiêng gạch (xếp đúng chỗ), đẩy xe rùa. Mỗi ca rút ngắn thời gian thi công; trả **công nhật từ quỹ xóm**.
**Ý nghĩa:** người mới không vốn vẫn góp sức cho công trình chung — gắn với vòng "sự kiện chung".
**Đã làm (UC-J6):** trộn vữa theo định mức thật ở công trường, công trả từ khoản nhân công trích trong chi phí công trình, đủ mẻ thì xong sớm. Chưa có: khiêng gạch, xe rùa.
**Âm thanh:** xẻng xúc cát, máy trộn quay, búa gõ, tiếng hò "một hai ba lên!".

### 3.5 🏪 Tiệm tạp hoá — RETAIL mở rộng

**Người dẫn:** **Dì Hai** — chủ tạp hoá đầu xóm sắp về quê, sang lại mối hàng.
**Luồng:** nhập sỉ ở *Đại lý Ông Lớn* (mì gói, nước mắm, dầu ăn, nước ngọt, thẻ cào) → xếp kệ → khách hỏi
(*"Có nước mắm Nam Ngư không con?"*) → tìm trên kệ → tính tiền → **ghi sổ nợ** cho khách quen (đòi nợ cuối tuần;
có khách khất mãi).
**Hành vi:** hàng không hỏng nhanh nhưng chiếm vốn; Tết bán chạy; đối thủ là "tiệm tạp hoá" của người chơi khác.
**Âm thanh:** tiếng lục lọi kệ, máy tính tiền bỏ túi, tiếng mở nắp chai.

### 3.6 💈 Tiệm cắt tóc — SERVICE (đi cùng cá nhân hoá #16)

**Người dẫn:** **Anh Bảy Râu** — thợ cắt tóc vỉa hè có gương treo gốc cây.
**Luồng:** khách ngồi ghế, chọn kiểu (đầu đinh, mái bằng, uốn) → các bước cắt (tông đơ, kéo, cạo) → khách soi gương
→ hài lòng hay không. **Người chơi khác** tới cắt thật → đổi kiểu tóc nhân vật (cá nhân hoá).
**Âm thanh:** tông đơ rè rè, kéo lách tách, radio cải lương.

---

## 4. Phụ thuộc giữa người chơi (vì sao cần nhau)

```
Chợ Bà Năm ──► Xe bánh mì ──► Khách ăn
                    ▲              │
Thợ chụp ảnh ───────┘ (khai trương, review → tăng khách)
Xe ôm ──────► hỏng xe ──► Tiệm sửa xe ──► Tiệm phụ tùng Chú Chín
Quỹ xóm ────► công trình ──► Phụ hồ (công nhật)
Tạp hoá ────► bán sỉ nước ngọt ──► Xe trà sữa / quán ăn của người chơi
```

Bắt đầu bằng NPC lấp chỗ (Chú Chín sửa xe NPC, Bé Na review NPC). Khi có người chơi làm nghề đó, **người chơi được ưu tiên**
(khách tìm người chơi trước, NPC chỉ lấp khi xóm không ai làm — UC-H9).

---

## 5. Hệ thống nền tảng cần thêm (theo góp ý)

| Hệ thống | Làm gì ở XÓM | Khi nào |
|---|---|---|
| **Hợp đồng (Contract)** | Bảng việc xóm: NPC & người chơi đăng việc (chụp ảnh, đặt 30 ổ bánh mì cho trường, phụ hồ). Tiền giữ trong ví `escrow:`, hạn chót, nghiệm thu, uy tín hai chiều | đợt 1 (cùng thợ ảnh) |
| **Khu trong xóm (Neighborhood)** | `trafficProfiles` đã có (cổng trường / văn phòng / trong hẻm) → thêm **nhu cầu theo khu** (cổng trường thích đồ rẻ, gần chợ thích sửa xe) | đợt 1 (cùng sửa xe) |
| **Khách quen (NPC memory)** | NPC nhớ quầy đã ăn ≥5 lần → *Khách quen ❤️* ghé thường hơn, giới thiệu bạn | đợt 1 |
| **Tổ chức (Company)** | nhiều người chơi chung một "cơ sở", chia lương | đợt 2 |
| **Chợ người chơi (Marketplace)** | bán nguyên liệu / phụ tùng cho nhau | đợt 2, có chống thao túng giá |
| **Sự kiện thế giới** | đã có (mưa, khai trương, VIP) → thêm *sửa đường*, *đám cưới*, *món viral* | dần dần |

**Bảng xếp hạng nhiều hạng mục** (UC-P2) thêm hạng mục theo nghề: *Thợ sửa xe uy tín*, *Xe ôm được khen*, *Thợ ảnh của tuần* —
người mới vẫn có cơ hội đứng top ở nghề của mình.

---

## 6. Kinh tế khi thêm nghề

- Mỗi nguồn thu mới **phải đi kèm chỗ tiêu**: sửa xe (đồ nghề, phụ tùng), xe ôm (thuê xe, xăng), thợ ảnh (máy ảnh, pin),
  tạp hoá (vốn hàng, kệ). Chạy `pnpm balance` mỗi khi thêm nghề: lãi tay vừa ≥ làm thuê, tay nhanh ≤ 5× làm thuê,
  chênh giữa các nghề ≤ 2,5×.
- **Không thu nhập thụ động không trần**: hợp đồng phải có người làm; mối VIP sửa xe là *khách tới*, không phải tiền tự vào.
- Đo bằng `GameEvent`: nghề nào được chọn, tiền theo `reason` mới (`repair:labor`, `repair:parts`, `xe_om:fare`,
  `contract:pay`, `escrow:hold`).

---

## 7. Lộ trình triển khai

| Phase | Nội dung | Kiểm chứng |
|---|---|---|
| **1.12a** ✅ | 🔧 Tiệm sửa xe: template `SERVICE`, bệnh & phụ tùng bằng dữ liệu, Tiệm phụ tùng Chú Chín, màn chẩn đoán + sửa, khách chạy thử | sim test bệnh/giá, e2e server, Playwright `sua-xe` |
| 1.12b | 🛵 Xe ôm (dùng lại đi đường của giao hàng), trả giá cuốc, thuê xe, xăng | e2e + Playwright `xe-om` |
| 1.13a | 📋 Bảng việc xóm (Contract + escrow) | e2e tiền giữ / hoàn |
| 1.13b | 📸 Thợ chụp ảnh / review (hợp đồng đầu tiên), boost quầy | Playwright `chup-anh` |
| 1.14a | 🏗️ Phụ hồ cho công trình quỹ xóm | Playwright `phu-ho` |
| 1.14b | 🏪 Tạp hoá + sổ nợ | Playwright `tap-hoa` |
| 1.15 | 💈 Cắt tóc + cá nhân hoá | Playwright `cat-toc` |

Mỗi phase: use case trong `docs/USECASES.md`, dòng trong `docs/FEATURES.md`, `pnpm balance`, kịch bản Playwright trên
iPhone + Pixel.
