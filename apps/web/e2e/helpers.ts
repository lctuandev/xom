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
  // Trời ngẫu nhiên (UC-B4) làm khách lúc đông lúc vắng — kịch bản mặc định chạy với trời nắng cho ổn định.
  await expect(page.locator("[data-clock]")).toBeVisible();
  await setWeather(page, "sunny");
}

/**
 * Đồng hồ xóm chạy chung cho mọi test (GAME_TICK_MS=250 → một ngày 16 giờ game ≈ 4 phút).
 * Kịch bản dài cần bắt đầu từ sáng: quá trưa thì chờ sang ngày mới.
 */
export async function waitForMorning(page: Page, latestHour = 11) {
  const clock = page.locator("[data-clock]");
  await expect(clock).toBeVisible();
  const minute = Number((await clock.getAttribute("data-clock")) ?? 0);
  if (minute < latestHour * 60) return;
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
    // Chợ chia tab theo nghề: chưa thấy hàng thì lật lần lượt từng tab.
    const tabs = page.getByRole("tablist", { name: "Quầy hàng ở chợ" }).getByRole("tab");
    for (let i = 0; i < (await tabs.count()) && !(await row.isVisible()); i++)
      await tabs.nth(i).tap();
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
export async function makeDish(page: Page, opts: { mistake?: string; timeout?: number } = {}) {
  const t = opts.timeout ? { timeout: opts.timeout } : undefined;
  if (await page.locator("[data-counter]").isVisible()) return makeAtCounter(page, t);
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
    await kitchen.getByRole("button", { name: `${i + 1}. ${step.label}` }).tap(t);
    const panel = kitchen.getByRole("region", { name: step.label });
    let want = spec[step.id];
    if (opts.mistake === step.id && step.kind === "single") {
      want = step.options.find((o) => o.id !== want)?.id ?? want;
    }
    if (step.kind === "action") {
      await panel.getByRole("button", { name: step.verb ?? step.label }).tap(t);
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
      if (opt) await panel.getByRole("button", { name: new RegExp(esc(opt.label)) }).tap(t);
    } else {
      for (const id of Array.isArray(want) ? want : []) {
        const opt = step.options.find((o) => o.id === id);
        if (opt) await panel.getByRole("button", { name: new RegExp(esc(opt.label)) }).tap(t);
      }
      await panel.getByRole("button", { name: /Xong bước này|Không bỏ gì/ }).tap(t);
    }
  }
  await kitchen.getByRole("button", { name: /Giao món cho khách|Giao xe cho khách/ }).tap(t);
  return { orderId, spec };
}

/**
 * Làm món ở quầy dạng lưới (UC-F5, product.counter): lấy ly, rót trà, chọn đường/đá, thêm topping, lắc, dán miệng ly.
 */
async function makeAtCounter(page: Page, t?: { timeout: number }) {
  const kitchen = page.getByRole("dialog", { name: "Làm món" });
  const spec = JSON.parse((await kitchen.getAttribute("data-spec")) ?? "{}") as Record<
    string,
    string | string[] | true
  >;
  const orderId = await kitchen.getAttribute("data-order");
  const product = content.data.products.find(
    (p) => p.counter && p.recipe.steps.every((s) => s.id in spec),
  );
  if (!product?.counter) throw new Error("Không nhận ra quầy");
  const short = (label: string) => label.split(" · ")[0] ?? label;
  for (const z of product.counter.zones) {
    const step = product.recipe.steps.find((s) => s.id === z.step);
    if (!step) continue;
    const want = spec[step.id];
    const opt = (id: string) => step.options.find((o) => o.id === id);
    const panel = kitchen.getByRole("region", { name: step.label });
    if (z.zone === "cups" && typeof want === "string")
      await panel.getByRole("button", { name: `Lấy ly ${short(opt(want)?.label ?? "")}` }).tap(t);
    else if (z.zone === "jars" && typeof want === "string")
      await panel.getByRole("button", { name: `Rót ${opt(want)?.label}` }).tap(t);
    else if (z.zone === "chips" && typeof want === "string")
      await panel.getByRole("button", { name: opt(want)?.label ?? "", exact: true }).tap(t);
    else if (z.zone === "grid") {
      const ids = Array.isArray(want) ? want : [];
      if (ids.length === 0) await panel.getByRole("button", { name: "Không topping" }).tap(t);
      for (const id of ids)
        await panel.getByRole("button", { name: `Thêm ${opt(id)?.label}` }).tap(t);
    } else if (z.zone === "shaker") {
      const btn = panel.getByRole("button");
      await btn.dispatchEvent("pointerdown");
      await page.waitForTimeout(1300);
      await btn.dispatchEvent("pointerup");
      await expect(
        panel.getByRole("button", { name: new RegExp(`✓ ${esc(step.label)}`) }),
      ).toBeVisible();
    } else if (z.zone === "sealer") await panel.getByRole("button").tap(t);
  }
  await kitchen.getByRole("button", { name: /Giao món cho khách/ }).tap(t);
  return { orderId, spec };
}

