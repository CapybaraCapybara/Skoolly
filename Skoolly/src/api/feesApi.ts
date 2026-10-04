/**
 * api/feesApi.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Published tuition and extra fees for the Cost Calculator, read from each
 * school's current published version (school_data.version_fees /
 * version_extra_fees) via GET /api/public/fees.
 */

import type { ScrapedSchoolData } from "@/lib/calculatorUtils";

export async function getPublishedFees(): Promise<ScrapedSchoolData[]> {
  const res = await fetch(`/api/public/fees?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fees request failed (HTTP ${res.status})`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error("Unexpected response from /api/public/fees");
  return data as ScrapedSchoolData[];
}
