import { z } from "zod";

// REST /api/auth/* (docs/PLAN.md §3.8).

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, "Tên đăng nhập 3–20 ký tự: chữ không dấu, số, dấu _");

export const passwordSchema = z
  .string()
  .min(8, "Mật khẩu tối thiểu 8 ký tự")
  .max(128, "Mật khẩu tối đa 128 ký tự");

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: z
    .string()
    .trim()
    .min(2, "Tên hiển thị tối thiểu 2 ký tự")
    .max(24, "Tên hiển thị tối đa 24 ký tự"),
  /** Mã xóm từ link mời (?xom=…): vào thẳng xóm đó nếu còn chỗ. */
  xom: z
    .string()
    .regex(/^[0-9a-f]{8}$/i)
    .transform((s) => s.toLowerCase())
    .optional()
    .catch(undefined),
  /** Lập xóm riêng thay vì vào xóm đông vui còn chỗ (ô tick "on" từ form hoặc true từ JSON). */
  solo: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "Nhập mật khẩu"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthUser {
  id: string;
  username: string;
  playerId: string;
  displayName: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

/** Lỗi REST trả về cho client: message là tiếng Việt, hiển thị thẳng được. */
export interface ApiError {
  message: string;
  fields?: Record<string, string>;
}
