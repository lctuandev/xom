import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: "./",
    include: ["**/*.e2e-spec.ts"],
    // Tăng tốc đồng hồ game: 1 phút game = 10ms.
    env: { GAME_TICK_MS: "10" },
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
