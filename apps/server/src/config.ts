// Cấu hình đọc từ biến môi trường (dev: .env gốc; production: deploy/.env qua Docker).

const isProd = process.env.NODE_ENV === "production";

function required(name: string, devDefault: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProd) throw new Error(`Thiếu biến môi trường ${name}`);
  return devDefault;
}

export const config = {
  isProd,
  jwtSecret: new TextEncoder().encode(required("JWT_SECRET", "dev-only-not-secret-change-me")),
  accessTokenTtl: "15m",
  refreshTokenDays: 30,
  refreshCookie: "xom_rt",
};
