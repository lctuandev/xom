import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { FundView, NotifyEvent, Snapshot } from "@xom/shared";
import { feeToFund } from "@xom/sim";
import { GameService } from "../src/game/game.service.js";
import { emit, join, next, openBanhMiStall } from "./client.js";
import { startApp } from "./helpers.js";

// Quỹ xóm + công trình chung (docs/USECASES.md UC-J5).

describe("Quỹ xóm + công trình (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("phí chợ vào quỹ; đề xuất → (một mình) qua luôn → góp đủ quỹ → thi công → nghiệm thu", async () => {
    const a = await openBanhMiStall(url);
    const view = async () => {
      const r = await emit<FundView>(a.socket, "fund:view", {});
      if (!r.ok) throw new Error(`fund:view ${r.message}`);
      return r.data;
    };
    const share = feeToFund(content.economy.fees.daily.cart, content.data.fund.feeShare);
    expect((await view()).balance).toBe(share);

    expect(await emit(a.socket, "project:propose", { projectId: "cau_be_tong" })).toMatchObject({
      ok: false,
      message: "Phải làm công trình trước đó đã",
    });
    const proposed = await emit<FundView>(a.socket, "project:propose", { projectId: "lat_hem_12" });
    if (!proposed.ok) throw new Error(`đề xuất: ${proposed.message}`);
    // Xóm một người: người đề xuất bỏ phiếu thuận là đủ → chờ quỹ.
    expect(proposed.data.active[0]).toMatchObject({ projectId: "lat_hem_12", status: "FUNDING" });

    expect(await emit(a.socket, "fund:donate", { amount: 15_000 })).toMatchObject({ ok: false });
    await emit(a.socket, "debug:grant", { money: 1_000_000 });
    // Nghỉ cho khỏi chạm giới hạn 20 thao tác/giây (mở quầy vừa gửi nhiều lệnh).
    await wait(1100);
    const cost = content.data.projects.find((p) => p.id === "lat_hem_12")?.cost ?? 0;
    const started = next(a.socket, "notify", (n: NotifyEvent) => n.text.startsWith("🏗️"));
    const donated = await emit<FundView>(a.socket, "fund:donate", {
      amount: cost,
      pay: "cash",
    });
    if (!donated.ok) throw new Error(`góp: ${donated.error} ${donated.message}`);
    await started;
    expect(donated.data.balance).toBe(share);
    expect(donated.data.active[0]).toMatchObject({ status: "BUILDING" });

    // Tua tới ngày xong → nghiệm thu, khách ở đầu hẻm ghé nhiều hơn.
    const game = app.get(GameService);
    const room = game.roomFor(a.snap.me.playerId);
    if (!room) throw new Error("không có xóm");
    const doneDay = donated.data.active[0]?.doneDay ?? room.day;
    room.day = doneDay;
    const finished = next(a.socket, "notify", (n: NotifyEvent) =>
      n.text.startsWith("🎉 Nghiệm thu"),
    );
    await game.projects.tick(room);
    await finished;
    const after = await view();
    expect(after.done).toEqual(["lat_hem_12"]);
    expect(after.active).toEqual([]);
    a.socket.disconnect();
  });

  it("xóm hai người: đang bàn thì không đề xuất thêm; hoà phiếu thì không qua", async () => {
    const a = await join(url);
    const b = await join(url);
    const moved = next(b.socket, "snapshot", (s: Snapshot) => s.roster.code === a.snap.roster.code);
    await emit(b.socket, "xom:join", { code: a.snap.roster.code });
    await moved;
    const p = await emit<FundView>(a.socket, "project:propose", { projectId: "den_duong" });
    if (!p.ok) throw new Error(`đề xuất: ${p.message}`);
    const voting = p.data.active[0];
    expect(voting).toMatchObject({ status: "VOTING", yes: 1, no: 0, mine: true });
    expect(await emit(a.socket, "project:propose", { projectId: "ao_ca" })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/đang bàn/),
    });
    if (!voting) throw new Error("không có đề xuất");
    const rejected = next(a.socket, "notify", (n: NotifyEvent) => n.text.startsWith("❌"));
    const v = await emit<FundView>(b.socket, "project:vote", { id: voting.id, yes: false });
    if (!v.ok) throw new Error(`bỏ phiếu: ${v.message}`);
    expect((await rejected).text).toMatch(/1 thuận \/ 1 chống/);
    expect(v.data.active).toEqual([]);
    a.socket.disconnect();
    b.socket.disconnect();
  });
});
