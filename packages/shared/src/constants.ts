export const GAME_NAME = "XÓM";

/** Đường dẫn Socket.IO; web và API chạy cùng domain nên client chỉ cần path. */
export const SOCKET_PATH = "/socket.io";

/**
 * Tùy chọn engine.io phải giống nhau ở client và server. Tắt dấu "/" cuối path vì proxy
 * (Next rewrites khi dev) chuẩn hóa URL và bỏ mất nó.
 */
export const SOCKET_OPTIONS = {
  path: SOCKET_PATH,
  addTrailingSlash: false,
  transports: ["websocket"],
} as const;
