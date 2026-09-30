import type { ApiError, AuthResponse, LoginInput, RegisterInput } from "@xom/shared";

/** Lỗi REST có message tiếng Việt và lỗi theo từng field để hiện dưới ô nhập. */
export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/auth/${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiFailure("Không kết nối được máy chủ", 0);
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Partial<ApiError> & T;
  if (!res.ok) {
    const message =
      res.status === 429
        ? (data.message ?? "Thử lại sau ít phút")
        : (data.message ?? "Có lỗi xảy ra");
    throw new ApiFailure(message, res.status, data.fields ?? {});
  }
  return data;
}

export const authApi = {
  register: (input: RegisterInput) => post<AuthResponse>("register", input),
  login: (input: LoginInput) => post<AuthResponse>("login", input),
  refresh: () => post<AuthResponse>("refresh"),
  logout: () => post<void>("logout"),
};
