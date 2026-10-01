import { expect, test } from "@playwright/test";
import { readDialogue, register, shot } from "./helpers";

// Tách 💵 tiền mặt / 🏦 ngân hàng (docs/USECASES.md UC-I6): đi tới cây ATM gửi tiền, rút tiền; HUD chỉ hiện tiền mặt.
test("ra cây ATM gửi tiền vào tài khoản rồi rút ra", async ({ page }) => {
  await register(page, "Ngân");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  const cash = page.locator("[data-money]");
  await expect(cash).toHaveAttribute("data-money", "1500000");

  await page.getByRole("button", { name: "Hồ sơ" }).tap();
  await expect(page.getByText("🏦 Tài khoản ngân hàng")).toBeVisible();
  await page.getByRole("button", { name: "🚶 Tới cây ATM gần nhất" }).tap();
  // Tới nơi thì bảng ATM tự mở.
  const atm = page.getByRole("dialog", { name: "🏧 Cây ATM" });
  await expect(atm).toBeVisible({ timeout: 40_000 });
  await shot(page, "70-atm");

  const deposit = atm.getByRole("region", { name: "Gửi tiền" });
  await deposit.getByRole("button", { name: /^\s*100\.000đ$/ }).tap();
  await expect(atm.locator("[data-bank]")).toHaveAttribute("data-bank", "100000");
  await expect(cash).toHaveAttribute("data-money", "1400000");

  const withdraw = atm.getByRole("region", { name: "Rút tiền" });
  await withdraw.getByRole("button", { name: /^\s*50\.000đ$/ }).tap();
  await expect(atm.locator("[data-bank]")).toHaveAttribute("data-bank", "50000");
  await expect(cash).toHaveAttribute("data-money", "1450000");
  await shot(page, "71-atm-rut");
});
