import { expect, test } from "@playwright/test";
import { openBanhMiStall, openFeature, register, setClock, shot } from "./helpers";

// Bảng việc xóm (docs/KIENTRUC.md §3, docs/USECASES.md UC-M7): Việc làm → 📋 Việc xóm → nhận việc của Cô Hạnh (đặt cọc) →
// làm 5 phần ở quầy (trừ nguyên liệu) → đi tới Cổng trường → giao → nhận thưởng + lại cọc, 🤝 tin cậy 50 → 55.
test("nhận việc giao bánh mì cho trường → làm hàng → mang tới Cổng trường → giao, tin cậy tăng", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await register(page, "Giữ lời");
  await openBanhMiStall(page);
  await setClock(page, 7 * 60);
  const posted = await page.evaluate(async () => {
    const dbg = (
      window as unknown as {
        xomDebug?: { send: (e: string, p: unknown) => Promise<{ ok: boolean }> };
      }
    ).xomDebug;
    return (await dbg?.send("debug:contract", { templateId: "truong_banh_mi" }))?.ok ?? false;
  });
  expect(posted).toBe(true);

  await openFeature(page, "contracts");
  const board = page.getByRole("region", { name: "Bảng việc xóm" });
  await expect(board.locator("[data-trust]")).toContainText("50/100");
  const job = board.locator("[data-contract=truong_banh_mi]").last();
  await expect(job).toContainText("Cô Hạnh giáo viên");
  await expect(job).toContainText("Cổng trường");
  await shot(page, "92-bang-viec");
  await job.getByRole("button", { name: /Nhận việc · đặt cọc/ }).tap();

  const active = board.locator("[data-active-contract]");
  await expect(active).toHaveAttribute("data-active-contract", "TAKEN");
  await active.getByRole("button", { name: /🔪 Làm 5 phần/ }).tap();
  await expect(active).toHaveAttribute("data-active-contract", "READY");
  await shot(page, "93-viec-dang-lam");

  // Đi bộ tới Cổng trường: tới nơi thì bảng việc tự mở lại.
  await active.getByRole("button", { name: /Tới Cổng trường/ }).tap();
  await expect(board.locator("[data-active-contract=READY]")).toBeVisible({ timeout: 60_000 });
  await board.getByRole("button", { name: "📦 Giao hàng" }).tap();
  await expect(page.getByText(/📋 Cô Hạnh giáo viên nhận đủ hàng/).first()).toBeVisible();
  await expect(board.locator("[data-trust]")).toContainText("55/100");
  await expect(board.locator("[data-contract=truong_banh_mi]").last()).toContainText("Bạn đã giao");
  await shot(page, "94-giao-xong");
});
