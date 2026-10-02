import { expect, test } from "@playwright/test";
import { openFeature, readDialogue, register, setClock, shot } from "./helpers";

// Lịch tuần (docs/THEGIOI.md §2, docs/USECASES.md UC-M2): thanh trạng thái ghi thứ (T2…CN, cuối tuần chữ vàng);
// thứ Bảy dải tin báo "Tối nay chợ đêm" — 18:00–22:00 quầy ăn vặt, đồ uống, phụ kiện đông hẳn.
test("lịch tuần: thứ Bảy có chợ đêm, thanh trạng thái ghi T7", async ({ page }) => {
  await register(page, "Đêm");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  const weekday = page.locator("[data-weekday]");
  await expect(weekday).toHaveAttribute("data-weekday", "T2");
  await setClock(page, 17 * 60, 6);
  await expect(weekday).toHaveAttribute("data-weekday", "T7");
  await expect(weekday).toContainText("T7·N6");
  // Bảng Xóm → 📅 Hôm nay: chợ đêm thứ Bảy 18:00–22:00 (dải tin cũng báo trước, nhưng xoay vòng nhiều tin).
  await openFeature(page, "today");
  const today = page.getByRole("region", { name: "Hôm nay trong xóm" });
  await expect(today).toContainText("📅 Thứ Bảy, ngày 6");
  await expect(today.locator('[data-event="cho_dem"]')).toContainText(/Chợ đêm thứ Bảy/);
  await expect(today.locator('[data-event="cho_dem"]')).toContainText(/18:00–22:00|đang diễn ra/);
  await shot(page, "82-cho-dem");
});
