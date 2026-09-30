import type { INestApplication } from "@nestjs/common";
import type { AuthResponse } from "@xom/shared";
import { register, startApp } from "./helpers.js";

describe("Auth (e2e)", () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  it("health báo db up", async () => {
    const res = await fetch(`${url}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", db: "up" });
  });

  it("đăng ký → cookie refresh httpOnly + access token dùng được", async () => {
    const { res, body, cookie } = await register(url);
    expect(res.status).toBe(201);
    expect(body.user.displayName).toBe("Tuấn Test");
    expect(cookie).toMatch(/xom_rt=.+HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    const me = await fetch(`${url}/api/auth/me`, {
      headers: { authorization: `Bearer ${body.accessToken}` },
    });
    expect(me.status).toBe(200);
  });

  it("trùng username → 409, dữ liệu sai → 400 kèm message tiếng Việt", async () => {
    const first = await register(url);
    const dup = await register(url, first.username);
    expect(dup.res.status).toBe(409);
    const bad = await fetch(`${url}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "a", password: "1", displayName: "x" }),
    });
    expect(bad.status).toBe(400);
    const err = (await bad.json()) as { message: string; fields: Record<string, string> };
    expect(err.fields.username).toMatch(/Tên đăng nhập/);
  });

  it("đăng nhập sai → 401; đúng → 200", async () => {
    const { username } = await register(url);
    const wrong = await fetch(`${url}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password: "saimatkhau" }),
    });
    expect(wrong.status).toBe(401);
    const ok = await fetch(`${url}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: username.toUpperCase(), password: "matkhau123" }),
    });
    expect(ok.status).toBe(200);
  });

  it("refresh xoay vòng: token cũ hết hiệu lực; logout thu hồi phiên", async () => {
    const { cookie } = await register(url);
    const oldToken = cookie.split(";")[0] ?? "";
    const r1 = await fetch(`${url}/api/auth/refresh`, {
      method: "POST",
      headers: { cookie: oldToken },
    });
    expect(r1.status).toBe(200);
    expect(((await r1.json()) as AuthResponse).accessToken).toBeTruthy();
    const newToken = (r1.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    expect(newToken).not.toBe(oldToken);
    const reuse = await fetch(`${url}/api/auth/refresh`, {
      method: "POST",
      headers: { cookie: oldToken },
    });
    expect(reuse.status).toBe(401);
    await fetch(`${url}/api/auth/logout`, { method: "POST", headers: { cookie: newToken } });
    const after = await fetch(`${url}/api/auth/refresh`, {
      method: "POST",
      headers: { cookie: newToken },
    });
    expect(after.status).toBe(401);
  });

  it("access token giả → 401", async () => {
    const res = await fetch(`${url}/api/auth/me`, { headers: { authorization: "Bearer abc" } });
    expect(res.status).toBe(401);
  });
});
