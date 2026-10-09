/**
 * api/sourcesApi.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Where one school's published data came from and when, plus its published
 * safety details, via GET /api/public/schools/{opec_code}/sources.
 * Safety details awaiting admin review are never returned.
 */

export interface SchoolSafetyDetail {
  security_guards: boolean | null;
  cctv_monitoring: boolean | null;
  nurse_medical_clinic: boolean | null;
  child_safeguarding_policy: boolean | null;
  air_quality_pm25_protocol: boolean | null;
  visitor_access_control: boolean | null;
  highlights: string[];
  policy_summary: string | null;
  policy_url: string | null;
}

export interface SchoolSources {
  opec: {
    /** Local (Bangkok) time of the OPEC fetch, e.g. "2026-09-13 17:48:31" */
    fetched_at: string | null;
    imported_at: string | null;
  };
  /** Present only when the published fees / safety were collected from the school's website and approved */
  website: { page_url: string | null; collected_at: string | null; approved_at: string | null } | null;
  safety: SchoolSafetyDetail | null;
}

export async function getSchoolSources(schoolCode: string): Promise<SchoolSources | null> {
  const res = await fetch(`/api/public/schools/${encodeURIComponent(schoolCode)}/sources`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sources request failed (HTTP ${res.status})`);
  return (await res.json()) as SchoolSources;
}
