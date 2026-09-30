import type { AuthResponse, AuthUser } from "@xom/shared";
import { create } from "zustand";
import { authApi } from "./api";

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  set: (auth: AuthResponse) => void;
  clear: () => void;
}

/** Access token chỉ nằm trong bộ nhớ; refresh token là cookie httpOnly (docs/PLAN.md §3.8). */
export const useAuth = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  set: (auth) => set({ user: auth.user, accessToken: auth.accessToken }),
  clear: () => set({ user: null, accessToken: null }),
}));

let inflight: Promise<string | null> | null = null;

/** Lấy access token mới bằng cookie refresh; gộp các lần gọi đồng thời thành một request. */
export function refreshAccessToken(): Promise<string | null> {
  inflight ??= authApi
    .refresh()
    .then((auth) => {
      useAuth.getState().set(auth);
      return auth.accessToken;
    })
    .catch(() => {
      useAuth.getState().clear();
      return null;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function logout() {
  await authApi.logout().catch(() => undefined);
  useAuth.getState().clear();
}
