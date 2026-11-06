import type {
  OpecSchoolRecord,
  ScraperProgressState,
  WebsiteRegistryResponse,
  WebsiteHealthState,
  PendingVersionRecord,
  ScrapeLogRecord,
  CurriculumReviewResponse,
  SchoolVersion,
  VersionCompare,
} from "@/types/admin";

const API_BASE = ""; // Relative path to support Vite proxy and server middlewares

export async function getScraperProgress(): Promise<ScraperProgressState | null> {
  try {
    const res = await fetch(`${API_BASE}/api/progress?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    // Backend service not running
  }
  return null;
}

const BACKEND_DOWN = "เชื่อมต่อ backend (พอร์ต 8004) ไม่ได้ ตรวจสอบว่าเปิด start-dev.bat อยู่";

export async function postAction(endpoint: string): Promise<{ status: string }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    // fetch itself rejected: nothing is listening at all.
    throw new Error(BACKEND_DOWN);
  }

  if (!res.ok) {
    // The dev proxy answers with a non-JSON 500 when the backend is down, so
    // read as text first — res.json() would throw and hide the real cause.
    const body = await res.text().catch(() => "");
    let detail = "";
    try {
      const parsed = JSON.parse(body);
      detail = parsed.detail || parsed.status || "";
    } catch {
      // not JSON — the proxy, not the API, produced this response
    }
    if (detail) throw new Error(detail);
    throw new Error(res.status >= 500 ? BACKEND_DOWN : `Action failed (HTTP ${res.status})`);
  }

  return await res.json();
}

// 409: a pipeline job is running and would save over this edit, or another admin saved this school
// after the page loaded it; `detail` says which
async function throwIfBusy(res: Response): Promise<void> {
  if (res.status !== 409) return;
  const body = await res.json().catch(() => ({}));
  throw new Error(body.detail || "มีงานอื่นกำลังทำงานอยู่");
}

/** Returns the school's new published version id, or null when the save failed */
export async function updateSchoolWebsite(
  schoolCode: string,
  website: string,
  expectedVersionId?: string | null
): Promise<string | null> {
  const res = await fetch(`${API_BASE}/api/school/${schoolCode}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ website, website_source: "Manual Edit", expected_version_id: expectedVersionId }),
  });
  await throwIfBusy(res);
  return res.ok ? (await res.json()).version_id ?? null : null;
}

/** Every version of one school, highest number first, and the one published now */
export async function getSchoolVersions(
  schoolCode: string
): Promise<{ current_version_id: string | null; versions: SchoolVersion[] }> {
  const res = await fetch(`${API_BASE}/api/school/${schoolCode}/versions`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "อ่านประวัติเวอร์ชันไม่สำเร็จ");
  }
  return await res.json();
}

/** A version next to the one published now: what restoring it would change */
export async function getVersionCompare(schoolCode: string, versionId: string): Promise<VersionCompare> {
  const res = await fetch(`${API_BASE}/api/school/${schoolCode}/versions/${versionId}/compare`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "อ่านข้อมูลฉบับนี้ไม่สำเร็จ");
  }
  return await res.json();
}

/** Publishes a new version with the values of `versionId`; the history stays as it is */
export async function restoreSchoolVersion(
  schoolCode: string,
  versionId: string,
  expectedVersionId: string | null
): Promise<{ version_id: string; version_number: number; restored_from: number }> {
  const res = await fetch(`${API_BASE}/api/school/${schoolCode}/versions/${versionId}/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expected_version_id: expectedVersionId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "ย้อนเวอร์ชันไม่สำเร็จ");
  }
  return await res.json();
}

export async function resolveSchoolWebsite(schoolCode: string): Promise<OpecSchoolRecord | null> {
  const res = await fetch(`${API_BASE}/api/school/${schoolCode}/resolve`, {
    method: "POST",
  });
  await throwIfBusy(res);
  if (res.ok) {
    return await res.json();
  }
  return null;
}

export interface SchoolChange {
  changed_at: string;
  /** "school.create", "school.update" (no source given), or "school.<action>" from tag_versions() */
  action: string;
  actor_type: "admin" | "system" | "user";
  school_code: string;
  name_th: string;
  name_en: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

/** One school's changes, or the latest changes across every school without a code (search: name or code) */
export async function getSchoolHistory(schoolCode?: string, search = ""): Promise<SchoolChange[]> {
  const path = schoolCode
    ? `/api/school/${schoolCode}/history`
    : `/api/schools/history${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ""}`;
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "อ่านประวัติการแก้ไขไม่สำเร็จ");
  }
  return (await res.json()).history;
}

export interface SupabaseStatusResponse {
  configured: boolean;
  connected: boolean;
  masked_url?: string;
  latency_ms?: number | null;
  has_schema?: boolean;
  school_count?: number;
  error?: string | null;
}

export async function getSupabaseStatus(): Promise<SupabaseStatusResponse> {
  try {
    const res = await fetch(`${API_BASE}/api/supabase/status?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.debug("[adminApi] getSupabaseStatus failed:", err);
  }
  return {
    configured: false,
    connected: false,
    error: "ไม่สามารถเชื่อมต่อ OPEC Service ได้",
  };
}

