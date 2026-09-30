import type { Request } from "express";

/** IP thật của người chơi: qua Cloudflare (CF-Connecting-IP) → proxy Next (X-Forwarded-For) → socket. */
export function clientIp(req: Pick<Request, "headers" | "ip">): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf) return cf;
  const xff = req.headers["x-forwarded-for"];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
  return first || req.ip || "unknown";
}
