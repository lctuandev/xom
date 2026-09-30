import { expect, type Locator, type Page } from "@playwright/test";
import { content } from "@xom/content";

export async function register(page: Page, name = "Tuấn", start = "/play") {
  await page.goto(start);
  await page.waitForURL("**/dang-nhap**");
  await page
    .getByLabel("Tên đăng nhập")
    .fill(`e${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`);
  await page.getByLabel("Tên hiển thị trong xóm").fill(name);
  await page.getByLabel("Mật khẩu").fill("matkhau123");
  await page.getByRole("button", { name: /Tạo tài khoản & vào xóm/ }).tap();
  await page.waitForURL(`**${start}`);
}

/**
 * Đồng hồ xóm chạy chung cho mọi test (GAME_TICK_MS=250 → một ngày 16 giờ game ≈ 4 phút).
 * Kịch bản dài cần bắt đầu từ sáng: quá trưa thì chờ sang ngày mới.
 */
export async function waitForMorning(page: Page, latestHour = 11) {
  const clock = page.getByText(/^N\d+ · \d\d:\d\d$/);
  await expect(clock).toBeVisible();
  const hour = Number(((await clock.textContent()) ?? "").match(/(\d\d):/)?.[1] ?? 0);
  if (hour < latestHour) return;
  const next = page.getByRole("button", { name: /Sang ngày mới/ });
  await expect(next).toBeVisible({ timeout: 260_000 });
  await next.tap();
}

/** Đọc hết lời thoại của NPC (bấm Tiếp) rồi trả về hộp điều khiển hội thoại. */
export async function readDialogue(page: Page, speaker = "Chú Bảy xe ôm") {
  const box = page.getByRole("dialog", { name: speaker });
  await expect(box).toBeVisible();
  // Lời thoại hiện trong khung trên đầu người nói.
  await expect(page.locator('[data-bubble="chu_bay"]')).toBeVisible();
  while (await box.getByRole("button", { name: "Tiếp ›" }).isVisible()) {
    await box.getByRole("button", { name: "Tiếp ›" }).tap();
  }
  return box;
}

/** Bấm "Đi tới" ở dòng nhiệm vụ và chờ tới nơi (nút hành động của địa điểm hiện ra). */
export async function walkToObjective(page: Page, arrivedButton: RegExp) {
  await page.getByRole("button", { name: "🚶 Đi tới" }).tap();
  await expect(page.getByRole("button", { name: arrivedButton })).toBeVisible({ timeout: 30_000 });
}

/** Ở chợ: mua mỗi nguyên liệu 1 gói. */
export async function buyIngredients(page: Page, ids: string[]) {
  for (const id of ids) {
    const row = page.locator(`[data-item="${id}"]`);
    if (!(await row.isVisible())) await page.getByText(/Hàng khác/).tap();
    await row.getByRole("button", { name: /^Mua/ }).tap();
    // Mua đủ món cuối thì Chú Bảy có thể bắt chuyện (bảng chợ tự đóng) — cũng là mua xong.
    await expect(
      row.getByText(/trong kho [1-9]/).or(page.getByRole("dialog", { name: "Chú Bảy xe ôm" })),
    ).toBeVisible();
  }
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Làm món đúng theo lời khách dặn, thao tác từng bước như người chơi.
 * `mistake`: cố tình làm sai một bước (để thử khách phàn nàn).
 */
export async function makeDish(page: Page, opts: { mistake?: string } = {}) {
  const kitchen = page.getByRole("dialog", { name: "Làm món" });
  await expect(kitchen).toBeVisible();
  const spec = JSON.parse((await kitchen.getAttribute("data-spec")) ?? "{}") as Record<
    string,
    string | string[] | true
  >;
  const orderId = await kitchen.getAttribute("data-order");
  // Công thức lấy từ sản phẩm có bước khớp với spec.
  const product = content.data.products.find((p) => p.recipe.steps.every((s) => s.id in spec));
  if (!product) throw new Error("Không nhận ra công thức");
  const steps = product.recipe.steps;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;
    await kitchen.getByRole("button", { name: `${i + 1}. ${step.label}` }).tap();
    const panel = kitchen.getByRole("region", { name: step.label });
    let want = spec[step.id];
    if (opts.mistake === step.id && step.kind === "single") {
      want = step.options.find((o) => o.id !== want)?.id ?? want;
    }
    if (step.kind === "action") {
      await panel.getByRole("button", { name: step.verb ?? step.label }).tap();
    } else if (step.kind === "hold") {
      const btn = panel.getByRole("button");
      await btn.dispatchEvent("pointerdown");
      await page.waitForTimeout(1200);
      await btn.dispatchEvent("pointerup");
      await expect(
        panel.getByRole("button", { name: new RegExp(`✓ ${esc(step.label)}`) }),
      ).toBeVisible();
    } else if (step.kind === "single") {
      const opt = step.options.find((o) => o.id === want);
      if (opt) await panel.getByRole("button", { name: new RegExp(esc(opt.label)) }).tap();
    } else {
      for (const id of Array.isArray(want) ? want : []) {
        const opt = step.options.find((o) => o.id === id);
        if (opt) await panel.getByRole("button", { name: new RegExp(esc(opt.label)) }).tap();
      }
      await panel.getByRole("button", { name: /Xong bước này|Không bỏ gì/ }).tap();
    }
  }
  await kitchen.getByRole("button", { name: /Giao món cho khách/ }).tap();
  return { orderId, spec };
}

