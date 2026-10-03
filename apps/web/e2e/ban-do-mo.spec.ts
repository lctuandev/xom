import { expect, type Page, test } from "@playwright/test";
import { content } from "@xom/content";
import { landPrice } from "@xom/sim";
import {
  closeSheet,
  grantMoney,
  openBanhMiStall,
  openFeature,
  register,
  serveCustomer,
  setClock,
  setWeather,
  shot,
  waitForMorning,
} from "./helpers";

/** Gọi hook dev `window.xomDebug` (chỉ bản dev). */
const dbg = <T>(page: Page, expr: string) => page.evaluate<T>(`window.xomDebug.${expr}`);

// Bản đồ mở bước A (docs/BANDO.md, UC-B12): xóm mở thêm khu phía đông → lưới ghép rộng ra, đi bộ sang khu mới theo đường nối.
test("xóm mở thêm khu phía đông: lưới rộng ra, đi bộ sang khu mới", async ({ page }) => {
  test.setTimeout(120_000);
  await register(page, "Mở khu");
  const before = await dbg<{ cols: number; rows: number }>(page, "map()");
  const res = await dbg<{ ok: boolean }>(page, 'send("debug:chunk", { chunkId: "khu_dong" })');
  expect(res.ok).toBe(true);
  await expect.poll(() => dbg<number>(page, "map().cols")).toBeGreaterThan(before.cols);
  expect(await dbg<number>(page, "map().rows")).toBe(before.rows);

  // Phố chính (z = 0) nối sang khu đông: đi tới giữa khu mới.
  await dbg(page, "walk(84, 0)");
  await expect.poll(() => dbg<number>(page, "pos().x"), { timeout: 60_000 }).toBeGreaterThan(70);
  await shot(page, "99-khu-dong");
});

// Bước B: khu mới có chỗ bán riêng — chọn "Đầu phố mới" ở khu đông, đẩy xe tới, mở quầy, bán được.
test("bán ở chỗ mới của khu phía đông", async ({ page }) => {
  test.setTimeout(420_000);
  await register(page, "Khu đông");
  await waitForMorning(page, 10);
  const res = await dbg<{ ok: boolean }>(page, 'send("debug:chunk", { chunkId: "khu_dong" })');
  expect(res.ok).toBe(true);
  await openBanhMiStall(page, /Đầu phố mới/);
  await expect(page.getByRole("button", { name: /Làm món cho khách/ })).toBeVisible({
    timeout: 90_000,
  });
  expect(await dbg<number>(page, "pos().x")).toBeGreaterThan(52);
  await shot(page, "99-quay-khu-dong");
  await serveCustomer(page);
});

// Bước C: 🗺️ bản đồ xóm thu nhỏ trong 📍 Chỗ bán — mở khu thì bản đồ rộng ra; chạm chấm chỗ bán ở khu mới thì dòng đó được tô.
test("bản đồ xóm trong Chỗ bán: chạm chỗ của khu mới", async ({ page }) => {
  test.setTimeout(240_000);
  await register(page, "Bản đồ");
  await waitForMorning(page, 10);
  await openBanhMiStall(page);
  // Đổi chỗ phải đóng quầy trước.
  await openFeature(page, "stall");
  await page.getByRole("button", { name: "Đóng quầy" }).tap();
  await openFeature(page, "lot");
  const canvas = page.locator("[data-xom-map]");
  await expect(canvas).toHaveAttribute("data-xom-map", "27x15");
  const res = await dbg<{ ok: boolean }>(page, 'send("debug:chunk", { chunkId: "khu_dong" })');
  expect(res.ok).toBe(true);
  await expect(canvas).toHaveAttribute("data-xom-map", "41x15");
  await shot(page, "99-ban-do-xom");

  // Chạm đúng chấm "Đầu phố mới" (khu đông 1,0).
  const lotId = "khu_dong__dau_pho__1_0";
  const map = await dbg<{ cols: number; origin: { x: number; z: number }; tile: number }>(
    page,
    "map()",
  );
  const lot = content.lot(lotId).position;
  const box = await canvas.boundingBox();
  if (!box) throw new Error("không thấy bản đồ");
  const cell = box.width / map.cols;
  await page.touchscreen.tap(
    box.x + ((lot.x - map.origin.x) / map.tile + 0.5) * cell,
    box.y + ((lot.z - map.origin.z) / map.tile + 0.5) * cell,
  );
  const row = page.locator(`[data-lot="${lotId}"] button`);
  await expect(row).toHaveAttribute("data-focus", "true");
  await expect(row).toBeInViewport();
  await expect(row).toContainText("Đầu phố mới");
});

