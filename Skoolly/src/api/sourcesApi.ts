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

export interface SignatureProgram {
  name: string;
  /** One of ProgramCategory in lib/highlights.ts */
  category: string | null;
  description: string | null;
  /** Text quoted from the school's website, checked by the scraper to really be there */
  evidence: string | null;
}

/** One part of a school's record: who it came from, a page to check it on, when it was fetched or checked */
export interface DataSource {
  source: string;
  url: string | null;
  /** Bangkok local time, e.g. "2026-09-14 01:07:01" */
  at: string | null;
}
export type DataSourceKey = "opec" | "isat" | "website" | "location";
/** Built by the data pipeline (data_manager.data_sources); a part with nothing behind it is absent */
export type DataSources = Partial<Record<DataSourceKey, DataSource>>;

/** Display order, what each part covers, and what happened at `at` */
export const DATA_SOURCE_PARTS: { key: DataSourceKey; label: string; when: string }[] = [
  { key: "opec", label: "ข้อมูลทั่วไป", when: "ดึงข้อมูลเมื่อ" },
  { key: "isat", label: "สมาชิกและการรับรอง", when: "ดึงข้อมูลเมื่อ" },
  { key: "website", label: "เว็บไซต์โรงเรียน", when: "ตรวจเมื่อ" },
  { key: "location", label: "ที่ตั้ง", when: "ตรวจเมื่อ" },
];

/** "13 ก.ย. 2569" in Bangkok time; pipeline times are stored as Bangkok local time without a zone */
export function formatThaiDate(value?: string | null): string | null {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? `${value.replace(" ", "T")}+07:00` : value;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
}

export interface SchoolSources {
  /** Absent until the data_sources column is filled */
  data_sources?: DataSources;
  opec: {
    /** Local (Bangkok) time of the OPEC fetch, e.g. "2026-09-13 17:48:31" */
    fetched_at: string | null;
    imported_at: string | null;
    /** The school's page on school.opec.go.th */
    url: string | null;
  };
  /** Present only when the published fees / safety were collected from the school's website and approved */
  website: { page_url: string | null; collected_at: string | null; approved_at: string | null } | null;
  safety: SchoolSafetyDetail | null;
  /** From the published website version. null = not collected yet; [] = the site mentions none */
  signature_programs: SignatureProgram[] | null;
  facilities: string[] | null;
}

export async function getSchoolSources(schoolCode: string): Promise<SchoolSources | null> {
  const res = await fetch(`/api/public/schools/${encodeURIComponent(schoolCode)}/sources`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sources request failed (HTTP ${res.status})`);
  return (await res.json()) as SchoolSources;
}
