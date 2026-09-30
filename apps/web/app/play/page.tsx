import type { Metadata } from "next";
import { PlayClient } from "@/game/PlayClient";

export const metadata: Metadata = { title: "XÓM" };

export default function PlayPage() {
  return (
    <main className="fixed inset-0">
      <PlayClient />
    </main>
  );
}
