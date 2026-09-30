import type { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";

/** Cấu hình dùng chung cho main.ts và test e2e. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  // Đứng sau proxy (Next, Cloudflare): tin X-Forwarded-* để biết HTTPS và IP thật.
  app.getHttpAdapter().getInstance().set("trust proxy", true);
  app.enableShutdownHooks();
}
