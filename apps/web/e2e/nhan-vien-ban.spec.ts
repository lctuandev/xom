import { expect, type Page, test } from "@playwright/test";
import { openBanhMiStall, register, setClock, shot, waitForMorning } from "./helpers";

// Có nhân viên thì chủ không bắt buộc đứng bán (UC-M6): nhân viên trong ca bán, không còn chip "đang bán thay / 🙋 Tôi bán"
// (góp ý đợt 3 — nhiều cửa hàng thì thông báo "bán dùm" thành ồn); đóng quầy rồi tới ca nhân viên tự mở cửa lặng lẽ.

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

test("có nhân viên: không còn chip bán dùm; nhân viên tới ca tự mở cửa", async ({ page }) => {
  test.setTimeout(300_000);
  await register(page, "Chủ quầy");
  await waitForMorning(page, 9);
  await openBanhMiStall(page);
  await setClock(page, 7 * 60);
  expect((await send(page, "staff:hire", { staffId: "khoa_phu", shiftId: "ca_ngay" })).ok).toBe(
    true,
  );

  // Đứng ở quầy, nhân viên trong ca: không có chip "bán dùm" nào trên màn hình.
  await page.waitForTimeout(1500);
  await expect(page.locator("[data-staff-selling], [data-staff-duty=on]")).toHaveCount(0);
  await shot(page, "51-nhan-vien-ban-chu-xem");

  // Chủ đóng quầy → hôm nay thôi; sáng hôm sau tới ca nhân viên tự mở cửa (còn hàng), chủ khỏi chờ ra mở.
  expect((await send(page, "biz:close", {})).ok).toBe(true);
  const day = await page.evaluate(
    () =>
      (window as unknown as { xomDebug: { clock: () => { day: number } | null } }).xomDebug.clock()
        ?.day ?? 1,
  );
  await setClock(page, 7 * 60, day + 1);
  // Mở cửa lặng lẽ: quầy đang bán, không có toast "mở cửa giúp".
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                xomDebug: { me?: () => { business?: { open: boolean } | null } | null };
              }
            ).xomDebug.me?.()?.business?.open ?? false,
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect(page.getByText(/mở cửa quầy giúp bạn/)).toHaveCount(0);
});
