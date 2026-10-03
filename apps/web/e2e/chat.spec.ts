import { expect, test } from "@playwright/test";
import { readDialogue, register, shot } from "./helpers";

// Chat tự gõ (docs/USECASES.md UC-D4): gõ một câu → hiện trên đầu nhân vật + trong khung chat; từ tục bị che.
test("gõ chat: câu hiện trên đầu nhân vật và trong khung chat", async ({ page }) => {
  await register(page, "Chat");
  await (await readDialogue(page)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  // Nút 💬 ngang hàng ☰ Menu, bên phải màn hình (góp ý đợt 3).
  const chatBox = await page.getByRole("button", { name: "Nói" }).boundingBox();
  const menuBox = await page.getByRole("button", { name: "Menu", exact: true }).boundingBox();
  const vw = page.viewportSize()?.width ?? 0;
  if (!chatBox || !menuBox) throw new Error("không thấy nút");
  expect(Math.abs(chatBox.y + chatBox.height / 2 - (menuBox.y + menuBox.height / 2))).toBeLessThan(
    3,
  );
  expect(chatBox.x).toBeGreaterThan(vw / 2);
  await page.getByRole("button", { name: "Nói" }).tap();
  const panel = page.getByRole("region", { name: "Chat xóm" });
  await panel.getByRole("textbox", { name: "Tin nhắn" }).fill("Chào cả xóm, bánh mì ngon vl");
  await panel.getByRole("button", { name: "Gửi" }).tap();
  await expect(panel.locator("[data-chat-log]")).toContainText("Chào cả xóm, bánh mì ngon ***");
  await expect(page.locator("[data-bubble]").filter({ hasText: "Chào cả xóm" })).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Tin nhắn" })).toHaveValue("");
  await shot(page, "100-chat");
});