/** Nguyên liệu trà sữa truyền thống, trà xanh, size M/L, đá, trân châu, màng dán. */
export const TRA_SUA = [
  "ly_m",
  "ly_l",
  "cot_tra_sua",
  "cot_tra_xanh",
  "da",
  "tran_chau_den",
  "tran_chau_trang",
  "mang_nap",
];

/** Người mới mở xe trà sữa (theo kịch bản Chú Bảy) ở chỗ `lot`; trà sữa vốn nhiều nên cộng sẵn vốn. */
export async function openTeaStall(page: Page, lot: RegExp = /Đầu hẻm 12/) {
  await grantMoney(page, 300_000);
  let box = await readDialogue(page);
  await box.getByRole("button", { name: "Con muốn buôn bán" }).tap();
  await walkToObjective(page, /Xem xe đẩy · Ông Sáu/);
  await page.getByRole("button", { name: /Xem xe đẩy · Ông Sáu/ }).tap();
  await page
    .locator("li", { hasText: "Xe đẩy trà sữa" })
    .getByRole("button", { name: /Mua ·/ })
    .tap();
  box = await readDialogue(page);
  await box.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
  await walkToObjective(page, /Vào chợ · Bà Năm/);
  await page.getByRole("button", { name: /Vào chợ · Bà Năm/ }).tap();
  await buyIngredients(page, TRA_SUA);
  box = await readDialogue(page);
  await box.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
  await page.getByRole("button", { name: "Mở", exact: true }).tap();
  await page.getByRole("button", { name: lot }).tap();
  await closeSheet(page);
  await walkToObjective(page, /Mở (quầy|tiệm) · thuê chỗ/);
  await page.getByRole("button", { name: /Mở (quầy|tiệm) · thuê chỗ/ }).tap();
  box = await readDialogue(page);
  await box.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
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

/**
 * Mở màn làm món cho khách kế tiếp, làm đúng món, tính tiền. Quầy đông thì khách đang làm có thể hết kiên nhẫn bỏ đi
 * (màn làm món tự đóng) — như ngoài đời: phục vụ người tiếp theo. `check` chạy khi màn làm món vừa mở.
 */
export async function serveCustomer(page: Page, check?: (kitchen: Locator) => Promise<void>) {
  const cook = page.getByRole("button", { name: /Làm món cho khách/ });
  const kitchen = page.getByRole("dialog", { name: "Làm món" });
  for (let i = 0; i < 6; i++) {
    await expect(cook).toBeVisible({ timeout: 90_000 });
    await cook.tap();
    await expect(kitchen).toBeVisible();
    if (check) await check(kitchen);
    const ok = await makeDish(page, { timeout: 15_000 })
      .then(() => payOrder(page))
      .then(() => true)
      .catch((e) => {
        console.log(`serveCustomer: thử lại (${String(e).split("\n")[0]})`);
        return false;
      });
    if (ok) {
      await expect(kitchen).toHaveCount(0);
      return;
    }
    if (await kitchen.isVisible())
      await kitchen
        .getByRole("button", { name: "Để đó, làm sau" })
        .tap({ timeout: 3_000 })
        .catch(() => undefined);
  }
  throw new Error("Không phục vụ kịp khách nào");
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

/** Ép thời tiết xóm mình (lệnh thử nghiệm, chỉ bản dev): `after`/`minutes` tính bằng phút game. */
export async function setWeather(page: Page, kind: string, after = 0, minutes = 960) {
  // Vừa vào game socket có thể đang nối lại — thử lại vài lần.
  await expect
    .poll(
      () =>
        page.evaluate(
          async (p) => {
            const dbg = (
              window as unknown as {
                xomDebug?: { send: (e: string, p: unknown) => Promise<{ ok: boolean }> };
              }
            ).xomDebug;
            return (await dbg?.send("debug:weather", p))?.ok ?? false;
          },
          { kind, after, minutes },
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
}

/** Đặt giờ của xóm (lệnh thử nghiệm, chỉ bản dev): kịch bản dài khỏi bị hết ngày giữa chừng. */
export async function setClock(page: Page, minute: number, day?: number) {
  const ok = await page.evaluate(
    async (p) => {
      const dbg = (
        window as unknown as {
          xomDebug?: { send: (e: string, p: unknown) => Promise<{ ok: boolean }> };
        }
      ).xomDebug;
      return (await dbg?.send("debug:clock", p))?.ok ?? false;
    },
    day === undefined ? { minute } : { minute, day },
  );
  expect(ok).toBe(true);
}

/** Cộng tiền mặt / KN (lệnh thử nghiệm, chỉ bản dev). */
export async function grantMoney(
  page: Page,
  money: number | undefined,
  xp?: number,
  needs?: { food?: number; drink?: number },
) {
  const ok = await page.evaluate(
    async (p) => {
      const dbg = (
        window as unknown as {
          xomDebug?: { send: (e: string, p: unknown) => Promise<{ ok: boolean }> };
        }
      ).xomDebug;
      return (await dbg?.send("debug:grant", p))?.ok ?? false;
    },
    { money, xp, ...needs },
  );
  expect(ok).toBe(true);
}

/** Người mới đi theo kịch bản tới lúc mở quầy bánh mì ở Đầu hẻm 12 (xe, nguyên liệu, chỗ bán). */
export async function openBanhMiStall(page: Page, lot: RegExp = /Đầu hẻm 12/) {
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
  await page.getByRole("button", { name: lot }).tap();
  await closeSheet(page);
  await walkToObjective(page, /Mở (quầy|tiệm) · thuê chỗ/);
  await page.getByRole("button", { name: /Mở (quầy|tiệm) · thuê chỗ/ }).tap();
  box = await readDialogue(page);
  await box.getByRole("button", { name: "Dạ, con hiểu rồi" }).tap();
}

/** Lần đầu vào một vai, người chủ chỉ việc (JobGuide) — test bỏ qua cho nhanh. */
export async function skipGuide(page: Page) {
  const guide = page.getByRole("dialog", { name: /^Cách làm:/ });
  await guide
    .getByRole("button", { name: "Bỏ qua" })
    .tap({ timeout: 5_000 })
    .catch(() => undefined);
}

/**
 * Mở một chức năng qua ☰ Menu (docs/IA.md §4: mỗi chức năng một sheet riêng; id trong game/features/registry.ts).
 * Chức năng phải dùng tại chỗ (chợ, vựa xe…) thì nhân vật tự đi tới rồi mới mở sheet.
 */
export async function openFeature(page: Page, id: string) {
  // Đang đi tới nơi mà tới đúng lúc thì sheet của nơi đó tự mở chen vào Menu — đóng rồi thử lại.
  for (let i = 0; i < 4; i++) {
    await closeSheet(page);
    await page.getByRole("button", { name: "Menu", exact: true }).tap();
    const tile = page.locator(`[data-feature="${id}"]`);
    try {
      await tile.tap({ timeout: 5_000 });
      return;
    } catch {
      if (i === 3) throw new Error(`Không mở được chức năng ${id} từ ☰ Menu`);
    }
  }
}

/** Đóng sheet đang mở (nếu có) — về bản đồ. */
export async function closeSheet(page: Page) {
  const close = page.getByRole("dialog").getByRole("button", { name: "Đóng" }).first();
  if (await close.isVisible()) await close.tap();
}