/** Tính tiền: chuyển khoản/đưa đủ thì xác nhận; tiền mặt thì ghép tờ tiền thối (thiếu `short` đồng). */
export async function payOrder(page: Page, short = 0) {
  const kitchen = page.getByRole("dialog", { name: "Làm món" });
  const received = kitchen.getByRole("button", { name: "✓ Đã nhận tiền" });
  const hint = kitchen.getByRole("button", { name: "💡 Tính giúp" });
  await expect(received.or(hint)).toBeVisible();
  if (await received.isVisible()) {
    await received.tap();
    return "exact";
  }
  await hint.tap();
  const text = (await kitchen.getByText(/Cần thối/).textContent()) ?? "";
  let change = Number(text.replace(/\D/g, "")) - short;
  for (const d of [50_000, 20_000, 10_000, 5_000, 2_000, 1_000]) {
    while (change >= d) {
      await kitchen
        .getByRole("button", { name: `${(d / 1000).toString()}.000đ`, exact: true })
        .tap();
      change -= d;
    }
  }
  await kitchen.getByRole("button", { name: /^Thối .*✓$/ }).tap();
  return "cash";
}

/** Thối tiền bằng bàn tiền lẻ (CashChange) trong `scope`; `short` = cố tình thối thiếu. */
export async function giveChange(_page: Page, scope: Locator, short = 0) {
  await scope.getByRole("button", { name: "💡 Tính giúp" }).tap();
  const text = (await scope.getByText(/Cần thối/).textContent()) ?? "";
  let change = Number(text.replace(/\D/g, "")) - short;
  for (const d of [50_000, 20_000, 10_000, 5_000, 2_000, 1_000]) {
    while (change >= d) {
      await scope.getByRole("button", { name: `${(d / 1000).toString()}.000đ`, exact: true }).tap();
      change -= d;
    }
  }
  await scope.getByRole("button", { name: /✓$/ }).last().tap();
}

export async function shot(page: Page, name: string) {
  const who = (page.viewportSize()?.width ?? 0) === 402 ? "iphone" : "pixel";
  await page.screenshot({ path: `e2e/.results/${who}-${name}.png` });
}

/** Nguyên liệu đủ làm bánh mì thịt. */
export const BANH_MI_THIT = [
  "banh_mi_phoi",
  "pate",
  "thit_nguoi",
  "dua_leo",
  "do_chua",
  "hanh",
  "ngo",
  "ot",
  "sot",
  "giay_goi",
];

/** Người mới đi theo kịch bản tới lúc mở quầy bánh mì ở Đầu hẻm 12 (xe, nguyên liệu, chỗ bán). */
export async function openBanhMiStall(page: Page) {
  let box = await readDialogue(page);
  await box.getByRole("button", { name: "Con muốn buôn bán" }).tap();
  await walkToObjective(page, /Xem xe đẩy · Ông Sáu/);
  await page.getByRole("button", { name: /Xem xe đẩy · Ông Sáu/ }).tap();
  await page
    .locator("li", { hasText: "Xe bánh mì kính" })
    .getByRole("button", { name: /Mua ·/ })
    .tap();
  box = await readDialogue(page);
  await box.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
  await walkToObjective(page, /Vào chợ · Bà Năm/);
  await page.getByRole("button", { name: /Vào chợ · Bà Năm/ }).tap();
  await buyIngredients(page, BANH_MI_THIT);
  box = await readDialogue(page);
  await box.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
  await page.getByRole("button", { name: "Mở", exact: true }).tap();
  await page.getByRole("button", { name: /Đầu hẻm 12/ }).tap();
  await page.getByRole("button", { name: "Bản đồ" }).tap();
  await walkToObjective(page, /Mở quầy · thuê chỗ/);
  await page.getByRole("button", { name: /Mở quầy · thuê chỗ/ }).tap();
  box = await readDialogue(page);
  await box.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
}
