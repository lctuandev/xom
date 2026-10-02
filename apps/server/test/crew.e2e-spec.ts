import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type {
  CrewView,
  FundView,
  MeView,
  MixResultView,
  NotifyEvent,
  WorldView,
} from "@xom/shared";
import { laborBudget, mixTarget } from "@xom/sim";
import { LedgerService } from "../src/economy/ledger.service.js";
import { laborWallet } from "../src/game/projects.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { type Client, emit, join, next } from "./client.js";
import { startApp } from "./helpers.js";

// 🏗️ Phụ hồ công trình xóm (docs/USECASES.md UC-J6): công trình khởi công → công trường hiện trên bản đồ → tới nơi trộn
// mẻ vữa theo lệnh Cai Lâm (định mức thật) → đúng thì được trả công từ khoản nhân công của công trình → đủ mẻ thì xong sớm.

describe("Phụ hồ (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const ok = async <T>(socket: Client, event: Parameters<typeof emit>[1], body: unknown = {}) => {
    const r = await emit<T>(socket, event, body);
    if (!r.ok) throw new Error(`${event}: ${r.message}`);
    return r.data;
  };
  const money = async (socket: Client) => {
    const me = await ok<MeView>(socket, "biz:attend", { on: false });
    return me.money + me.bank;
  };

  it("khởi công → công trường trên bản đồ → trộn sai bị bắt làm lại → trộn đúng có công → đủ mẻ xong sớm", async () => {
    const { socket } = await join(url);
    const prisma = app.get(PrismaService);
    const ledger = app.get(LedgerService);
    const def = content.data.projects.find((p) => p.id === "lat_hem_12");
    if (!def) throw new Error("không có công trình");
    await emit(socket, "debug:clock", { minute: 7 * 60 });
    await ok<FundView>(socket, "project:propose", { projectId: def.id });
    await emit(socket, "debug:grant", { money: 1_000_000 });
    await wait(1100);
    const world = next(socket, "world", (w: WorldView) => (w.sites?.length ?? 0) > 0);
    await ok<FundView>(socket, "fund:donate", { amount: def.cost, pay: "cash" });
    const site = (await world).sites?.[0];
    if (!site) throw new Error("không thấy công trường");
    expect(site).toMatchObject({ projectId: def.id, mixes: 0, need: def.crewMixes });
    expect(site.budget).toBe(laborBudget(content, def.cost));

    // Đứng xa thì không trộn được.
    const view = await ok<CrewView>(socket, "crew:view", { siteId: site.id });
    const t = mixTarget(content, view.order);
    expect(await emit(socket, "crew:mix", { siteId: site.id, ...t })).toMatchObject({ ok: false });
    socket.emit("move", { x: site.x + 1, z: site.z + 1, yaw: 0, moving: false, inside: null });
    await wait(150);

    // Trộn sai (thiếu cát): Cai bắt đổ bỏ, không có tiền.
    const before = await money(socket);
    const bad = await ok<MixResultView>(socket, "crew:mix", {
      siteId: site.id,
      ...t,
      sand: t.sand - 2,
    });
    expect(bad.ok).toBe(false);
    expect(bad.problems.join()).toContain("cát");
    expect(await money(socket)).toBe(before);
    await wait(300);

    // Trộn đúng: công từ khoản nhân công, công trường thêm một mẻ.
    const good = await ok<MixResultView>(socket, "crew:mix", { siteId: site.id, ...t });
    expect(good).toMatchObject({ ok: true, pay: content.data.crew.wagePerMix });
    expect(good.view.site.mixes).toBe(1);
    expect(await money(socket)).toBe(before + content.data.crew.wagePerMix);
    expect(await ledger.balance(prisma, laborWallet(site.id))).toBe(
      site.budget - content.data.crew.wagePerMix,
    );
    // Mẻ trước chưa xong thì chưa trộn tiếp.
    const again = mixTarget(content, good.view.order);
    expect(await emit(socket, "crew:mix", { siteId: site.id, ...again })).toMatchObject({
      ok: false,
    });

    // Còn một mẻ là đủ → trộn xong thì nghiệm thu sớm, tiền công dư trả nhà thầu.
    await prisma.roomProject.update({ where: { id: site.id }, data: { mixes: def.crewMixes - 1 } });
    await wait(content.data.crew.mixMinutes * 12 + 200);
    const fresh = await ok<CrewView>(socket, "crew:view", { siteId: site.id });
    const done = next(socket, "notify", (n: NotifyEvent) =>
      n.text.includes("sớm nhờ bà con phụ hồ"),
    );
    const last = await ok<MixResultView>(socket, "crew:mix", {
      siteId: site.id,
      ...mixTarget(content, fresh.order),
    });
    expect(last.ok).toBe(true);
    await done;
    expect((await prisma.roomProject.findUniqueOrThrow({ where: { id: site.id } })).status).toBe(
      "DONE",
    );
    expect(await ledger.balance(prisma, laborWallet(site.id))).toBe(0);
    socket.disconnect();
  });
});
