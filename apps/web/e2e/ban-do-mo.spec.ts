import { expect, type Page, test } from "@playwright/test";
import { register, shot } from "./helpers";

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
