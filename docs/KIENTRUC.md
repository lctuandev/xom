# XÓM — Kiến trúc đợt 2: khách quen, nhân viên, hợp đồng & tin cậy, xe ôm, giao thông

> Gom các góp ý còn lại (THEGIOI §4–6, NGHE §3.2–3.4, §5) thành kiến trúc cụ thể: **nhân vật · luồng · dữ liệu (Prisma) ·
> sim (công thức thuần) · server (intent) · giao diện · kiểm chứng**. Hai luật nền giữ nguyên: *server quyết định*, *tiền chỉ vào
> khi có người làm* (người chơi hoặc nhân viên được trả lương).

```
                ┌──────────── packages/content (zod) ────────────┐
                │ residents · staff · contracts · trust · traffic │
                └──────────────┬─────────────────────────────────┘
                               │ dữ liệu
 packages/sim (thuần, test) ───┼─── regularOf · staffSales · escrowPlan · trustAfter · congestion
                               │
 apps/server (NestJS) ─────────┼─── RegularService · StaffService · ContractService · TrustService · RideService
   Prisma: Resident visits ·   │       │ LedgerService (mọi đồng tiền, có reason)
   Employee · Contract · Trust │       │ GameEvent (đo lường)
                               │
 apps/web (Next + R3F) ────────┴─── sheet/modal theo Luật 12.x · cảnh 3D (xe cộ instanced)
```

---

## 1. 🧑‍🤝‍🧑 Khách quen — NPC có trí nhớ (1.19a) ✅

**Vì sao trước:** rẻ, làm uy tín có ý nghĩa ngay, cảm xúc mạnh ("Bà Tư lại ghé nè").

**Nhân vật:** 24 **cư dân có tên** sống trong xóm (`content.residents`): *Bà Tư bán vé số*, *Anh Lực xe ôm*, *Cô Hạnh giáo viên*,
*Bé Su học lớp 5*, *Chú Phúc bảo vệ*… mỗi người: kiểu khách (archetype, giọng nói), nhà ở (lot gần), giờ hay ra đường, món ưa.

**Luồng:** khách tới quầy là một **cư dân cụ thể** (chọn theo giờ + nhà gần + món ưa). Server đếm số lần người đó mua ở quầy mình.
- Lần 3: *"Bữa nay ghé nữa nè!"* · lần 5 → **Khách quen ❤️**: kiên nhẫn ×1,3, boa nhiều hơn, gọi *"như mọi khi"* (món quen —
  làm nhanh vì đã biết), thỉnh thoảng **dắt theo bạn** (thêm một khách).
- Bỏ quầy 3 ngày liền hoặc làm sai 2 lần liên tiếp → khách quen **giận**, mất ❤️.
- Hồ sơ quầy có **📒 Sổ khách quen**: tên, số lần ghé, món quen.

**Dữ liệu:** `ResidentVisit { ownerId, residentId, visits, lastDay, streakWrong, regularSince? }` (unique owner+resident).
**Sim:** `pickResident(content, minute, lot, product, rand)`, `regularStage(visits, …)`, `regularEffects(stage)`.
**Kiểm chứng:** sim test chọn cư dân/ngưỡng; e2e server lên khách quen sau 5 lần; Playwright `khach-quen`.

## 2. 👩‍🍳 Thuê nhân viên — bán thay khi vắng (1.19b) ✅

**Nhân vật:** người làm thuê NPC ở **bảng tuyển dụng của Anh Tám**: *Thu (siêng, tay vừa)*, *Khoa (nhanh mà hay quên dặn)*,
*Dì Sáu (chậm, khách quý)* — mỗi người: tay nghề, tính cách, lương/giờ. Sau này: người chơi thật nhận làm (UC-H2…H9).

**Luồng:** chủ quầy thuê → giao ca (giờ bắt đầu/kết thúc) → nhân viên **đứng quầy thay**: tự làm món theo tay nghề (có tỉ lệ
sai), tự tính tiền. Hết ca: **phiếu ca** (bán bao nhiêu, sai mấy món, lương trả bao nhiêu). Chủ vắng mà có nhân viên trong ca
thì quầy vẫn mở; "Trong lúc bạn vắng…" có thêm **📈 doanh thu do nhân viên bán · 💸 lương đã trả**.

