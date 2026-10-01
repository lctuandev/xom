import { expect, type Locator, test } from "@playwright/test";
import { readDialogue, register, shot } from "./helpers";

// Cây ATM như ngoài đời (docs/USECASES.md UC-I6): đưa thẻ → tạo PIN → nộp tiền → in biên lai → giao dịch khác
// → rút tiền (mất phí) → nhận tiền → nhận lại thẻ. HUD chỉ hiện tiền mặt.
test("ATM: tạo PIN, nộp tiền, in biên lai, rút tiền có phí, nhận lại thẻ", async ({ page }) => {
  await register(page, "Ngân");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  const cash = page.locator("[data-money]");
  await expect(cash).toHaveAttribute("data-money", "1500000");

  await page.getByRole("button", { name: "Hồ sơ" }).tap();
  await expect(page.getByText("🏦 Tài khoản ngân hàng")).toBeVisible();
  await page.getByRole("button", { name: "🚶 Tới cây ATM gần nhất" }).tap();
  const atm = page.getByRole("dialog", { name: "🏧 Cây ATM" });
  await expect(atm).toBeVisible({ timeout: 40_000 });
  const screen = atm.getByRole("region", { name: "Màn hình ATM" });
  const keypad = atm.getByRole("group", { name: "Bàn phím ATM" });
  const type = async (digits: string) => {
    for (const d of digits) await keypad.getByRole("button", { name: d, exact: true }).tap();
    await keypad.getByRole("button", { name: "Đồng ý" }).tap();
  };
  const tapScreen = (name: string | RegExp, scope: Locator = screen) =>
    scope.getByRole("button", { name }).tap();

  await tapScreen("💳 Đưa thẻ vào");
  await expect(screen.getByText("TẠO MÃ PIN")).toBeVisible();
  await type("123456");
  await expect(screen.getByRole("alert")).toContainText("liên tiếp");
  await type("270915");
  await expect(screen.getByText("Nhập lại mã PIN mới")).toBeVisible();
  await type("270915");
  await expect(screen.getByText("CHỌN GIAO DỊCH")).toBeVisible();
  await shot(page, "70-atm");

  await tapScreen("🏦 Nộp tiền");
  await tapScreen("100.000đ");
  await tapScreen("Đồng ý");
  await expect(screen.getByText("NỘP TIỀN THÀNH CÔNG")).toBeVisible();
  await expect(cash).toHaveAttribute("data-money", "1400000");
  await tapScreen("Tiếp tục");
  await tapScreen("Có");
  await expect(screen.locator("[data-receipt]")).toContainText("Số dư: 100.000đ");
  await shot(page, "71-atm-bien-lai");
  await tapScreen("Đã lấy biên lai");
  await tapScreen("Có");

  await tapScreen("💵 Rút tiền");
  await tapScreen("Số khác");
  await type("50");
  await expect(screen.getByText("Phí: 1.000đ")).toBeVisible();
  await tapScreen("Đồng ý");
  await expect(screen.getByText("MỜI NHẬN TIỀN")).toBeVisible();
  await expect(cash).toHaveAttribute("data-money", "1450000");
  await tapScreen("💵 Đã nhận tiền");
  await tapScreen("Không");
  await tapScreen("Không — nhận lại thẻ");
  await tapScreen("💳 Nhận thẻ");
  await expect(atm).toHaveCount(0);
  // Cây ATM (model Blender) ngay trước mặt nhân vật.
  await page.waitForTimeout(800);
  await shot(page, "72-cay-atm");
});
