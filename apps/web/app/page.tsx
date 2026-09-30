import Link from "next/link";

export default function Home() {
  return (
    <main className="pt-safe pb-safe mx-auto flex h-full max-w-md flex-col px-6">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight text-red">XÓM</h1>
        <p className="text-lg text-ink/80">Sống, buôn bán và làm hàng xóm với bạn bè.</p>
      </div>
      <Link
        href="/play"
        className="mb-4 flex h-12 items-center justify-center rounded-2xl bg-red text-base font-semibold text-cream active:scale-[0.98]"
      >
        Vào xóm
      </Link>
    </main>
  );
}
