import { test } from "@playwright/test";
import { openTeaStall, register, serveCustomer, shot, waitForMorning } from "./helpers";

// Quầy trà sữa dạng lưới theo góc nhìn người bán (docs/USECASES.md UC-F5): lấy ly M/L, rót trà ở bình có vòi,
// chọn đường/đá bằng chữ, thêm topping ở lưới khay, giữ để lắc, dán miệng ly, giao món, tính tiền.
test("bán trà sữa ở quầy dạng lưới", async ({ page }) => {
  test.setTimeout(420_000);
  await register(page, "Trà");
  await waitForMorning(page, 10);
  await openTeaStall(page);
  await serveCustomer(page, async () => {
    await shot(page, "90-quay-tra");
  });
  await shot(page, "91-da-ban-tra");
});
