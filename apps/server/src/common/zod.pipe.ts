import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ApiError } from "@xom/shared";
import type { ZodType } from "zod";

/** Validate body bằng schema zod dùng chung; lỗi trả về message tiếng Việt theo từng field. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    const body: ApiError = { message: Object.values(fields)[0] ?? "Dữ liệu không hợp lệ", fields };
    throw new BadRequestException(body);
  }
}
