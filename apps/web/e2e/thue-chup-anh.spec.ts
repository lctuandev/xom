import { expect, type Page, test } from "@playwright/test";
import { content } from "@xom/content";
import {
  openBanhMiStall,
  openFeature,
  readDialogue,
  register,
  setClock,
  shot,
  waitForMorning,
} from "./helpers";

// Thuê nhau chụp ảnh quầy (docs/USECASES.md UC-M8, KIENTRUC §3 — 1.20b): An mở xe bánh mì, đăng việc "chụp ảnh quầy"
// (trả trước tiền công cho Chú Hai giữ); Bình vào xóm, nhận việc (đặt cọc), tới quầy, cầm máy bấm đúng khoảnh khắc,
// nộp ảnh; An bấm thông báo → nghiệm thu 5⭐ → Bình nhận tiền, quầy An được đăng nhóm xóm.

const jobs = async (page: Page) => {
  await openFeature(page, "gigs");
  return page.getByRole("dialog", { name: "📸 Thuê nhau" });
};

test("chủ quầy thuê hàng xóm chụp ảnh quầy: đăng việc, nhận, chụp, nộp, nghiệm thu", async ({
  browser,
  page,
}, info) => {
  test.setTimeout(600_000);
  await register(page, "An");
  await waitForMorning(page, 9);
  await openBanhMiStall(page);
  await setClock(page, 7 * 60);

  // An đăng việc ở tab 📸 Thuê nhau.
  let sheet = await jobs(page);
  const post = sheet.locator("[data-gig-post]");
  await expect(post).toBeVisible();
  await post.getByRole("button", { name: "8 giờ" }).tap();
  await shot(page, "99-dang-viec-chup-anh");
  await post.getByRole("button", { name: /^Đăng việc · trả trước/ }).tap();
  await expect(sheet.locator("[data-gig-posted=OPEN]")).toBeVisible();
  await sheet.getByRole("button", { name: "Đóng" }).first().tap();

  await openFeature(page, "neighbors");
  const code = (await page.locator("[data-xom-code]").textContent()) ?? "";
  await page
    .getByRole("dialog", { name: "👥 Hàng xóm" })
    .getByRole("button", { name: "Đóng" })
    .last()
    .tap();

  // Bình vào xóm An qua link mời.
  const ctx = await browser.newContext({ ...info.project.use });
  const b = await ctx.newPage();
  await register(b, "Bình", `/play?xom=${code}`);
  await (await readDialogue(b)).getByRole("button", { name: "Con đi làm thuê trước" }).tap();
  await expect(b.locator("[data-online]")).toHaveAttribute("data-online", "2");
  await setClock(page, 7 * 60);

  // Bình nhận việc → An được báo.
  let bs = await jobs(b);
  const offer = bs.locator("[data-gig=OPEN]").first();
  await expect(offer).toContainText("Chụp ảnh");
  await offer.getByRole("button", { name: /^Nhận việc · đặt cọc/ }).tap();
  await expect(page.locator("[data-toast-open='gigs']").first()).toBeVisible();
  await expect(bs.locator("[data-gig-taken=TAKEN]")).toBeVisible();

  // Tới quầy An (tới nơi bảng tự mở lại), cầm máy.
  await bs.getByRole("button", { name: "🚶 Tới quầy" }).tap();
  bs = b.getByRole("dialog", { name: "📸 Thuê nhau" });
  await expect(bs.locator("[data-gig-taken=TAKEN]")).toBeVisible({ timeout: 60_000 });
  await bs.getByRole("button", { name: "📷 Chụp" }).tap();
  const cam = b.locator("[data-photo-shoot]");
  await expect(cam).toBeVisible();

  // Bấm đúng khoảnh khắc: máy test chỉ vài khung hình/giây nên canh giờ ngay trong trang (theo lịch khoảnh khắc server
  // gửi) rồi bấm nút màn trập thật; server chấm theo giờ server.
  await expect(cam.locator("[data-ring]").first()).toBeVisible({ timeout: 20_000 });
  await shot(b, "99b-khung-ngam");
  const scores = await b.evaluate(async (keep) => {
    const s = (
      window as unknown as {
        xomShoot: () => { startedAt: number; moments: { at: number }[] } | null;
      }
    ).xomShoot();
    if (!s) return [];
    const btn = document.querySelector<HTMLButtonElement>('button[aria-label="Bấm máy"]');
    const out: string[] = [];
    for (const m of s.moments) {
      if (out.length >= keep) break;
      const wait = s.startedAt + m.at - Date.now();
      if (wait < 50) continue;
      await new Promise((r) => setTimeout(r, wait));
      btn?.click();
      await new Promise((r) => setTimeout(r, 400));
      out.push(document.querySelector("[data-last-shot]")?.getAttribute("data-last-shot") ?? "?");
    }
    return out;
  }, content.data.gigs.photo.keep);
  expect(scores.length).toBe(content.data.gigs.photo.keep);
  await b.getByRole("button", { name: /^(Dừng|✓ Xong buổi chụp)/ }).tap();
  bs = b.getByRole("dialog", { name: "📸 Thuê nhau" });
  await expect(bs.locator("[data-photo-strip]")).toBeVisible();
  await bs.getByRole("button", { name: "🖼️ Nộp ảnh" }).tap();
  await expect(bs.locator("[data-gig-taken=SUBMITTED]")).toBeVisible();

  // An bấm thông báo → mở thẳng sheet 📸 Thuê nhau → nghiệm thu 5⭐.
  const toast = page.locator("[data-toast-open='gigs']", { hasText: "nộp ảnh" });
  await expect(toast).toBeVisible({ timeout: 15_000 });
  await toast.tap();
  sheet = page.getByRole("dialog", { name: "📸 Thuê nhau" });
  const posted = sheet.locator("[data-gig-posted=SUBMITTED]");
  await expect(posted).toBeVisible();
  await expect(posted.locator("[data-gig-quality]")).not.toHaveAttribute("data-gig-quality", "0");
  await shot(page, "99c-nghiem-thu");
  await posted.getByRole("button", { name: "✅ Nghiệm thu" }).tap();
  await expect(page.getByText(/📣 Ảnh quầy/).first()).toBeVisible();
  await expect(b.getByText(/📸 An nhận ảnh/).first()).toBeVisible();
  await ctx.close();
});
