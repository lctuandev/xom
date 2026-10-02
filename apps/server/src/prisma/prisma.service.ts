import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  /**
   * Đóng kết nối SAU CÙNG (onApplicationShutdown chạy sau mọi onModuleDestroy): GameService còn chờ nhịp / intent dở
   * chạy xong và lưu đồng hồ xóm trong onModuleDestroy.
   */
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
