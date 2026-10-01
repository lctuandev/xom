import { expect, test } from "@playwright/test";
import { readDialogue, register, setClock, setWeather, shot } from "./helpers";

// Giao thông (docs/KIENTRUC.md §5, docs/USECASES.md UC-N2): xe máy, ô tô, xe buýt chạy trên đường lớn; giờ cao điểm (18:00)
// đông hơn hẳn giữa trưa (13:00) — cùng độ kẹt xe với xe ôm.
test("giờ tan tầm đường đông xe hơn giữa trưa", async ({ page }) => {
  await register(page, "Giao thông");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await setWeather(page, "sunny");
  const count = () =>
    page.evaluate(() => (window as unknown as { xomTraffic?: () => number }).xomTraffic?.() ?? -1);

  await setClock(page, 13 * 60);
  await expect.poll(count, { timeout: 15_000 }).toBeGreaterThan(0);
  const noon = await count();
  await setClock(page, 18 * 60);
  await expect.poll(count, { timeout: 15_000 }).toBeGreaterThan(noon + 15);
  expect(await count()).toBeLessThanOrEqual(60);
  await page.waitForTimeout(1500);
  await shot(page, "99-gio-tan-tam");
});