export async function initSupabaseSchema(): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/supabase/init-schema`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "ไม่สามารถสร้าง Schema ได้" }));
    throw new Error(err.detail || "สร้าง Schema ไม่สำเร็จ");
  }
  return await res.json();
}

export async function syncOpecToSupabase(options?: {
  fetchFresh?: boolean;
  publishInitial?: boolean;
}): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/api/sync-to-supabase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fetch_fresh: options?.fetchFresh ?? true,
      publish_initial: options?.publishInitial ?? true,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "ไม่สามารถเริ่มนำเข้าข้อมูลได้" }));
    throw new Error(err.detail || "เริ่มนำเข้าข้อมูลไม่สำเร็จ");
  }
  return await res.json();
}

export async function clearSupabaseData(): Promise<{ status: string; deleted_count: number; message: string }> {
  const res = await fetch(`${API_BASE}/api/supabase/clear-data`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "ไม่สามารถล้างข้อมูลใน Supabase ได้" }));
    throw new Error(err.detail || "ล้างข้อมูล Supabase ไม่สำเร็จ");
  }
  return await res.json();
}

export async function getWebsiteRegistry(): Promise<WebsiteRegistryResponse> {
  const res = await fetch(`${API_BASE}/api/websites/registry?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("ไม่สามารถดึงข้อมูลทะเบียนเว็บไซต์ทางการได้");
  }
  return await res.json();
}

export async function verifySchoolWebsite(
  schoolCode: string,
  website: string,
  isVerified: boolean = true,
  expectedVersionId?: string | null
): Promise<{ status: string; website: string; website_source: string; version_id: string }> {
  const res = await fetch(`${API_BASE}/api/websites/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      school_code: schoolCode,
      website,
      is_verified: isVerified,
      expected_version_id: expectedVersionId,
    }),
  });
  await throwIfBusy(res);
  if (!res.ok) {
    throw new Error("ไม่สามารถบันทึกการรับรองเว็บไซต์ได้");
  }
  return await res.json();
}

export async function syncWebsiteRegistryFromText(): Promise<{
  status: string;
  synced_local: number;
  synced_supabase: number;
  total_in_file: number;
}> {
  const res = await fetch(`${API_BASE}/api/websites/sync-registry`, {
    method: "POST",
  });
  await throwIfBusy(res);
  if (!res.ok) {
    throw new Error("ไม่สามารถซิงค์ข้อมูลจาก schoolAndURL.txt ได้");
  }
  return await res.json();
}

export async function triggerWebsiteHealthCheck(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/api/websites/health-check`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error("ไม่สามารถเริ่มตรวจเช็คสุขภาพเว็บไซต์ได้");
  }
  return await res.json();
}

export async function getWebsiteHealthCheckStatus(): Promise<WebsiteHealthState> {
  const res = await fetch(`${API_BASE}/api/websites/health-check/status?t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("ไม่สามารถดึงสถานะการตรวจสุขภาพเว็บไซต์ได้");
  }
  return await res.json();
}

export async function getPendingVersions(): Promise<PendingVersionRecord[]> {
  const res = await fetch(`${API_BASE}/api/supabase/pending-versions?t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("ไม่สามารถดึงรายการเวอร์ชันที่รอตรวจสอบได้");
  }
  return await res.json();
}

/** Parts of a draft an admin can turn down while approving the rest (APPROVAL_PARTS in supabase_sync.py) */
export type ApprovalPart = "fees" | "safety" | "info";

