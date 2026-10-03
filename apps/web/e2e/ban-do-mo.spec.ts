import { expect, type Page, test } from "@playwright/test";
import { content } from "@xom/content";
import {
  closeSheet,
  grantMoney,
  openBanhMiStall,
  openFeature,
  register,
  serveCustomer,
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
  test.setTimeout(300_000);
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
  test.setTimeout(300_000);
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
