import type { OpecSchoolRecord, ScraperProgressState } from "@/types/opec";

const API_BASE = ""; // Relative path to support Vite proxy and server middlewares

export async function getOpecSchools(): Promise<OpecSchoolRecord[]> {
  try {
    const res = await fetch(`${API_BASE}/api/schools?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (err) {
    console.debug("[opecApi] /api/schools failed, trying fallback:", err);
  }

  // Fallback to static JSON if backend microservice isn't currently up
  try {
    const fallbackRes = await fetch("/data/international_schools_thailand_opec.json");
    if (fallbackRes.ok) {
      const data = await fallbackRes.json();
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (err) {
    console.error("[opecApi] Fallback load error:", err);
  }

  return [];
}

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

export async function postAction(endpoint: string): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.status || "Action failed");
  }
  return await res.json();
}

export async function updateSchoolWebsite(schoolCode: string, website: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/school/${schoolCode}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ website, website_source: "Manual Edit" }),
  });
  return res.ok;
}

export async function resolveSchoolWebsite(schoolCode: string): Promise<OpecSchoolRecord | null> {
  const res = await fetch(`${API_BASE}/api/school/${schoolCode}/resolve`, {
    method: "POST",
  });
  if (res.ok) {
    return await res.json();
  }
  return null;
}

export async function enrichSchoolData(schoolCode: string): Promise<{ school: OpecSchoolRecord; changes: string[] } | null> {
  const res = await fetch(`${API_BASE}/api/school/${schoolCode}/enrich`, {
    method: "POST",
  });
  if (res.ok) {
    return await res.json();
  }
  return null;
}

/**
 * Intelligent Curriculum Normalizer:
 * Maps 268+ fragmented/duplicate raw OPEC strings into standardized, recognized international curriculum systems.
 */
export function normalizeCurriculum(raw?: string): string {
  if (!raw || !raw.trim()) return "หลักสูตรสากลทั่วไป (General International)";
  const r = raw.trim();
  const rl = r.toLowerCase();

  // 1. Thai Language, Culture & History (OPEC Mandatory Subject Requirement)
  if (
    rl.includes("วัฒนธรรมไทย") ||
    rl.includes("ภาษาไทย") ||
    rl.includes("ประวัติศาสตร์ไทย") ||
    rl.includes("วิชาภาษาและวัฒนธรรมไทย")
  ) {
    return "ภาษาและวัฒนธรรมไทย (สช. บังคับ)";
  }

  // 2. International Baccalaureate (IB)
  if (
    rl.includes("international baccalaureate") ||
    rl.includes(" ib ") ||
    rl.includes("ibdp") ||
    rl.includes("pyp") ||
    rl.includes("myp") ||
    rl.includes("ib-cp") ||
    rl.includes("ไอบี") ||
    rl.includes("(ib)") ||
    rl.includes("diploma programme (dp)") ||
    rl.includes("diploma programme") ||
    rl.includes("primary year") ||
    rl.includes("middle year") ||
    rl.includes("career-related") ||
    rl.startsWith("ib") ||
    rl.endsWith(" ib")
  ) {
    if (rl.includes("pyp") || rl.includes("primary year")) return "International Baccalaureate (IB - PYP)";
    if (rl.includes("myp") || rl.includes("middle year")) return "International Baccalaureate (IB - MYP)";
    if (rl.includes("ibdp") || rl.includes("diploma programme") || rl.includes("diploma program") || rl.includes("(dp)"))
      return "International Baccalaureate (IB - DP)";
    if (rl.includes("ib-cp") || rl.includes("career-related")) return "International Baccalaureate (IB - CP)";
    return "International Baccalaureate (IB รวมทุกระดับ)";
  }

  // 3. British / UK Curriculum & Cambridge / IGCSE / EYFS / Wales
  if (
    rl.includes("british") ||
    rl.includes("england") ||
    rl.includes("uk national") ||
    rl.includes("united kingdom") ||
    rl.includes("สหราชอาณาจักร") ||
    rl.includes("อังกฤษ") ||
    rl.includes("เวลส์") ||
    rl.includes("wales") ||
    rl.includes("cambridge") ||
    rl.includes("เคมบริดจ์") ||
    rl.includes("แคมบริดจ์") ||
    rl.includes("แคมบริจด์") ||
    rl.includes("igcse") ||
    rl.includes("gcse") ||
    rl.includes("a level") ||
    rl.includes("a-level") ||
    rl.includes("as level") ||
    rl.includes("as & a level") ||
    rl.includes("a & as level") ||
    rl.includes("eyfs") ||
    rl.includes("early years foundation") ||
    rl.includes("early year foundation") ||
    rl.includes("edexcel") ||
    rl.includes("key stage") ||
    rl.includes("oxford international") ||
    rl.includes("btec") ||
    rl.includes("wellington college") ||
    rl.includes("enc (english")
  ) {
    if (
      rl.includes("cambridge") ||
      rl.includes("เคมบริดจ์") ||
      rl.includes("แคมบริดจ์") ||
      rl.includes("แคมบริจด์") ||
      rl.includes("igcse") ||
      rl.includes("gcse") ||
      rl.includes("a level") ||
      rl.includes("a-level") ||
      rl.includes("edexcel") ||
      rl.includes("btec") ||
      rl.includes("oxford")
    ) {
      return "หลักสูตรเคมบริดจ์ / สหราชอาณาจักร (Cambridge & UK Exams)";
    }
    if (rl.includes("eyfs") || rl.includes("early years foundation") || rl.includes("early year foundation")) {
      return "หลักสูตรปฐมวัยอังกฤษ (British EYFS)";
    }
    return "หลักสูตรสหราชอาณาจักร (British / UK National Curriculum)";
  }

  // 4. American / US Curriculum & AP / Common Core
  if (
    rl.includes("american") ||
    rl.includes("us national") ||
    rl.includes("united states") ||
    rl.includes("สหรัฐอเมริกา") ||
    rl.includes("สหรัฐอเมริกัน") ||
    rl.includes("อเมริกัน") ||
    rl.includes("อเมริกา") ||
    rl.includes("common core") ||
    rl.includes("california") ||
    rl.includes("แคลิฟอร์เนีย") ||
    rl.includes("massachusetts") ||
    rl.includes("แมสซาชูเซตส์") ||
    rl.includes("aero") ||
    rl.includes("ngss") ||
    rl.includes("advanced placement") ||
    rl.includes("high school diploma") ||
    rl.includes("เวอร์จีเนีย") ||
    rl.includes("มิสซิสซิป") ||
    rl.includes("ยูทาห์") ||
    rl.includes("utah") ||
    rl.includes("adventist") ||
    rl.includes("แอ๊ดเวนตีส") ||
    rl.includes(" ap ") ||
    rl.includes("ap statistics") ||
    rl.includes("หลักสูตร ap") ||
    rl.includes("pennsylvania") ||
    rl.includes("new jersey") ||
    rl.includes("district of columbia") ||
    rl.includes("chicago") ||
    rl.includes("calvert") ||
    rl.includes("a.c.e.") ||
    rl.includes("accelerated christian") ||
    rl.includes("basis education") ||
    rl.includes("school of tomorrow") ||
    rl.includes("the us. elementary") ||
    rl.includes("wasc") ||
    rl.includes("nad")
  ) {
    if (rl.includes("advanced placement") || rl.includes(" ap ") || rl.includes("หลักสูตร ap") || rl.includes("ap statistics")) {
      return "หลักสูตรอเมริกัน / AP (American & Advanced Placement)";
    }
    return "หลักสูตรสหรัฐอเมริกา (American / US Common Core)";
  }

  // 5. Singapore
  if (rl.includes("singapore") || rl.includes("สิงคโปร์") || rl.includes("สิงค์โปร์") || rl.includes("nurturing early learners")) {
    return "หลักสูตรสิงคโปร์ (Singapore Curriculum)";
  }

  // 6. Australian
  if (rl.includes("australia") || rl.includes("ออสเตรเลีย") || rl.includes("acara") || rl.includes("vce") || rl.includes("sace") || rl.includes("western australian")) {
    return "หลักสูตรออสเตรเลีย (Australian Curriculum)";
  }

  // 7. Canadian
  if (rl.includes("canada") || rl.includes("canadian") || rl.includes("แคนาดา") || rl.includes("แคนนาดา") || rl.includes("บริติชโคลัมเบีย") || rl.includes("ontario") || rl.includes("alberta")) {
    return "หลักสูตรแคนาดา (Canadian Curriculum)";
  }

  // 8. French
  if (rl.includes("french") || rl.includes("france") || rl.includes("ฝรั่งเศส") || rl.includes("cned")) {
    return "หลักสูตรฝรั่งเศส (French National Curriculum)";
  }

  // 9. German
  if (rl.includes("german") || rl.includes("germany") || rl.includes("เยอรมัน") || rl.includes("เยอรมนี") || rl.includes("abitur")) {
    return "หลักสูตรเยอรมนี (German Curriculum / Abitur)";
  }

  // 10. Japanese
  if (rl.includes("japanese") || rl.includes("japan") || rl.includes("ญี่ปุ่น") || rl.includes("mext")) {
    return "หลักสูตรญี่ปุ่น (Japanese Curriculum / MEXT)";
  }

  // 11. Chinese
  if (rl.includes("chinese") || rl.includes("china") || rl.includes("จีน") || rl.includes("ไต้หวัน") || rl.includes("taiwan")) {
    return "หลักสูตรภาษาและวัฒนธรรมจีน (Chinese Curriculum)";
  }

  // 12. Christian / Montessori / Waldorf / Reggio Emilia / Alternative
  if (rl.includes("montessori") || rl.includes("มอนเตสซอรี่") || rl.includes("มอนเตสซอรี")) {
    return "หลักสูตรมอนเตสซอรี่ (Montessori Education)";
  }
  if (rl.includes("waldorf") || rl.includes("วอลดอร์ฟ") || rl.includes("steiner")) {
    return "หลักสูตรวอลดอร์ฟ (Waldorf / Steiner)";
  }
  if (rl.includes("reggio emilia") || rl.includes("เรจจิโอ")) {
    return "หลักสูตรเรจจิโอ เอมิเลีย (Reggio Emilia Approach)";
  }
  if (rl.includes("christian") || rl.includes("คริสเตียน") || rl.includes("bible")) {
    return "หลักสูตรคริสเตียนสากล (International Christian Curriculum)";
  }

  return r;
}
