import { expect, test } from "@playwright/test";
import { openBanhMiStall, register, setClock, setWeather, shot } from "./helpers";

// Thuê nhân viên (docs/KIENTRUC.md §2, docs/USECASES.md UC-M6): Làm ăn → 👩‍🍳 Nhân viên → chọn ca, thuê Thu. Chủ rời quầy
// đi chợ mà Thu trong ca → Thu bán thay, có phiếu ca (bán, sai, thu, lương).
test("thuê Thu ca tối → chủ đi chợ, Thu bán thay và có phiếu ca", async ({ page }) => {
  test.setTimeout(240_000);
  await register(page, "Chủ");
  await openBanhMiStall(page);
  await setWeather(page, "sunny");

  await page.getByRole("button", { name: "Làm ăn" }).tap();
  await page.getByRole("tab", { name: "👩‍🍳 Nhân viên" }).tap();
  const board = page.getByRole("region", { name: "Nhân viên" });
  // Chưa thuê ai: hướng dẫn cách dùng mở sẵn (chọn ca, nhập hàng + mở quầy, rời quầy trong giờ ca, đừng đóng quầy).
  await expect(board.locator("[data-staff-guide]")).toContainText("Đừng đóng quầy");
  await board.getByRole("button", { name: "Ca tối 18–22h" }).tap();
  // Ca chưa tới giờ: báo trước nhân viên mấy giờ mới vào làm.
  await expect(board.locator("[data-shift-later]")).toContainText("18:00");
  await expect(board.locator("[data-staff=thu]")).toContainText("💸 15k/giờ · ca 60k");
  await shot(page, "90-tuyen-nguoi");
  await board.locator("[data-staff=thu]").getByRole("button", { name: "Thuê" }).tap();
  await expect(board.locator("[data-employee=thu]")).toContainText("Thu đang làm cho bạn");
  // Bây giờ là buổi sáng: Thu ngoài giờ làm — nói rõ, rời quầy lúc này là quầy vắng chủ.
  await expect(board.locator("[data-staff-status=off]")).toContainText("ngoài giờ làm");

  // Vào ca tối; chủ bỏ quầy đi chợ — Thu đứng bán thay, thanh dưới báo "đang bán thay" chứ không giục về quầy.
  await setClock(page, 18 * 60);
  await page.getByRole("button", { name: "🧺 Ra chợ mua hàng" }).tap();
  await expect(page.locator("[data-staff-duty=on]")).toContainText(
    "Thu đang bán thay — tới 22:00",
    {
      timeout: 30_000,
    },
  );
  await expect(page.getByText(/👩‍🍳 Thu vừa bán \d+ món thay bạn/).first()).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Làm ăn" }).tap();
  await page.getByRole("tab", { name: "👩‍🍳 Nhân viên" }).tap();
  const slips = page.locator("[data-shift-slips]");
  await expect(slips).toContainText(/Thu · 18:\d\d–/);
  await expect(slips).toContainText(/lương \d/);
  await shot(page, "91-phieu-ca");
});
