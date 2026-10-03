import { expect, test } from "@playwright/test";
import { content } from "@xom/content";
import { grantMoney, openBanhMiStall, openFeature, register, setClock, shot } from "./helpers";

// Cấp tiệm + nhiều nhân viên (docs/USECASES.md UC-M9, docs/IA.md bước E): tiệm nhà mặt tiền ⬆️ nâng lên Tiệm mở rộng
// (trả tiền) → thuê được 2 người cùng lúc; xe đẩy thì không nâng cấp được.
test("nâng cấp tiệm rồi thuê 2 nhân viên cùng lúc", async ({ page }) => {
  test.setTimeout(300_000);
  await register(page, "Chủ tiệm lớn");
  await openBanhMiStall(page);
  await grantMoney(page, 3_000_000);
  await setClock(page, 8 * 60);

  // Xe đẩy vỉa hè: chưa lên cấp được.
  await openFeature(page, "stall");
  const stall = page.getByRole("dialog", { name: /của tôi$/ });
  await expect(stall.locator("[data-level]")).toContainText("Xe đẩy vỉa hè không lên cấp");
  await stall.getByRole("button", { name: /^Đóng (quầy|tiệm|sạp)$/ }).tap();

  // Thuê nhà mặt tiền + đủ giấy tờ (lệnh dev; quy trình giấy tờ có kịch bản mo-tiem) rồi nâng cấp.
  const ok = await page.evaluate(async () => {
    const dbg = (
      window as unknown as {
        xomDebug?: { send: (e: string, p: unknown) => Promise<{ ok: boolean }> };
      }
    ).xomDebug;
    return (await dbg?.send("debug:shop", { lotId: "nha_so_10" }))?.ok ?? false;
  });
  expect(ok).toBe(true);
  await openFeature(page, "stall");
  const lv2 = content.data.shopLevels.find((l) => l.level === 2);
  await stall.getByRole("button", { name: new RegExp(`⬆️ Lên ${lv2?.name}`) }).tap();
  await expect(stall.locator("[data-level]")).toHaveAttribute("data-level", "2");
  await shot(page, "150-nang-cap-tiem");

  // 👩‍🍳 Nhân viên: thuê 2 người.
  await openFeature(page, "staff");
  const board = page.getByRole("region", { name: "Nhân viên" });
  await board.locator("[data-staff=thu]").getByRole("button", { name: "Thuê" }).tap();
  await board.locator("[data-staff=khoa_phu]").getByRole("button", { name: "Thuê" }).tap();
  await expect(board.locator("[data-staff-count]")).toHaveAttribute("data-staff-count", "2");
  await expect(board.locator("[data-staff=di_sau]").getByRole("button")).toHaveText("Đủ người");
  await shot(page, "151-hai-nhan-vien");
});
