import { expect, type Page, test } from "@playwright/test";
import { grantMoney, openBanhMiStall, register, setClock, setWeather, shot } from "./helpers";

// Thanh trạng thái trên đầu (Luật 12.6, góp ý chơi thử): màn nhỏ mà tiền 6 chữ số, ngày 2 chữ số, đói/khát, dự báo thời
// tiết, uy tín cùng hiện thì không được tràn ra ngoài — giờ luôn nhìn thấy trọn.
async function crowdedBar(page: Page) {
  await register(page, "Lan");
  await openBanhMiStall(page);
  await setClock(page, 18 * 60 + 24, 36);
  await setWeather(page, "cloudy", 0, 60);
  await setWeather(page, "rain", 60, 120);
  await grantMoney(page, undefined, undefined, { food: 0, drink: 0 });
}

async function expectFits(page: Page, name: string) {
  const bar = page.locator("[data-status-bar]");
  await expect(bar.locator("[data-needs]")).toBeVisible();
  const box = await bar.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(box.scroll).toBeLessThanOrEqual(box.client + 1);
  const clock = await bar.locator("[data-clock]").boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(clock).not.toBeNull();
  expect((clock?.x ?? 0) + (clock?.width ?? 0)).toBeLessThanOrEqual(width);
  await expect(bar.locator("[data-clock]")).toContainText("18:2");
  await shot(page, name);
}

test("thanh trạng thái không tràn khi đông thông tin", async ({ page }) => {
  test.setTimeout(240_000);
  await crowdedBar(page);
  await expectFits(page, "103-thanh-trang-thai");
});

test.describe("màn 360px", () => {
  test.use({ viewport: { width: 360, height: 640 } });
  test("thanh trạng thái không tràn ở màn 360px", async ({ page }) => {
    test.setTimeout(240_000);
    await crowdedBar(page);
    await expectFits(page, "104-thanh-trang-thai-360");
  });
});
