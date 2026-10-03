import type { INestApplication } from "@nestjs/common";
import type { MeView } from "@xom/shared";
import { connect, emit, next } from "./client.js";
import { register, startApp, uniqueName } from "./helpers.js";

// Bản đồ mở bước A (docs/BANDO.md): xóm mở thêm khu → cả xóm nhận lưới mới; vào lại vẫn thấy khu đã mở (lưu DB).

describe("Bản đồ mở: ghép khu (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  it("mở khu đông rồi khu đông thứ hai: nối tiếp, lưu lại, người mới vào thấy", async () => {
    const { body } = await register(url, uniqueName(), { solo: true });
    const a = await connect(url, body.accessToken);
    expect(a.snap.world.chunks ?? []).toEqual([]);

    const world = next(a.socket, "world", (w) => (w.chunks?.length ?? 0) === 1);
    expect((await emit(a.socket, "debug:chunk", { chunkId: "khu_dong" })).ok).toBe(true);
    expect((await world).chunks).toEqual([{ chunkId: "khu_dong", gx: 1, gz: 0 }]);
    expect((await emit(a.socket, "debug:chunk", { chunkId: "khu_dong" })).ok).toBe(true);
    expect((await emit(a.socket, "debug:chunk", { chunkId: "khong_co" })).ok).toBe(false);

    // Hàng xóm vào sau: snapshot có đủ khu đã mở.
    const b = await register(url, uniqueName(), { xom: a.snap.roster.code });
    const nb = await connect(url, b.body.accessToken);
    expect(nb.snap.world.chunks).toEqual([
      { chunkId: "khu_dong", gx: 1, gz: 0 },
      { chunkId: "khu_dong", gx: 2, gz: 0 },
    ]);
    a.socket.disconnect();
    nb.socket.disconnect();
  });

  it("chỗ bán của khu (bước B): chưa mở khu thì không chọn được; mở rồi chọn được, người khác không chiếm được", async () => {
    const { body } = await register(url, uniqueName(), { solo: true });
    const a = await connect(url, body.accessToken);
    expect((await emit(a.socket, "equipment:buy", { equipmentId: "xe_banh_mi" })).ok).toBe(true);
    const lotId = "khu_dong__dau_pho__1_0";
    expect(await emit(a.socket, "biz:update", { lotId })).toMatchObject({
      ok: false,
      message: "Không có chỗ này",
    });
    expect((await emit(a.socket, "debug:chunk", { chunkId: "khu_dong" })).ok).toBe(true);
    const moved = await emit<MeView>(a.socket, "biz:update", { lotId });
    if (!moved.ok) throw new Error(moved.message);
    expect(moved.data.business?.lotId).toBe(lotId);

    const b = await register(url, uniqueName(), { xom: a.snap.roster.code });
    const nb = await connect(url, b.body.accessToken);
    expect((await emit(nb.socket, "equipment:buy", { equipmentId: "xe_banh_mi" })).ok).toBe(true);
    expect((await emit(nb.socket, "biz:update", { lotId })).ok).toBe(false);
    a.socket.disconnect();
    nb.socket.disconnect();
  });
});
