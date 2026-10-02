import { expect, test } from "@playwright/test";
import { content } from "@xom/content";
import {
  buyIngredients,
  closeSheet,
  grantMoney,
  makeDish,
  payOrder,
  readDialogue,
  register,
  setClock,
  shot,
  walkToObjective,
} from "./helpers";

// Tiệm sửa xe (docs/NGHE.md §3.1, docs/USECASES.md UC-G1…G4): mua xe đồ nghề ở vựa Ông Sáu, phụ tùng ở chợ,
// mở tiệm; khách kể triệu chứng → kiểm tra đúng bộ phận → sửa sai thì chạy thử vẫn hư → sửa lại → tính tiền.
const PARTS = ["mieng_va", "ruot_xe", "bugi", "ma_phanh", "bong_den"];

test("tiệm sửa xe: nghe triệu chứng, kiểm tra, sửa sai rồi sửa đúng, tính tiền", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await register(page, "Thợ");
  await grantMoney(page, 500_000);
  let box = await readDialogue(page);
  await box.getByRole("button", { name: "Con muốn buôn bán" }).tap();
  await walkToObjective(page, /Xem xe đẩy · Ông Sáu/);
  await page.getByRole("button", { name: /Xem xe đẩy · Ông Sáu/ }).tap();
  await page
    .locator("li", { hasText: "Xe đồ nghề sửa xe" })
    .getByRole("button", { name: /Mua ·/ })
    .tap();
  box = await readDialogue(page);
  await box.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
  await walkToObjective(page, /Vào chợ · Bà Năm/);
  await page.getByRole("button", { name: /Vào chợ · Bà Năm/ }).tap();
  // Mua miếng vá là đủ sửa một bệnh → Chú Bảy bắt chuyện (bảng chợ đóng); mở lại chợ mua nốt phụ tùng.
  const [first = "mieng_va", ...rest] = PARTS;
  await buyIngredients(page, [first]);
  box = await readDialogue(page);
  await box.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
  await page.locator('[data-anchor="market"]').tap();
  await buyIngredients(page, rest);
  await shot(page, "60-phu-tung");
  await page
    .getByRole("dialog", { name: "Chợ đầu mối Bà Năm" })
    .getByRole("button", { name: "Đóng" })
    .last()
    .tap();
  // Tiệm sửa xe đông nhất buổi sáng (xe chết máy trên đường đi làm).
  await setClock(page, 7 * 60);
  await page.getByRole("button", { name: "Mở", exact: true }).tap();
  await page.getByRole("button", { name: /Đầu hẻm 12/ }).tap();
  await closeSheet(page);
  await walkToObjective(page, /Mở (quầy|tiệm) · thuê chỗ/);
  await page.getByRole("button", { name: /Mở (quầy|tiệm) · thuê chỗ/ }).tap();
  box = await readDialogue(page);
  await box.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();

  // Khách dắt xe tới: chỉ kể triệu chứng.
  await page.getByRole("button", { name: /Làm món cho khách/ }).tap({ timeout: 120_000 });
  const kitchen = page.getByRole("dialog", { name: "Làm món" });
  const spec = JSON.parse((await kitchen.getAttribute("data-spec")) ?? "{}") as { sua: string };
  const repair = content.product("sua_xe");
  const variant = repair.recipe.variants.find((v) => v.fixed.sua === spec.sua);
  if (!variant) throw new Error("không nhận ra bệnh");
  await expect(kitchen.getByText(/“.+”/).first()).toHaveText(
    new RegExp((variant.symptoms ?? []).map((x) => x.replace(/[?.]/g, "\\$&")).join("|")),
  );

  // Kiểm tra đúng bộ phận có bệnh → thấy kết quả được tô đỏ.
  const dx = kitchen.getByRole("region", { name: "Kiểm tra xe" });
  const [partId, finding] = Object.entries(variant.findings)[0] ?? [];
  const part = repair.diagnosis?.parts.find((p) => p.id === partId);
  if (!part || !finding) throw new Error("bệnh không có kết quả kiểm tra");
  await dx
    .getByRole("button", { name: new RegExp(part.label) })
    .first()
    .tap();
  await expect(dx.locator(`[data-finding="${finding}"]`)).toBeVisible();
  await shot(page, "61-chan-doan");

  // Sửa sai bệnh: khách chạy thử vẫn hư.
  await makeDish(page, { mistake: "sua" });
  await expect(kitchen.getByText("Khách chạy thử: xe vẫn hư!")).toBeVisible();
  await shot(page, "62-van-hu");
  await kitchen.getByRole("button", { name: "🔁 Kiểm tra lại, sửa tiếp" }).tap();
  // Sửa đúng → máy nổ → tính tiền.
  await makeDish(page);
  await payOrder(page);
  await expect(kitchen).toHaveCount(0);
});