**Luật & trần:** lương trả **theo giờ** từ ví chủ (không đủ tiền → nhân viên nghỉ); nhân viên **không nhập hàng** (hết hàng thì
dừng bán); tay nghề thấp hơn chủ → uy tín nhích chậm; tối đa 1 ca/ngày/quầy ở bản đầu. → Thu nhập khi vắng có trần
(kho hàng × lãi − lương), không vô hạn.
**Dữ liệu (đã làm):** `Employee { businessId, staffId, shiftId, hiredDay }` + `StaffShift` (phiếu ca); sổ cái `staff_sale`,
`staff_wage`. Ca là dữ liệu (`content.staff.shifts`). Hết hàng giữa ca → nhân viên về sớm, lương tính tới lúc đó.
**Sim (đã làm):** `staffShift` (lưu lượng như quầy thường + sức làm theo phút/món + kho + đúng/sai), `staffWage`, `shiftAt`.
**Server:** `StaffService` — `tickLive` (chủ online mà không đứng quầy), `finishShift` (chủ thoát game: bán nốt ca rồi dọn quầy).
**Kiểm chứng:** sim; e2e server (bán thay khi chủ offline, trả lương, hết hàng dừng); Playwright `thue-nguoi`.

## 3. 📋 Hợp đồng + 🤝 điểm tin cậy + ⚖️ hậu quả (1.20) ✅ bản đầu (việc NPC đặt)

**Nhân vật:** *Bảng việc xóm* ở nhà văn hoá do **Chú Hai tổ trưởng** quản lý — người ghi sổ, phân xử khi hai bên cãi nhau.

**Luồng hợp đồng:** người đăng (NPC hoặc người chơi) ghi việc: *"Giao 20 ổ bánh mì cho trường lúc 7:00"*, *"Chụp ảnh khai trương"*,
*"Phụ hồ 2 giờ"* → **tiền thưởng giữ trong ví `escrow:<id>`** (người đăng trả trước) → người nhận nhận việc (cần đủ điểm tin
cậy) → làm (giao hàng thật / có mặt đúng giờ) → người đăng **nghiệm thu** (hoặc tự nghiệm thu khi điều kiện đo được) → tiền từ
escrow sang người nhận. Trễ hạn / bỏ ngang → hoàn tiền cho người đăng, người nhận mất điểm tin cậy.

**Điểm tin cậy (0–100, bắt đầu 50):** + hoàn thành đúng hạn, + được chấm sao; − bỏ hợp đồng, − bị phàn nàn thối thiếu cố ý,
− bán hàng hỏng. Thấp (< 30): không nhận hợp đồng lớn, bị Chú Hai nhắc; rất thấp (< 15): **khoá đăng/nhận hợp đồng 3 ngày**.
**Phạt & hoàn tiền** đi qua sổ cái với `penalty:*`, `refund:*`.
**Dữ liệu:** `Contract { id, roomId, posterId?, npcPoster?, takerId?, kind, spec Json, reward, deadlineDay/minute, status }`,
`Player.trust Int`. **Sim:** `trustAfter(trust, event)`, `contractCheck(kind, spec, evidence)`.
**Kiểm chứng:** e2e escrow (giữ, trả, hoàn), trust lên/xuống, khoá; Playwright `bang-viec`.
**Đã làm (UC-M7):** việc NPC đặt kiểu *giao N phần món tới một chỗ trước giờ hẹn* (`content.contracts.templates`, 3 việc/ngày/xóm);
cọc 20% của người nhận + thưởng của người đặt vào ví `escrow:<id>`; làm hàng ở quầy (trừ nguyên liệu thật) → đi giao (server
kiểm vị trí + hạn); trễ / bỏ: hoàn thưởng, mất cọc (`penalty:contract`), 🤝 −15; thối thiếu 🤝 −2; < 15 khoá 3 ngày.
`ContractService` (board, take, prepare, deliver, drop, tick, trustEvent).
**Đã làm (1.20b, UC-M8):** việc người chơi đăng là model riêng `Gig` + `GigService` (post, cancel, take, drop, shoot, shot, submit,
review, dispute, tick): người đăng trả trước vào ví `escrow:gig:<id>` + phí ghi sổ vào quỹ xóm; nộp → hạn nghiệm thu 2 giờ (quá thì
tự trả); khiếu nại → phân xử theo điểm bộ ảnh; sao người nhận lưu `Player.gigs / gigStars`. Việc đầu tiên: 📸 chụp ảnh quầy.

