import type { Metadata } from "next";
import { AuthForm } from "@/game/auth/AuthForm";
import { Logo } from "@/game/ui/Logo";
import { XomArt } from "@/game/ui/XomArt";

export const metadata: Metadata = { title: "Đăng nhập · XÓM" };

export default async function LoginPage({ searchParams }: PageProps<"/dang-nhap">) {
  const { next } = await searchParams;
  // Chỉ cho phép quay lại đường dẫn nội bộ.
  const target =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/play";
  return (
    <main className="pb-safe mx-auto flex min-h-full max-w-md flex-col">
      <div className="relative">
        <XomArt className="h-60 w-full" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-cream to-transparent pt-10 pb-2 text-center">
          <h1 className="flex justify-center">
            <Logo className="h-20" />
          </h1>
          <p className="text-sm text-ink/70">Sống, buôn bán và làm hàng xóm với bạn bè.</p>
        </div>
      </div>
      <div className="px-6 pt-4">
        <AuthForm next={target} />
      </div>
    </main>
  );
}
