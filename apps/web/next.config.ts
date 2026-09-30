import path from "node:path";
import type { NextConfig } from "next";

// Game server (NestJS). Web proxy /api và /socket.io (kể cả WebSocket) sang server, nên cả dev (:3000)
// lẫn production (:5555, deploy/docker-compose.prod.yml) chỉ cần mở một origin. Rewrites được tính lúc build.
const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Bản build tự chứa cho Docker; trace từ gốc monorepo để kèm @xom/shared.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Cho phép mở dev server từ điện thoại qua LAN và Cloudflare Quick Tunnel.
  allowedDevOrigins: ["*.trycloudflare.com", "192.168.*.*", "10.*.*.*"],
  transpilePackages: ["@xom/shared", "@xom/content", "@xom/sim"],
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
      // Socket.IO chạy với addTrailingSlash: false (xem SOCKET_OPTIONS trong @xom/shared).
      { source: "/socket.io", destination: `${apiOrigin}/socket.io` },
    ];
  },
};

export default nextConfig;