## 4. 🛵 Xe ôm (1.21) ✅ bản đầu

**Nhân vật:** **Anh Lực** — trưởng trạm xe ôm gốc me đầu ngõ, cho người mới thuê xe *Wave cũ* 30k/ngày.
**Luồng:** đứng ở trạm → khách vẫy (cư dân cụ thể, có điểm đến) → **trả giá** (giá chuẩn theo khoảng cách; nói thách quá → khách
đi bộ) → đưa mũ → chạy theo ghim (chọn **đường lớn** — kẹt giờ cao điểm — hay **hẻm** — xóc, chậm khi mưa) → tới nơi → thu tiền
mặt, thối → khách chấm sao (xe ôm uy tín thì khách quen gọi riêng).
**Money sink:** thuê xe / xăng mỗi chuyến; xe hao mòn → tiệm sửa xe (người chơi hoặc Chú Chín).
**Dữ liệu:** dùng lại Shift (job `xe_om`) + đường đi giao hàng (UC-W5); `content.rides` (giá/km, mức thách được chấp nhận).
**Đã làm (UC-N1):** xe ôm là nghề *tự chạy* (không qua Shift — không có chủ trả lương): `RideService` giữ cuốc trong bộ nhớ
(thuê xe theo ngày lưu `Player.bikeRentDay`); trạm là địa điểm kind `ride`; đường lớn / hẻm = A* có trọng số loại ô
(`ROUTE_WEIGHTS`); tốc độ theo `congestion(minute)` + mưa; server kiểm thời gian chạy tối thiểu. Còn lại: xe hao mòn, mua xe
riêng, khách quen gọi riêng.

## 5. 🚦 Giao thông (1.21, cùng xe ôm) ✅ bản đầu

- **Cảnh 3D:** xe máy, ô tô, xe buýt, xe ba gác chạy theo làn trên bản đồ ô (UC-B6) — **instanced** (1 draw call/loại), tối đa
  60 xe, xe ở xa camera không vẽ; mật độ theo `trafficProfiles` giờ cao điểm. Đèn đỏ ở ngã tư (xe dừng theo pha).
- **Gameplay:** `congestion(minute)` (0–1) do sim tính từ lưu lượng → tốc độ đi đường lớn giảm (giao hàng, xe ôm), hẻm không
  đổi; mưa thêm chậm. Khách đi bộ qua quầy nhiều hơn giờ cao điểm (đã có trong lưu lượng).
- **Âm thanh:** tiếng xe máy, còi theo mật độ.
- **Hiệu năng:** trace bằng chrome-devtools CPU ×4 trước khi xong (PLAN §1).
- **Đã làm (UC-N2):** `scene/Traffic.tsx` — làn từ bản đồ ô, xe dựng bằng khối (chưa có model), đèn đỏ để sau; đo FPS CPU ×4 bật/tắt không khác biệt.

---

## Thứ tự & đo lường

| Phase | Nội dung | Đo (GameEvent) |
|---|---|---|
| **1.19a** ✅ | Khách quen | `regular_new`, tỉ lệ khách quen quay lại |
| **1.19b** ✅ | Thuê nhân viên + doanh thu khi vắng | phiếu ca `StaffShift` (bán, sai, lương) |
| **1.20** ✅ | Hợp đồng (NPC) + tin cậy + phạt | `contract_take/done/fail`, phân bố trust |
| **1.21** ✅ | Xe ôm + giao thông | `ride_*`, thời gian giao hàng theo giờ |

Mỗi phase: use case trong `docs/USECASES.md` (nhóm M/N), dòng FEATURES, `pnpm balance` nếu đụng tiền, Playwright iPhone + Pixel.
