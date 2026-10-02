import { expect, test } from "@playwright/test";
import { openBanhMiStall, register, shot, waitForMorning } from "./helpers";

// Giọng thoại theo kiểu khách + công tắc "thoại mặn" (docs/USECASES.md UC-D6).
test("khách gọi món theo giọng riêng; tắt thoại mặn trong Cài đặt thì nhớ trên máy", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await register(page, "Giọng");
  await waitForMorning(page, 9);
  await openBanhMiStall(page);
  // Lời gọi món hiện trên đầu khách — câu theo giọng kiểu khách, không còn một câu chung cho mọi người.
  const cook = page.getByRole("button", { name: /Làm món cho khách/ });
  await expect(cook).toBeVisible({ timeout: 90_000 });
  await cook.tap();
  const kitchen = page.getByRole("dialog", { name: "Làm món" });
  await expect(kitchen).toBeVisible();
  await shot(page, "96-giong-khach");
  await kitchen.getByRole("button", { name: "Để đó, làm sau" }).tap();
  await expect(kitchen).toHaveCount(0);

  await page.getByRole("button", { name: "Cài đặt" }).tap();
  const toggle = page.getByRole("switch", { name: /Thoại mặn/ });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.tap();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(toggle).toContainText("Tắt — lời lẽ hiền");
  await shot(page, "97-thoai-man");
  await page.reload();
  await page.getByRole("button", { name: "Cài đặt" }).tap();
  await expect(page.getByRole("switch", { name: /Thoại mặn/ })).toHaveAttribute(
    "aria-checked",
    "false",
  );
});
