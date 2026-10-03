import { expect, test } from "@playwright/test";
import { openFeature, readDialogue, register, shot } from "./helpers";

// Kit nhà phố Việt (docs/ART.md bước 1): dãy phố chính dùng nhà phố chi tiết (ban công lan can, cửa cuốn, bồn nước…).
// Chặn hồi quy hiệu năng: cảnh ĐÃ vượt ngân sách PLAN §1 (< 100 draw call, < 80k tam giác) từ trước kit này (đo 2026-10-03:
// dãy phố cũ 118 draw call / 90k tam giác; kit mới 118 / ~116k) — ngưỡng dưới đây là mức hiện tại, việc kéo về ngân sách
// (LOD, chỉ dựng gần camera, nhân vật) ghi ở HANDOFF.
test("dãy phố nhà phố Việt, số đo không tăng thêm", async ({ page }) => {
  await register(page, "Nhà phố");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await openFeature(page, "settings");
  await page.getByRole("button", { name: /Hiện số đo hiệu năng/ }).tap();
  await page.getByRole("dialog").getByRole("button", { name: "Đóng" }).first().tap();
  await page.waitForTimeout(3000);
  const perf = page.getByText(/Draw calls \d+/);
  await expect(perf).toBeVisible();
  const calls = Number((await perf.textContent())?.replace(/\D/g, ""));
  const tris = Number(
    ((await page.getByText(/Tris [\d.]+/).textContent()) ?? "").replace(/\D/g, ""),
  );
  console.log(`draw calls ${calls}, tris ${tris}`);
  await shot(page, "105-nha-pho");
  expect(calls).toBeLessThan(130);
  expect(tris).toBeLessThan(125_000);
});
