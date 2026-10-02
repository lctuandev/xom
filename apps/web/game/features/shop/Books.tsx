"use client";

import { useMyStats, WeekChart } from "../../ui/BoardSheet";
import { Section } from "../../ui/Sheet";
import { ShopFeature } from "./common";

/** 📊 Sổ sách: doanh thu, lãi 7 ngày. */
export function BooksSheet() {
  const stats = useMyStats();
  return (
    <ShopFeature id="books">
      {() => (
        <Section title="📊 7 ngày qua">
          <WeekChart stats={stats} />
        </Section>
      )}
    </ShopFeature>
  );
}
