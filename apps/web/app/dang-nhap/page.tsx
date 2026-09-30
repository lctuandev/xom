import type { Metadata } from "next";
import { AuthForm } from "@/game/auth/AuthForm";

export const metadata: Metadata = { title: "Đăng nhập · XÓM" };

export default async function LoginPage({ searchParams }: PageProps<"/dang-nhap">) {
  const { next } = await searchParams;
  // Chỉ cho phép quay lại đường dẫn nội bộ.
  const target =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/play";
  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-full max-w-md flex-col px-6">
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <h1 className="text-6xl font-extrabold tracking-tight text-red">XÓM</h1>
        <p className="text-ink/70">Sống, buôn bán và làm hàng xóm với bạn bè.</p>
      </div>
      <AuthForm next={target} />
    </main>
  );
}
