/**
 * lib/highlights.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * What a school stands out for, explained for parents:
 * - accreditations: raw names from ISAT ("ACS WASC", "ONESQA", ...) → who the body is,
 *   what kind of recognition it is and what that means
 * - signature programme categories from the website scraper
 */

/** Strongest evidence first: a full-school evaluation says more than a membership */
export type AccreditationKind =
  | "accreditation"
  | "quality_assessment"
  | "program_authorization"
  | "quality_mark"
  | "membership"
  | "other";

export const ACCREDITATION_KIND_LABELS: Record<AccreditationKind, { title: string; meaning: string }> = {
  accreditation: {
    title: "รับรองมาตรฐานทั้งโรงเรียน",
    meaning: "องค์กรภายนอกเข้ามาตรวจประเมินทั้งโรงเรียน ทั้งการสอน การบริหาร และการดูแลนักเรียน และต้องประเมินซ้ำเป็นรอบ",
  },
  quality_assessment: {
    title: "ประเมินคุณภาพโดยหน่วยงานรัฐ",
    meaning: "หน่วยงานของรัฐไทยประเมินคุณภาพการศึกษาจากภายนอก",
  },
  program_authorization: {
    title: "ได้รับอนุญาตให้สอนหลักสูตร",
    meaning: "เจ้าของหลักสูตรอนุญาตให้โรงเรียนสอนและจัดสอบหลักสูตรนี้",
  },
  quality_mark: {
    title: "มาตรฐานเฉพาะด้าน",
    meaning: "ผ่านการประเมินในด้านใดด้านหนึ่ง เช่น ปฐมวัย การเรียนรวม หรือระบบบริหาร",
  },
  membership: {
    title: "สมาชิกเครือข่าย",
    meaning: "เป็นสมาชิกสมาคมหรือเครือข่ายโรงเรียน ซึ่งไม่ได้หมายถึงการผ่านการประเมิน",
  },
  other: {
    title: "อื่น ๆ",
    meaning: "ชื่อที่ระบบยังไม่รู้จัก แสดงตามที่แหล่งข้อมูลระบุ",
  },
};

const KIND_ORDER: AccreditationKind[] = [
  "accreditation",
  "quality_assessment",
  "program_authorization",
  "quality_mark",
  "membership",
  "other",
];

interface Body {
  code: string;
  label: string;
  fullName: string;
  kind: AccreditationKind;
  match: RegExp;
}

// Raw ISAT values are free text: short codes, full names, or both in one string
const BODIES: Body[] = [
  { code: "CIS", label: "CIS", fullName: "Council of International Schools", kind: "accreditation", match: /\bCIS\b|council of international schools/i },
  { code: "WASC", label: "ACS WASC", fullName: "Western Association of Schools and Colleges (สหรัฐฯ)", kind: "accreditation", match: /\bWASC\b/i },
  { code: "NEASC", label: "NEASC", fullName: "New England Association of Schools and Colleges (สหรัฐฯ)", kind: "accreditation", match: /\bNEASC\b/i },
  { code: "COGNIA", label: "Cognia", fullName: "Cognia (สหรัฐฯ)", kind: "accreditation", match: /cognia/i },
  { code: "MSA", label: "MSA-CESS", fullName: "Middle States Association (สหรัฐฯ)", kind: "accreditation", match: /\bMSA\b|middle states/i },
  { code: "EDT", label: "EDT", fullName: "Education Development Trust (สหราชอาณาจักร)", kind: "accreditation", match: /\bEDT\b|education development trust/i },
  { code: "COBIS", label: "COBIS", fullName: "Council of British International Schools", kind: "accreditation", match: /\bCOBIS\b/i },
  { code: "AEFE", label: "AEFE", fullName: "Agency for French Education Abroad (ฝรั่งเศส)", kind: "accreditation", match: /\bAEFE\b/i },
  { code: "ACSI", label: "ACSI", fullName: "Association of Christian Schools International", kind: "accreditation", match: /\bACSI\b/i },
  { code: "AAA", label: "AAA", fullName: "Adventist Accrediting Association", kind: "accreditation", match: /adventist accrediting/i },
  { code: "AAIS", label: "AAIS", fullName: "Alberta Accredited International School (แคนาดา)", kind: "accreditation", match: /\bAAIS\b|alberta accredited/i },
  { code: "MEXT", label: "MEXT", fullName: "กระทรวงศึกษาธิการ ญี่ปุ่น (MEXT)", kind: "accreditation", match: /science and technology japan/i },
  { code: "ONESQA", label: "สมศ.", fullName: "สำนักงานรับรองมาตรฐานและประเมินคุณภาพการศึกษา (ONESQA)", kind: "quality_assessment", match: /\bONESQA\b|สมศ/i },
  { code: "IB", label: "IB World School", fullName: "International Baccalaureate", kind: "program_authorization", match: /international baccalaureate|\bIB\b/i },
  { code: "CAMBRIDGE", label: "Cambridge", fullName: "Cambridge International Education", kind: "program_authorization", match: /cambridge/i },
  { code: "NDNA", label: "NDNA", fullName: "National Day Nurseries Association — มาตรฐานปฐมวัย (สหราชอาณาจักร)", kind: "quality_mark", match: /\bNDNA\b/i },
  { code: "IQM", label: "IQM", fullName: "Inclusion Quality Mark — มาตรฐานการเรียนรวม", kind: "quality_mark", match: /\bIQM\b|inclusion quality mark/i },
  { code: "ISQM", label: "ISQM", fullName: "International School Quality Mark", kind: "quality_mark", match: /\bISQM\b/i },
  { code: "ISO", label: "ISO", fullName: "มาตรฐานระบบบริหาร ISO", kind: "quality_mark", match: /\bISO\b/i },
  { code: "FOBISIA", label: "FOBISIA", fullName: "Federation of British International Schools in Asia", kind: "membership", match: /FOBISIA/i },
  { code: "ISAT", label: "ISAT", fullName: "สมาคมโรงเรียนนานาชาติแห่งประเทศไทย", kind: "membership", match: /\bISAT\b/i },
];

