import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { ContractBoardView, MeView, NotifyEvent, StoryEntryView } from "@xom/shared";
import { emit, next, openBanhMiStall } from "./client.js";
import { startApp } from "./helpers.js";

// Bảng việc xóm + điểm tin cậy (docs/KIENTRUC.md §3, docs/USECASES.md UC-M7): nhận việc (thưởng + cọc vào escrow) → làm hàng
// ở quầy (trừ nguyên liệu thật) → mang tới tận nơi trước hạn → nhận thưởng + lại cọc, 🤝 tăng. Trễ / bỏ ngang: mất cọc,
// 🤝 giảm, thấp quá thì bị khoá nhận việc.

describe("Bảng việc xóm (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  type Sock = Parameters<typeof emit>[0];
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const board = async (socket: Sock) => {
    const r = await emit<ContractBoardView>(socket, "contract:list", {});
    if (!r.ok) throw new Error(`${r.error}: ${r.message}`);
    return r.data;
  };
  /** Dán một việc theo mẫu rồi lấy việc đó (việc OPEN mới nhất cùng mẫu). */
  const post = async (socket: Sock, templateId: string) => {
    await emit(socket, "debug:contract", { templateId });
    const b = await board(socket);
    const c = b.offers.filter((o) => o.templateId === templateId && o.status === "OPEN").at(-1);
    if (!c) throw new Error("không thấy việc vừa dán");
    return c;
  };
  const me = async (socket: Sock) => {
    const r = await emit<MeView>(socket, "biz:attend", { on: true });
    if (!r.ok) throw new Error(`${r.error}: ${r.message}`);
    return r.data;
  };

  it("nhận → làm hàng ở quầy → mang tới Cổng trường → nhận thưởng + lại cọc, 🤝 +5, ghi Chuyện", async () => {
    const { socket } = await openBanhMiStall(url);
    await wait(1_100); // mở quầy tốn nhiều thao tác — tránh giới hạn 20 thao tác/giây
    await emit(socket, "debug:clock", { minute: 7 * 60 });
    const c = await post(socket, "truong_banh_mi");
    expect(c.text).toContain(`Giao ${c.qty} bánh mì thịt`);
    const before = await me(socket);

    const took = await emit<ContractBoardView>(socket, "contract:take", { id: c.id });
    if (!took.ok) throw new Error(took.message);
    expect(took.data.offers.find((o) => o.id === c.id)).toMatchObject({
      status: "TAKEN",
      mine: true,
    });
    const afterTake = await me(socket);
    expect(afterTake.money + afterTake.bank).toBe(before.money + before.bank - c.deposit);

    // Chưa làm hàng thì chưa giao được.
    const early = await emit(socket, "contract:deliver", { id: c.id });
    expect(early.ok).toBe(false);

    await wait(1_100);
    const bread = (m: MeView) => m.inventory.find((i) => i.itemId === "banh_mi_phoi")?.qty ?? 0;
    const prepared = await emit<ContractBoardView>(socket, "contract:prepare", { id: c.id });
    if (!prepared.ok) throw new Error(prepared.message);
    expect(prepared.data.offers.find((o) => o.id === c.id)?.status).toBe("READY");
    expect(bread(await me(socket))).toBe(bread(afterTake) - c.qty);

    // Đứng ở quầy mình (Đầu hẻm) thì không giao được — phải tới tận nơi.
    const lot = content.lot("dau_hem").position;
    socket.emit("move", { x: lot.x, z: lot.z, yaw: 0, moving: false, inside: null });
    await new Promise((r) => setTimeout(r, 120));
    const far = await emit(socket, "contract:deliver", { id: c.id });
    expect(far.ok).toBe(false);
    if (!far.ok) expect(far.message).toContain("Cổng trường");

    const drop = content.lot("cong_truong").position;
    socket.emit("move", { x: drop.x, z: drop.z + 1, yaw: 0, moving: false, inside: null });
    await new Promise((r) => setTimeout(r, 120));
    const paid = next(socket, "notify", (n: NotifyEvent) => n.text.startsWith("📋"));
    const done = await emit<ContractBoardView>(socket, "contract:deliver", { id: c.id });
    if (!done.ok) throw new Error(done.message);
    expect(done.data.offers.find((o) => o.id === c.id)?.status).toBe("DONE");
    expect(done.data.trust).toBe(55);
    expect((await paid).text).toContain("hoàn cọc");
    const end = await me(socket);
    expect(end.money + end.bank).toBe(afterTake.money + afterTake.bank + c.reward + c.deposit);
    expect(end.trust).toBe(55);
    const story = await emit<StoryEntryView[]>(socket, "story:list", {});
    expect(
      story.ok &&
        story.data.some((s) => s.text.startsWith("Xong việc đầu tiên trên bảng việc xóm")),
    ).toBe(true);
    socket.disconnect();
  });

  it("không nhận được việc vượt tin cậy hoặc khác nghề", async () => {
    const { socket } = await openBanhMiStall(url);
    await wait(1_100); // mở quầy tốn nhiều thao tác — tránh giới hạn 20 thao tác/giây
    await emit(socket, "debug:clock", { minute: 7 * 60 });
    const big = await post(socket, "tiec_xom_banh_mi");
    const r1 = await emit(socket, "contract:take", { id: big.id });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.message).toContain("tin cậy 60");
    const tea = await post(socket, "van_phong_tra_sua");
    const r2 = await emit(socket, "contract:take", { id: tea.id });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.message).toContain("trà sữa");
    socket.disconnect();
  });

  it("trễ hạn: mất cọc, 🤝 −15; bỏ ngang mãi thì bị khoá nhận việc", async () => {
    const { socket } = await openBanhMiStall(url);
    await wait(1_100); // mở quầy tốn nhiều thao tác — tránh giới hạn 20 thao tác/giây
    await emit(socket, "debug:clock", { minute: 7 * 60 });
    const c = await post(socket, "xe_buyt_banh_mi");
    await emit(socket, "contract:take", { id: c.id });
    const before = await me(socket);
    const late = next(socket, "notify", (n: NotifyEvent) => n.text.startsWith("📋 Trễ hạn"));
    await emit(socket, "debug:clock", { minute: c.deadline + 5 });
    expect((await late).text).toContain(`mất cọc ${c.deposit.toLocaleString("vi-VN")}đ`);
    const after = await me(socket);
    expect(after.trust).toBe(35);
    // Cọc không quay về; thưởng hoàn người đặt.
    expect(after.money + after.bank).toBeLessThanOrEqual(before.money + before.bank);
    expect((await board(socket)).offers.find((o) => o.id === c.id)?.status).toBe("FAILED");

    // Bỏ ngang thêm hai lần: 35 → 20 → 5 → khoá.
    await wait(1_100);
    for (let i = 0; i < 2; i++) {
      const d = await post(socket, "truong_banh_mi");
      await emit(socket, "contract:take", { id: d.id });
      await emit(socket, "contract:drop", { id: d.id });
    }
    await wait(1_100);
    const b = await board(socket);
    expect(b.trust).toBe(5);
    expect(b.lockedUntil).not.toBeNull();
    const again = await post(socket, "truong_banh_mi");
    const r = await emit(socket, "contract:take", { id: again.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain(content.data.contracts.keeper);
    socket.disconnect();
  });
});
