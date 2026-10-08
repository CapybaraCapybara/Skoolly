import type {
  OpecSchoolRecord,
  ScraperProgressState,
  SupabaseSchoolsResponse,
  SupabaseSchoolsFilterParams,
  WebsiteRegistryResponse,
  WebsiteHealthState,
  PendingVersionRecord,
  ScrapeLogRecord,
} from "@/types/opec";

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

// 409: a pipeline job is running and would save over this edit; `detail` says so
async function throwIfBusy(res: Response): Promise<void> {
  if (res.status !== 409) return;
  const body = await res.json().catch(() => ({}));
  throw new Error(body.detail || "มีงานอื่นกำลังทำงานอยู่");
}

export async function updateSchoolWebsite(schoolCode: string, website: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/school/${schoolCode}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ website, website_source: "Manual Edit" }),
  });
  await throwIfBusy(res);
  return res.ok;
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

export async function enrichSchoolData(schoolCode: string): Promise<{ school: OpecSchoolRecord; changes: string[] } | null> {
  const res = await fetch(`${API_BASE}/api/school/${schoolCode}/enrich`, {
    method: "POST",
  });
  await throwIfBusy(res);
  if (res.ok) {
    return await res.json();
  }
  return null;
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
    console.debug("[opecApi] getSupabaseStatus failed:", err);
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

export async function getSupabaseSchools(params?: SupabaseSchoolsFilterParams): Promise<SupabaseSchoolsResponse> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.province && params.province !== "all") query.set("province", params.province);
  if (params?.curriculum && params.curriculum !== "all") query.set("curriculum", params.curriculum);
  if (params?.level && params.level !== "all") query.set("level", params.level);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));

  const qs = query.toString();
  const url = `${API_BASE}/api/supabase/schools${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "ไม่สามารถดึงข้อมูลจาก Supabase ได้" }));
    throw new Error(err.detail || "เกิดข้อผิดพลาดในการโหลดข้อมูลจาก Supabase");
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
  isVerified: boolean = true
): Promise<{ status: string; website: string; website_source: string }> {
  const res = await fetch(`${API_BASE}/api/websites/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ school_code: schoolCode, website, is_verified: isVerified }),
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

export async function approveVersion(versionId: string): Promise<{
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