export async function approveVersion(versionId: string, keepLive: ApprovalPart[] = []): Promise<{
  status: string;
  action: string;
  version_id: string;
  school_id: string;
  min_tuition?: number | null;
  max_tuition?: number | null;
  has_safeguarding?: boolean | null;
}> {
  const res = await fetch(`${API_BASE}/api/supabase/versions/${versionId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keep_live: keepLive }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "การอนุมัติล้มเหลว" }));
    throw new Error(err.detail || "ไม่สามารถอนุมัติเวอร์ชันได้");
  }
  return await res.json();
}

export async function rejectVersion(
  versionId: string,
  reason?: string
): Promise<{ status: string; action: string; version_id: string }> {
  const res = await fetch(`${API_BASE}/api/supabase/versions/${versionId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: reason || "ไม่ผ่านเกณฑ์การตรวจสอบของแอดมิน" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "การปฏิเสธล้มเหลว" }));
    throw new Error(err.detail || "ไม่สามารถปฏิเสธเวอร์ชันได้");
  }
  return await res.json();
}

export async function scrapeSchoolTuition(
  schoolId: string,
  schoolName: string,
  website: string
): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/supabase/scrape-school`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      school_id: schoolId,
      school_name: schoolName,
      website: website,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "ไม่สามารถเริ่ม Scrape ได้" }));
    throw new Error(err.detail || "ไม่สามารถเริ่ม Scrape ค่าเทอมได้");
  }
  return await res.json();
}

export async function getScrapeLogs(limit: number = 100, offset: number = 0): Promise<ScrapeLogRecord[]> {
  const res = await fetch(`${API_BASE}/api/supabase/scrape-logs?limit=${limit}&offset=${offset}&t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("ไม่สามารถดึงประวัติ AI & Scraper Logs ได้");
  }
  return await res.json();
}

export async function triggerBatchScrape(maxSchools?: number): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/api/scraper/batch-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max_schools: maxSchools || null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "ไม่สามารถเริ่ม Batch Scrape ได้" }));
    throw new Error(err.detail || "ไม่สามารถเริ่ม Batch Scrape ได้");
  }
  return await res.json();
}

export async function getCurriculumReview(): Promise<CurriculumReviewResponse> {
  const res = await fetch(`${API_BASE}/api/curriculums/review?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "ไม่สามารถดึงรายการหลักสูตรที่ต้องตรวจได้");
  }
  return await res.json();
}

// The backend also stores who confirmed; it will come from the signed-in admin once the admin page has a login
export async function confirmSchoolCurriculums(
  schoolCode: string,
  curriculums: string[],
  expectedVersionId?: string | null
): Promise<{ status: string; curriculums: string[] }> {
  const res = await fetch(`${API_BASE}/api/school/${schoolCode}/curriculums`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ curriculums, expected_version_id: expectedVersionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "บันทึกหลักสูตรไม่สำเร็จ");
  }
  return await res.json();
}

export async function clearSchoolCurriculums(
  schoolCode: string,
  expectedVersionId?: string | null
): Promise<{ status: string; curriculums: string[] }> {
  const query = expectedVersionId ? `?expected_version_id=${encodeURIComponent(expectedVersionId)}` : "";
  const res = await fetch(`${API_BASE}/api/school/${schoolCode}/curriculums${query}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "ยกเลิกการยืนยันไม่สำเร็จ");
  }
  return await res.json();
}

/** Compares the schools with OPEC's current list without importing anything (about 10 seconds) */
export async function checkOpecPresence(): Promise<{
  newly_missing: string[];
  listed_again: string[];
  missing_still_shown: number;
}> {
  const res = await fetch(`${API_BASE}/api/schools/check-opec`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "ตรวจกับรายชื่อ OPEC ไม่สำเร็จ");
  }
  return await res.json();
}

async function postSchoolClosure(schoolCode: string, action: "close" | "reopen") {
  const res = await fetch(`${API_BASE}/api/school/${schoolCode}/${action}`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "บันทึกไม่สำเร็จ");
  }
  return (await res.json()) as { school_code: string; status: "active" | "archived" };
}

export const closeSchool = (schoolCode: string) => postSchoolClosure(schoolCode, "close");
export const reopenSchool = (schoolCode: string) => postSchoolClosure(schoolCode, "reopen");
