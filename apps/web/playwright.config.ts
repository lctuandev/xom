import { defineConfig, devices } from "@playwright/test";

// Kịch bản chơi trên điện thoại (docs/PLAN.md Phase 1.5). Cần server đang chạy với đồng hồ tăng tốc:
//   GAME_TICK_MS=150 pnpm dev      rồi      pnpm --filter @xom/web test:e2e
// Dùng Chrome cài sẵn trên máy (channel "chrome") để không phải tải browser riêng.
export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "./e2e/.results",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    channel: "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  projects: [
    { name: "iphone-16-pro", use: { ...devices["iPhone 16 Pro"], browserName: "chromium" } },
    { name: "pixel-7", use: { ...devices["Pixel 7"] } },
  ],
});
