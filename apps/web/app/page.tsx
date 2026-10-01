import Link from "next/link";
import { XomArt } from "@/game/ui/XomArt";

export default function Home() {
  return (
    <main className="pb-safe mx-auto flex h-full max-w-md flex-col">
      <XomArt className="h-[55dvh] w-full" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight text-red">XÓM</h1>
        <p className="text-lg text-ink/80">Sống, buôn bán và làm hàng xóm với bạn bè.</p>
      </div>
      <Link
        href="/play"
        className="mx-6 mb-4 flex h-12 items-center justify-center rounded-2xl bg-red text-base font-semibold text-cream active:scale-[0.98]"
      >
        Vào xóm
      </Link>
    </main>
  );
}
