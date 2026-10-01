import { expect, test } from "@playwright/test";
import { readDialogue, register, shot } from "./helpers";

// "Trong lúc bạn vắng…" (docs/THEGIOI.md §4, docs/USECASES.md UC-M4): vào lại game sau một lúc vắng thì thấy chuyện thật đã
// xảy ra ở xóm (ngày đã qua, đánh giá, quầy hàng xóm, công trình, giá chợ) — không có tiền tự sinh.
test("vào lại sau khi vắng: thấy 'Trong lúc bạn vắng…', đóng rồi chơi tiếp", async ({ page }) => {
  await register(page, "Vắng");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  const money = await page.locator("[data-money]").getAttribute("data-money");
  // Lệnh thử nghiệm (bản dev): lần rời xóm tới ghi như đã vắng 45 phút, xóm qua 2 ngày.
  const ok = await page.evaluate(async () => {
    const dbg = (
      window as unknown as {
        xomDebug?: { send: (e: string, p: unknown) => Promise<{ ok: boolean }> };
      }
    ).xomDebug;
    return (await dbg?.send("debug:away", { minutes: 45, days: 2 }))?.ok ?? false;
  });
  expect(ok).toBe(true);
  await page.reload();

  const away = page.getByRole("dialog", { name: /Trong lúc bạn vắng \(45 phút\)/ });
  await expect(away).toBeVisible({ timeout: 30_000 });
  await expect(away.locator("[data-away]")).toContainText("Xóm đã qua 2 ngày");
  await expect(away).toContainText("tiền chỉ vào khi có người đứng bán");
  await shot(page, "86-khi-vang");
  await away.getByRole("button", { name: "Vào xóm thôi 👋" }).tap();
  await expect(away).toHaveCount(0);
  // Không có tiền tự sinh khi vắng.
  await expect(page.locator("[data-money]")).toHaveAttribute("data-money", money ?? "");
});
