import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AuthResponse } from "@xom/shared";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/setup.js";

try {
  process.loadEnvFile("../../.env");
} catch {}

export async function startApp(): Promise<{ app: INestApplication; url: string }> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  return { app, url: await app.getUrl() };
}

export const uniqueName = () => `t_${Math.random().toString(36).slice(2, 12)}`;

export async function register(
  url: string,
  username = uniqueName(),
  /** Mặc định lập xóm riêng cho test ổn định; `{ solo: false }` để thử tự xếp xóm, `xom` = link mời. */
  opts: { solo?: boolean; xom?: string } = { solo: true },
) {
  const res = await fetch(`${url}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username,
      password: "matkhau123",
      displayName: "Tuấn Test",
      ...opts,
    }),
  });
  const body = (await res.json()) as AuthResponse;
  return { res, body, cookie: res.headers.get("set-cookie") ?? "", username };
}
