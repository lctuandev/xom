import { expect, type Page, test } from "@playwright/test";
import { content } from "@xom/content";
import {
  giveChange,
  readDialogue,
  register,
  shot,
  skipGuide,
  waitForMorning,
  walkToObjective,
} from "./helpers";

// Làm thuê có không gian riêng (docs/USECASES.md UC-W1…W4): bước vào quán cơm Cô Tư,
// chọn vai, làm từng việc bằng tay như ngoài đời.

const R = content.data.restaurant;

async function enterQuanCom(page: Page, name: string) {
  test.setTimeout(420_000);
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
  // Phiếu tích đủ các món cần múc rồi mới đưa.
  await expect(page.getByRole("list", { name: "Cần múc" }).locator("li").first()).toContainText(
    "✓",
  );
  await page.getByRole("button", { name: "🤲 Đưa món" }).tap();
}

test("người mới: đứng quầy múc cơm ở quán Cô Tư rồi ra ca nhận phiếu lương", async ({ page }) => {
  await enterQuanCom(page, "Hoa");
  await page.getByRole("button", { name: /Đứng quầy múc cơm/ }).tap();
  await skipGuide(page);
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
  await skipGuide(page);

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

test("bưng bê: tới cửa bếp lấy dĩa, bưng tới đúng bàn rồi bấm giao món; khách ngồi ăn", async ({
  page,
}) => {
  await enterQuanCom(page, "Minh");
  await page.getByRole("button", { name: /Bưng bê/ }).tap();
  await skipGuide(page);
  // Cô Tư múc cho khách → dĩa ra cửa bếp; phải đi tới cửa bếp mới lấy được.
  const toPass = page.getByRole("button", { name: /📍 Tới cửa bếp lấy dĩa/ });
  const grab = page.getByRole("button", { name: /🍽️ Lấy dĩa bàn \d/ }).first();
  await expect(toPass.or(grab)).toBeVisible({ timeout: 60_000 });
  if (await toPass.isVisible()) await toPass.tap();
  await expect(grab).toBeVisible();
  const table = ((await grab.textContent()) ?? "").match(/bàn (\d)/)?.[1];
  await grab.tap();
  await expect(page.getByText(`Đang cầm: dĩa bàn ${table}`)).toBeVisible();
  await shot(page, "10-bung-be");
  // Bưng tới bàn: tới nơi mới có nút giao món.
  await page.getByRole("button", { name: `📍 Mang dĩa tới bàn ${table}` }).tap();
  await page.getByRole("button", { name: `🤲 Giao món bàn ${table}` }).tap();
  await expect(page.getByText(/xong 1 việc/)).toBeVisible();
  await shot(page, "11-khach-an");
});
