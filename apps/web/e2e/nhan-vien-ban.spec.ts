import { expect, type Page, test } from "@playwright/test";
import { openBanhMiStall, register, setClock, shot, waitForMorning } from "./helpers";

// Có nhân viên thì chủ không bắt buộc đứng bán (góp ý chơi thử, UC-M6): đứng ở quầy thấy "Khoa đang bán — bạn cứ đứng xem",
// bấm "🙋 Tôi bán" để giành bán, bấm lại trả quầy; đóng quầy rồi tới ca nhân viên tự mở cửa giúp.

const send = (page: Page, event: string, body: unknown) =>
  page.evaluate(
    async ([e, p]) =>
      (
        window as unknown as {
          xomDebug: { send: (e: string, p: unknown) => Promise<{ ok: boolean }> };
        }
      ).xomDebug.send(e as string, p),
    [event, body] as const,
  );

test("có nhân viên: chủ đứng xem hoặc giành bán; nhân viên tới ca tự mở cửa", async ({ page }) => {
  test.setTimeout(300_000);
  await register(page, "Chủ quầy");
  await waitForMorning(page, 9);
  await openBanhMiStall(page);
  await setClock(page, 7 * 60);
  expect((await send(page, "staff:hire", { staffId: "khoa_phu", shiftId: "ca_ngay" })).ok).toBe(
    true,
  );

  // Đứng ở quầy, nhân viên trong ca: nhân viên bán, chủ đứng xem.
  const chip = page.locator("[data-staff-selling]");
  await expect(chip).toHaveAttribute("data-staff-selling", "staff", { timeout: 15_000 });
  await expect(chip).toContainText("Khoa đang bán");
  await shot(page, "51-nhan-vien-ban-chu-xem");
  await chip.getByRole("button", { name: "🙋 Tôi bán" }).tap();
  await expect(chip).toHaveAttribute("data-staff-selling", "owner");
  await chip.getByRole("button", { name: "Để Khoa bán" }).tap();
  await expect(chip).toHaveAttribute("data-staff-selling", "staff");

  // Chủ đóng quầy → hôm nay thôi; sáng hôm sau tới ca nhân viên tự mở cửa (còn hàng), chủ khỏi chờ ra mở.
  expect((await send(page, "biz:close", {})).ok).toBe(true);
  const day = await page.evaluate(
    () =>
      (window as unknown as { xomDebug: { clock: () => { day: number } | null } }).xomDebug.clock()
        ?.day ?? 1,
  );
  await setClock(page, 7 * 60, day + 1);
  await expect(page.getByText(/Khoa tới ca, mở cửa quầy giúp bạn/).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(chip).toHaveAttribute("data-staff-selling", "staff");
});