// Bước C: ⛺ sạp có mái trên ô đất của khu mới — trả phí dựng sạp một lần, mưa vẫn có khách.
test("dựng sạp có mái ở khu đông, mưa vẫn bán", async ({ page }) => {
  test.setTimeout(420_000);
  await register(page, "Sạp mái");
  await waitForMorning(page, 10);
  const res = await dbg<{ ok: boolean }>(page, 'send("debug:chunk", { chunkId: "khu_dong" })');
  expect(res.ok).toBe(true);
  // Đủ tiền mặt dựng sạp (người mới chỉ có ít tiền mặt, phần lớn trong 🏦).
  await grantMoney(page, 600_000);
  await openBanhMiStall(page, /Sạp có mái — ô đất A/);
  await shot(page, "99-sap-co-mai");
  await openFeature(page, "stall");
  await expect(page.locator('[data-stall-task="lot"]')).toContainText("Sạp có mái");
  await closeSheet(page);
  // Trời mưa: sạp có mái vẫn có khách ghé.
  await setWeather(page, "rain");
  await expect(page.getByRole("button", { name: /Làm món cho khách/ })).toBeVisible({
    timeout: 90_000,
  });
  await serveCustomer(page);
});

// Bước D: 🏷️ mua đứt ô sạp mình đang thuê (đứng tại ô), ô hiện "của bạn", bán lại cho xóm.
test("mua đứt ô đất đang thuê rồi bán lại", async ({ page }) => {
  test.setTimeout(420_000);
  await register(page, "Chủ đất");
  await waitForMorning(page, 10);
  const res = await dbg<{ ok: boolean }>(page, 'send("debug:chunk", { chunkId: "khu_dong" })');
  expect(res.ok).toBe(true);
  await grantMoney(page, 5_000_000);
  await openBanhMiStall(page, /Sạp có mái — ô đất B/);
  await openFeature(page, "lot");
  const lotId = "khu_dong__sap_mai_b__1_0";
  const money = Number(await page.locator("[data-money]").getAttribute("data-money"));
  await page.locator(`[data-land-buy="${lotId}"]`).tap();
  await expect(page.locator('[data-land="mine"]')).toBeVisible();
  await expect
    .poll(async () => Number(await page.locator("[data-money]").getAttribute("data-money")))
    .toBe(money - landPrice(content, lotId));
  await shot(page, "99-o-dat-cua-minh");
  // Bán đất phải dọn sạp (đóng quầy) trước.
  await openFeature(page, "stall");
  await page.getByRole("button", { name: "Đóng quầy" }).tap();
  await openFeature(page, "lot");
  await page
    .locator('[data-land="mine"]')
    .getByRole("button", { name: /Bán lại/ })
    .tap();
  await expect(page.locator('[data-land="mine"]')).toHaveCount(0);
});

// Bước E: 🏗️ xây tiệm 1 tầng trên ô đất của mình — đang xây không mở sạp; sang ngày xong thì nhà hiện ra, lên cấp 2.
test("xây tiệm 1 tầng trên ô đất của mình", async ({ page }) => {
  test.setTimeout(420_000);
  await register(page, "Xây tiệm");
  await waitForMorning(page, 10);
  const res = await dbg<{ ok: boolean }>(page, 'send("debug:chunk", { chunkId: "khu_dong" })');
  expect(res.ok).toBe(true);
  await grantMoney(page, 8_000_000);
  await openBanhMiStall(page, /Sạp có mái — ô đất A/);
  await openFeature(page, "stall");
  await page.getByRole("button", { name: "Đóng quầy" }).tap();
  await openFeature(page, "lot");
  await page.locator('[data-land-buy="khu_dong__sap_mai_a__1_0"]').tap();
  await page.locator('[data-land-build="tiem_1_tang"]').tap();
  await expect(page.locator("[data-land-site]")).toBeVisible();
  await shot(page, "99-dang-xay");
  // Sang ngày xây xong.
  const day = await dbg<number>(page, "clock().day");
  await setClock(page, 8 * 60, day + content.building("tiem_1_tang").buildDays);
  await expect(page.locator('[data-land="mine"]')).toContainText("Tiệm 1 tầng (cấp 2)");
  await closeSheet(page);
  await openFeature(page, "stall");
  await expect(page.locator('[aria-label="Nâng cấp tiệm"]')).toHaveAttribute("data-level", "2");
  await closeSheet(page);
  await shot(page, "99-tiem-1-tang");
});
