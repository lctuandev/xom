import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { XomListItem } from "@xom/shared";
import { connect, emit } from "./client.js";
import { register, startApp, uniqueName } from "./helpers.js";

// Xóm chung (HANDOFF 3.8, docs/USECASES.md UC-J7): link mời đăng ký là vào thẳng xóm bạn; không link thì tự vào xóm
// còn chỗ đông nhất; tick "Lập xóm riêng" thì có xóm mới; danh sách xóm để dọn về.

describe("Xóm chung (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  const enter = async (opts: { solo?: boolean; xom?: string }) => {
    const { body } = await register(url, uniqueName(), opts);
    return connect(url, body.accessToken);
  };
  const list = async (socket: Awaited<ReturnType<typeof enter>>["socket"]) => {
    const r = await emit<XomListItem[]>(socket, "xom:list", {});
    if (!r.ok || !r.data) throw new Error("xom:list lỗi");
    return r.data;
  };

  it("link mời vào thẳng xóm bạn, tự xếp vào xóm đông, lập xóm riêng, danh sách xóm", async () => {
    const a = await enter({ solo: true });
    const code = a.snap.roster.code;

    // Bình đăng ký từ link mời: cùng xóm với An, An thấy 2 người online.
    const b = await enter({ xom: code });
    expect(b.snap.roster.code).toBe(code);
    expect(b.snap.roster.peers).toHaveLength(2);

    // Mã sai thì như không có link (không lỗi đăng ký).
    const c = await enter({ xom: "zzzzzzzz", solo: true });
    expect(c.snap.roster.code).not.toBe(code);

    // Không tick lập xóm riêng: vào một xóm đã có người ở.
    const d = await enter({ solo: false });
    const mine = (await list(d.socket)).find((x) => x.mine);
    expect(mine?.residents).toBeGreaterThanOrEqual(2);
    expect(mine?.residents).toBeLessThanOrEqual(content.economy.xomResidents);

    // Danh sách xóm có xóm của An (2 cư dân, 2 online), không phải xóm của mình.
    const seen = (await list(c.socket)).find((x) => x.code === code);
    expect(seen).toMatchObject({ residents: 2, online: 2, mine: false, full: false });

    // Dọn về xóm An từ danh sách.
    const moved = await emit(c.socket, "xom:join", { code });
    expect(moved.ok).toBe(true);
    expect((await list(c.socket)).find((x) => x.mine)?.code).toBe(code);

    for (const p of [a, b, c, d]) p.socket.disconnect();
  });
});
