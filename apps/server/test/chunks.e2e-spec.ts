import type { INestApplication } from "@nestjs/common";
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
});
