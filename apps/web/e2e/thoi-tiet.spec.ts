import { expect, test } from "@playwright/test";
import { readDialogue, register, setWeather, shot } from "./helpers";

// Thời tiết (docs/USECASES.md UC-B4): biểu tượng trời trong thanh 🕒, dải tin báo trước "có mưa",
// trời đổ mưa thì có thông báo + hạt mưa + trời tối hơn; giông bão.

test("trời đổi: báo trước có mưa, mưa xuống, rồi giông bão", async ({ page }) => {
  await register(page, "Mưa");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  const sky = page.locator("[data-weather]");
  await expect(sky).toHaveAttribute("data-weather", /^(sunny|cloudy|rain|storm)$/);

  // Trời nắng, nửa tiếng nữa có mưa → dải tin báo trước, thanh giờ hiện "› (mây mưa)".
  await setWeather(page, "sunny", 0, 30);
  await setWeather(page, "rain", 30, 120);
  await expect(sky).toHaveAttribute("data-weather", "sunny");
  await expect(sky.locator("[data-next]")).toHaveAttribute("data-next", "rain");
  await expect(page.getByText(/có mưa — chuẩn bị dời vô chỗ có mái/)).toBeVisible({
    timeout: 30_000,
  });
  await shot(page, "50-bao-truoc-mua");

  // Tới giờ thì mưa thật: thông báo + biểu tượng đổi.
  await expect(sky).toHaveAttribute("data-weather", "rain", { timeout: 30_000 });
  await expect(page.getByText(/Trời đổ mưa — xe đẩy vắng khách/).first()).toBeVisible();
  await page.waitForTimeout(2500);
  await shot(page, "51-troi-mua");

  await setWeather(page, "storm", 0, 60);
  await expect(sky).toHaveAttribute("data-weather", "storm");
  await expect(page.getByText(/Mưa bão!/).first()).toBeVisible();
  await page.waitForTimeout(2500);
  await shot(page, "52-giong-bao");
});
