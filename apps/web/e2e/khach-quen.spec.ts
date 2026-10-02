import { expect, test } from "@playwright/test";
import { openBanhMiStall, openFeature, register, serveCustomer, shot } from "./helpers";

// Khách quen (docs/KIENTRUC.md §1, docs/USECASES.md UC-M5): khách là cư dân có tên; đã ghé 4 lần (lệnh dev) mà bán đúng lần
// thứ 5 thì ❤️ thành khách quen; Làm ăn → ❤️ Khách quen có sổ.
test("khách quen: bán đúng cho cư dân đã ghé 4 lần → ❤️, có trong sổ khách quen", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await register(page, "Quen");
  await openBanhMiStall(page);
  const ok = await page.evaluate(async () => {
    const dbg = (
      window as unknown as {
        xomDebug?: { send: (e: string, p: unknown) => Promise<{ ok: boolean }> };
      }
    ).xomDebug;
    return (await dbg?.send("debug:regulars", { visits: 4 }))?.ok ?? false;
  });
  expect(ok).toBe(true);

  // Phục vụ tới khi có một cư dân thành khách quen (khách vãng lai không có tên thì không tính).
  const heart = page.getByText(/❤️ .+ thành khách quen của quầy bạn!/).first();
  for (let i = 0; i < 6 && !(await heart.isVisible()); i++) {
    await serveCustomer(page, async (kitchen) => {
      // Khách có tên ghé lần thứ 5 hiện "ghé lần 5".
      await kitchen
        .getByText(/Khách|ghé lần|❤️|Bé|Anh|Chị|Cô|Chú|Bà|Ông|Dì|Bác|Tí|Khoa|Bông/)
        .first()
        .isVisible();
    });
  }
  await expect(heart).toBeVisible({ timeout: 10_000 });
  await shot(page, "88-khach-quen");

  await openFeature(page, "regulars");
  const book = page.getByRole("region", { name: "Sổ khách quen" });
  await expect(book.getByText("❤️").first()).toBeVisible();
  await expect(book.getByText("5 lần").first()).toBeVisible();
  await shot(page, "89-so-khach-quen");
});
