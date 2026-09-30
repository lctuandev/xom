import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { configureApp } from "./setup.js";

// Dùng chung file .env ở gốc monorepo; môi trường production truyền biến qua Docker.
try {
  process.loadEnvFile("../../.env");
} catch {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(Number(process.env.PORT ?? 4000), "0.0.0.0");
}
await bootstrap();