// ISAT splits "Ministry of Education, Culture, Sports, Science and Technology JAPAN" on its commas
const MEXT_FRAGMENTS = /^(ministry of education|culture|sports)$/i;

export interface Accreditation {
  code: string;
  label: string;
  fullName: string | null;
  kind: AccreditationKind;
  /** "ONESQA Candidate": applied for, not yet granted */
  candidate: boolean;
}

/** Turns raw accreditation strings into known bodies, strongest kind first, without duplicates */
export function explainAccreditations(raw: string[]): Accreditation[] {
  const hasMext = raw.some((r) => /science and technology japan/i.test(r));
  const found = new Map<string, Accreditation>();

  for (const item of raw) {
    const text = item.trim();
    if (!text || (hasMext && MEXT_FRAGMENTS.test(text))) continue;
    const candidate = /candidate/i.test(text);
    const bodies = BODIES.filter((b) => b.match.test(text));

    if (bodies.length === 0) {
      found.set(text.toUpperCase(), { code: text.toUpperCase(), label: text, fullName: null, kind: "other", candidate });
      continue;
    }
    for (const b of bodies) {
      const prev = found.get(b.code);
      // A full accreditation listed anywhere outranks a candidate entry for the same body
      if (prev && !prev.candidate) continue;
      found.set(b.code, { code: b.code, label: b.label, fullName: b.fullName, kind: b.kind, candidate });
    }
  }

  return [...found.values()].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

export function groupByKind(items: Accreditation[]): [AccreditationKind, Accreditation[]][] {
  return KIND_ORDER.map((kind) => [kind, items.filter((i) => i.kind === kind)] as [AccreditationKind, Accreditation[]]).filter(
    ([, list]) => list.length > 0
  );
}

// ─── Signature programmes (scraper EXTRACT_SCHEMA.signature_programs.category) ──

export type ProgramCategory =
  | "academic"
  | "stem"
  | "arts"
  | "sports"
  | "languages"
  | "leadership_service"
  | "wellbeing_support"
  | "other";

export const PROGRAM_CATEGORY_LABELS: Record<ProgramCategory, string> = {
  academic: "วิชาการ",
  stem: "STEM และเทคโนโลยี",
  arts: "ศิลปะและดนตรี",
  sports: "กีฬา",
  languages: "ภาษา",
  leadership_service: "ผู้นำและจิตอาสา",
  wellbeing_support: "การดูแลและสนับสนุนนักเรียน",
  other: "อื่น ๆ",
};

export function programCategoryLabel(category: string | null | undefined): string {
  return PROGRAM_CATEGORY_LABELS[(category ?? "other") as ProgramCategory] ?? PROGRAM_CATEGORY_LABELS.other;
}
