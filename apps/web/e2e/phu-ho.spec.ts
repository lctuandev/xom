import { expect, type Page, test } from "@playwright/test";
import { content } from "@xom/content";
import { grantMoney, readDialogue, register, setClock, setWeather, shot } from "./helpers";

// 🏗️ Phụ hồ công trình xóm (docs/USECASES.md UC-J6): xóm khởi công lát bê tông hẻm 12 → Việc làm có thẻ phụ hồ → tới công
// trường (Cai Lâm) → đọc lệnh "trộn N bao vữa …" + định mức → đổ đúng xi măng / cát / nước → trộn → có công.

const send = (page: Page, event: string, body: unknown) =>
  page.evaluate(
    async ([e, p]) => {
      const dbg = (
        window as unknown as {
          xomDebug: { send: (e: string, p: unknown) => Promise<{ ok: boolean; message?: string }> };
        }
      ).xomDebug;
      return dbg.send(e as string, p);
    },
    [event, body] as const,
  );

test("phụ hồ: tới công trường, trộn đúng định mức thì có công", async ({ page }) => {
  test.setTimeout(240_000);
  await register(page, "Phụ hồ");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await setClock(page, 7 * 60);
  await setWeather(page, "sunny");

  // Xóm (một người) đề xuất + góp đủ tiền → khởi công (luồng quỹ xóm đã có kịch bản riêng).
  const def = content.data.projects.find((p) => p.id === "lat_hem_12");
  if (!def) throw new Error("không có công trình");
  expect((await send(page, "project:propose", { projectId: def.id })).ok).toBe(true);
  await grantMoney(page, def.cost);
  await page.waitForTimeout(1100);
  expect((await send(page, "fund:donate", { amount: def.cost, pay: "cash" })).ok).toBe(true);

  await page.getByRole("button", { name: "Việc làm", exact: true }).tap();
  const jobs = page.getByRole("dialog", { name: "Việc làm" });
  await jobs.getByRole("tab", { name: "💼 Làm thuê" }).tap();
  const card = jobs.locator("[data-job=phu_ho]");
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "🚶 Tới công trường" }).tap();

  const sheet = page.getByRole("dialog", { name: /Công trường · Cai Lâm/ });
  await expect(sheet).toBeVisible({ timeout: 60_000 });
  const order = sheet.locator("[data-order]");
  await expect(order).toBeVisible();
  await shot(page, "9a-cong-truong");
  const mixId = (await order.getAttribute("data-order")) ?? "";
  const bags = Number(await order.locator("[data-order-bags]").getAttribute("data-order-bags"));
  const mix = content.data.crew.mixes.find((m) => m.id === mixId);
  if (!mix) throw new Error(`không có vữa ${mixId}`);

  const tap = async (name: string, times: number) => {
    for (let i = 0; i < times; i++) await sheet.getByRole("button", { name, exact: true }).tap();
  };
  await tap("Thêm 🧱 Xi măng", bags);
  const sand = bags * mix.sandPerBag;
  await tap("Thêm 5 thùng ⛱️ Cát", Math.floor(sand / 5));
  await tap("Thêm ⛱️ Cát", sand % 5);
  const water = bags * mix.waterPerBag;
  await tap("Thêm 20 lít 💧 Nước", Math.floor(water / 20));
  await tap("Thêm 💧 Nước", Math.round((water % 20) / 5));
  await expect(sheet.locator("[data-stepper=thùng]")).toContainText(`${sand} thùng`);
  await sheet.getByRole("button", { name: "🪣 Trộn mẻ này" }).tap();
  await expect(sheet.locator("[data-mix-result=ok]")).toBeVisible();
  await expect(sheet.locator("[data-mixes]")).toHaveAttribute("data-mixes", "1");
  await shot(page, "9b-tron-vua-dat");
});
