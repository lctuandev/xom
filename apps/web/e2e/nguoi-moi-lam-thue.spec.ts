import { expect, type Page, test } from "@playwright/test";
import { content } from "@xom/content";
import {
  giveChange,
  readDialogue,
  register,
  shot,
  waitForMorning,
  walkToObjective,
} from "./helpers";

// Làm thuê có không gian riêng (docs/USECASES.md UC-W1…W4): bước vào quán cơm Cô Tư,
// chọn vai, làm từng việc bằng tay như ngoài đời.

const R = content.data.restaurant;

async function enterQuanCom(page: Page, name: string) {
  test.setTimeout(360_000);
  await register(page, name);
  const box = await readDialogue(page);
  await box.getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await expect(page.getByText(/Tới quán cơm Cô Tư, bước vào/)).toBeVisible();
  await waitForMorning(page);
  await walkToObjective(page, /Vào quán · Cô Tư/);
  await page.getByRole("button", { name: /Vào quán · Cô Tư/ }).tap();
  await expect(page.getByRole("region", { name: "Làm việc" })).toBeVisible();
}

/** Múc đúng các món theo phiếu rồi đưa dĩa. */
async function servePlate(page: Page) {
  const panel = page.locator("[data-items]");
  await expect(panel).toBeVisible({ timeout: 60_000 });
  const items = JSON.parse((await panel.getAttribute("data-items")) ?? "[]") as string[];
  await page.getByRole("button", { name: "🍽️ Lấy dĩa" }).tap();
  for (const id of items) {
    const food = R.foods.find((f) => f.id === id);
    if (!food) throw new Error(id);
    const scoop = page.getByRole("button", { name: `Múc ${food.name}` });
    // Khay hết thì báo bếp, chờ bếp làm xong rồi múc.
    const refill = page.getByRole("button", { name: new RegExp(`Báo bếp: hết ${food.name}`, "i") });
    if (await refill.isVisible()) await refill.tap();
    await expect(scoop).toBeEnabled({ timeout: 30_000 });
    await scoop.tap();
  }
  await page.getByRole("button", { name: "🤲 Đưa dĩa" }).tap();
}

test("người mới: đứng quầy múc cơm ở quán Cô Tư rồi ra ca nhận phiếu lương", async ({ page }) => {
  await enterQuanCom(page, "Hoa");
  await page.getByRole("button", { name: /Đứng quầy múc cơm/ }).tap();
  await expect(page.getByText(/xong 0 việc/)).toBeVisible();

  await servePlate(page);
  await expect(page.getByText(/xong 1 việc/)).toBeVisible();
  await shot(page, "07-dung-quay");
  await servePlate(page);

  // Làm đủ 2 việc: Chú Bảy "gọi điện" — khung thoại ở mép trên.
  const done = await readDialogue(page);
  await expect(page.locator('[data-bubble="chu_bay"]')).toContainText(/vựa xe Ông Sáu/);
  await done.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();

  await page.getByRole("button", { name: "🚪 Ra ca" }).tap();
  await expect(page.getByRole("dialog", { name: /Phiếu lương/ })).toBeVisible();
  await shot(page, "08-phieu-luong");
});

test("thu ngân bấm máy tính tiền theo phiếu, thu và thối tiền", async ({ page }) => {
  await enterQuanCom(page, "Lan");
  await page.getByRole("button", { name: /Thu ngân/ }).tap();

  // Thu ngân: bấm đúng từng dòng trên phiếu → báo giá → thu tiền.
  const task = page.locator("[data-task]");
  await expect(task).toBeVisible({ timeout: 60_000 });
  const lines = await task.locator("p.font-extrabold").allTextContents();
  const keys = page.getByRole("group", { name: "Máy tính tiền" });
  for (const raw of lines) {
    // Dòng phiếu: "Cơm sườn, thêm trứng" hoặc tên nước uống.
    for (const part of raw.replace(/^•\s*/, "").split(", ")) {
      const key =
        R.dishes.find((d) => d.name === part)?.name ??
        R.mods.find((m) => m.say === part && m.price > 0)?.say ??
        R.drinks.find((d) => d.name === part)?.name;
      if (!key) continue; // "không dưa"… không tính tiền
      await keys
        .getByRole("button")
        .filter({ has: page.getByText(new RegExp(`^(\\S+ )?${key}$`)) })
        .tap();
    }
  }
  await shot(page, "09-thu-ngan");
  await page.getByRole("button", { name: /^Báo giá/ }).tap();
  const exact = page.getByRole("button", { name: /Đã nhận ✓|Nhận tiền ✓/ });
  if (await exact.isVisible()) await exact.tap();
  else await giveChange(page, page.getByRole("region", { name: "Làm việc" }));
  await expect(page.getByText(/xong 1 việc/)).toBeVisible();
});

test("bưng bê: cầm dĩa ở cửa bếp đặt đúng số bàn", async ({ page }) => {
  await enterQuanCom(page, "Minh");
  await page.getByRole("button", { name: /Bưng bê/ }).tap();
  const pass = page.getByRole("button", { name: /^Bàn \d/ }).first();
  await expect(pass).toBeVisible({ timeout: 60_000 });
  const table = ((await pass.textContent()) ?? "").match(/Bàn (\d)/)?.[1];
  await pass.tap();
  await expect(page.getByText(`Đang bưng dĩa bàn ${table}`)).toBeVisible();
  await shot(page, "10-bung-be");
  await page
    .getByRole("group", { name: "Bàn" })
    .getByRole("button", { name: new RegExp(`Bàn ${table}$`) })
    .tap();
  await expect(page.getByText(/xong 1 việc/)).toBeVisible();
});
