import { expect, test } from "@playwright/test";
import { openFeature, readDialogue, register } from "./helpers";

// Góp ý đợt 4: 👥 Hàng xóm → 🏘️ Các xóm khác → "Dọn về". Hai người hai xóm riêng; A dọn sang xóm B. (Lỗi "Chưa vào xóm"
// gốc do dời ngày đụng khoá DB — tái hiện ở e2e server `xom.e2e-spec.ts` "dọn từ xóm ngày lớn sang xóm ngày nhỏ".)
test("dọn về xóm khác từ danh sách các xóm", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctxB = await browser.newContext({ ...test.info().project.use });
  const b = await ctxB.newPage();
  await register(b, "Chủ xóm B");
  await openFeature(b, "neighbors");
  const codeB = ((await b.locator("[data-xom-code]").textContent()) ?? "").trim();
  expect(codeB.length).toBeGreaterThan(2);

  const ctxA = await browser.newContext({ ...test.info().project.use });
  const a = await ctxA.newPage();
  await register(a, "Người dọn");
  await (await readDialogue(a)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await openFeature(a, "neighbors");
  const row = a.locator(`[data-xom-item="${codeB}"]`);
  await row.scrollIntoViewIfNeeded();
  await row.getByRole("button", { name: /Dọn về/ }).tap();
  await expect(a.getByText("Đã vào xóm mới — chào hàng xóm đi!")).toBeVisible();
  await expect(a.getByText(/Chưa vào xóm/)).toHaveCount(0);
  await openFeature(a, "neighbors");
  await expect(a.locator("[data-xom-code]")).toHaveText(codeB);
  await ctxA.close();
  await ctxB.close();
});
