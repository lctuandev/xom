import type { INestApplication } from "@nestjs/common";
import type { SayEvent, Snapshot } from "@xom/shared";
import { emit, join, next } from "./client.js";
import { startApp } from "./helpers.js";

// Chat tự gõ (docs/USECASES.md UC-D4): cả xóm thấy, che từ tục, chống spam.

describe("Chat tự gõ (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  it("hàng xóm thấy câu mình gõ (đã che từ tục); gõ dồn dập bị chặn; câu quá dài bị từ chối", async () => {
    const a = await join(url);
    const b = await join(url);
    const moved = next(b.socket, "snapshot", (s: Snapshot) => s.roster.code === a.snap.roster.code);
    await emit(b.socket, "xom:join", { code: a.snap.roster.code });
    await moved;
    const heard = next(b.socket, "say", (e: SayEvent) => e.who === a.snap.me.playerId);
    expect(
      (await emit(a.socket, "chat:text", { text: "  Chào   cả xóm, bánh mì ngon vl " })).ok,
    ).toBe(true);
    expect((await heard).text).toBe("Chào cả xóm, bánh mì ngon ***");
    expect(await emit(a.socket, "chat:text", { text: "nữa nè" })).toMatchObject({
      ok: false,
      message: "Từ từ thôi, nói chậm lại chút",
    });
    expect(await emit(a.socket, "chat:text", { text: "x".repeat(81) })).toMatchObject({
      ok: false,
      error: "invalid_payload",
    });
    a.socket.disconnect();
    b.socket.disconnect();
  });
});
