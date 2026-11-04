import { useEffect, useState, type ReactNode } from "react";
import { getVersionCompare } from "@/api/adminApi";
import type { VersionCompare as Compare, VersionDetail } from "@/types/admin";

const SAFETY_LABELS: Record<string, string> = {
  security_guards: "รปภ. และระบบรักษาความปลอดภัย",
  cctv_monitoring: "กล้องวงจรปิด",
  nurse_medical_clinic: "ห้องพยาบาล / แพทย์ประจำ",
  child_safeguarding_policy: "นโยบายคุ้มครองเด็ก",
  air_quality_pm25_protocol: "มาตรการฝุ่น PM2.5",
  visitor_access_control: "ระบบคัดกรองผู้มาติดต่อ",
};

const FREQUENCY_LABELS: Record<string, string> = {
  once: "ครั้งเดียว",
  per_year: "ต่อปี",
  per_semester: "ต่อภาค",
  per_term: "ต่อเทอม",
  per_month: "ต่อเดือน",
  conditional: "ตามเงื่อนไข",
};

const SCHOOL_LABELS: Record<string, string> = {
  official_website_url: "เว็บไซต์",
  website_source: "ที่มาของเว็บไซต์",
  latitude: "ละติจูด",
  longitude: "ลองจิจูด",
  gps_precision: "ความแม่นยำของพิกัด",
  gps_source: "ที่มาของพิกัด",
  curriculums: "หลักสูตร",
  curriculums_confirmed_by: "ยืนยันหลักสูตรโดย",
};

const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });

type Fee = VersionDetail["fees"][number];

function feeText(f?: Fee): string {
  if (!f) return "—";
  if (f.annual_thb != null) return baht(f.annual_thb);
  if (f.semester_thb != null) return `${baht(f.semester_thb)} /ภาค`;
  return "—";
}

function extraText(e?: VersionDetail["extra_fees"][number]): string {
  if (!e) return "—";
  const amount = e.amount_thb != null ? `${baht(e.amount_thb)} บาท` : "ไม่ระบุจำนวน";
  const freq = FREQUENCY_LABELS[e.frequency];
  return freq ? `${amount} ${freq}` : amount;
}

// null means the scraper found nothing, not "the school has none" (version_safety comment in schema.sql)
const yesNo = (v: boolean | null | undefined) => (v === true ? "มี" : v === false ? "ไม่มี" : "ไม่ระบุ");

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  return String(v);
}

/** Rows keyed by label; a label listed twice (full day / half day) keeps both, matched in order */
function keyed<T>(rows: T[], label: (r: T) => string): Map<string, T> {
  const seen = new Map<string, number>();
  const out = new Map<string, T>();
  for (const r of rows) {
    const base = label(r).trim().toLowerCase();
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.set(n ? `${base}#${n}` : base, r);
  }
  return out;
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-bold text-warm-charcoal">{title}</h4>
        {note && <span className="text-[11px] text-[#a8a29e]">{note}</span>}
      </div>
      {children}
    </section>
  );
}

const CHANGE_STYLE = {
  same: "",
  changed: "bg-warm-bronze/10",
  added: "bg-[#456ca6]/10",
  removed: "bg-rose-50",
} as const;

const CHANGE_TAG = {
  same: null,
  changed: "เปลี่ยน",
  added: "มีเฉพาะฉบับนี้",
  removed: "ไม่มีในฉบับนี้",
} as const;

type Change = keyof typeof CHANGE_STYLE;

/** What restoring a version would change, next to the version published now */
export function VersionCompare({ schoolCode, versionId }: { schoolCode: string; versionId: string }) {
  const [data, setData] = useState<Compare | null>(null);
  const [error, setError] = useState("");
  const [showSame, setShowSame] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    getVersionCompare(schoolCode, versionId)
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [schoolCode, versionId]);

  if (error) return <p className="text-rose-700">{error}</p>;
  if (!data) return <p className="text-[#78716c]">กำลังโหลด…</p>;

  const { version: old, current } = data;
  const oldName = `ฉบับ ${old.version_number}`;
  const nowName = "ใช้อยู่";
  const nowNumber = current.version_number ? ` แทนฉบับ ${current.version_number} ที่ใช้อยู่` : "";

  // tuition: rows of both, in the old version's page order, then rows only the current one has
  const oldFees = keyed(old.fees, (f) => f.grade_label);
  const nowFees = keyed(current.fees, (f) => f.grade_label);
  const feeRows = [...new Set([...oldFees.keys(), ...nowFees.keys()])].map((k) => {
    const a = nowFees.get(k);
    const b = oldFees.get(k);
    const change: Change = !a ? "added" : !b ? "removed" : feeText(a) !== feeText(b) ? "changed" : "same";
    return { key: k, label: (b ?? a)!.grade_label, now: feeText(a), then: feeText(b), change };
  });

  const oldExtra = keyed(old.extra_fees, (e) => e.name);
  const nowExtra = keyed(current.extra_fees, (e) => e.name);
  const extraRows = [...new Set([...oldExtra.keys(), ...nowExtra.keys()])]
    .map((k) => {
      const a = nowExtra.get(k);
      const b = oldExtra.get(k);
      const change: Change = !a ? "added" : !b ? "removed" : extraText(a) !== extraText(b) ? "changed" : "same";
      return { key: k, label: (b ?? a)!.name, now: extraText(a), then: extraText(b), change };
    });

  const safetyRows = Object.entries(SAFETY_LABELS)
    .map(([k, label]) => {
      const a = yesNo(current.safety?.[k as keyof typeof current.safety] as boolean | null | undefined);
      const b = yesNo(old.safety?.[k as keyof typeof old.safety] as boolean | null | undefined);
      return { key: k, label, now: a, then: b, change: (a === b ? "same" : "changed") as Change };
    });

  const nowFacilities = new Set(current.facilities.map((f) => f.trim().toLowerCase()));
  const oldFacilities = new Set(old.facilities.map((f) => f.trim().toLowerCase()));
  const facilitiesAdded = old.facilities.filter((f) => !nowFacilities.has(f.trim().toLowerCase()));
  const facilitiesRemoved = current.facilities.filter((f) => !oldFacilities.has(f.trim().toLowerCase()));

  // a version from before 4 Nov 2569 keeps the live link, pin and curriculums when restored
  const schoolRows = old.school
    ? Object.entries(SCHOOL_LABELS)
        .map(([k, label]) => ({ key: k, label, now: show(current.school?.[k]), then: show(old.school?.[k]) }))
        .filter((r) => r.now !== r.then)
    : [];

  const changed = (rows: { change: Change }[]) => rows.filter((r) => r.change !== "same").length;
  const counts = {
    fees: changed(feeRows),
    extra: changed(extraRows),
    safety: changed(safetyRows),
    facilities: facilitiesAdded.length + facilitiesRemoved.length,
    school: schoolRows.length,
  };
  const nothing = Object.values(counts).every((n) => n === 0);

  const table = (rows: { key: string; label: string; now: string; then: string; change: Change }[], unit?: string) => {
    const visible = showSame ? rows : rows.filter((r) => r.change !== "same");
    if (!visible.length) return <p className="text-[#a8a29e]">เหมือนกันทุกรายการ</p>;
    return (
      <div className="overflow-x-auto rounded-lg border border-warm-accent/70">
        <table className="w-full text-left">
          <thead className="bg-warm-cream text-[#78716c]">
            <tr>
              <th className="py-1.5 px-2.5 font-semibold">รายการ</th>
              <th className="py-1.5 px-2.5 font-semibold text-right whitespace-nowrap">{nowName}</th>
              <th className="py-1.5 px-2.5 font-semibold text-right whitespace-nowrap">{oldName}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.key} className={`border-t border-warm-accent/60 ${CHANGE_STYLE[r.change]}`}>
                <td className="py-1.5 px-2.5 text-warm-charcoal min-w-[7rem]">
                  {r.label}
                  {CHANGE_TAG[r.change] && (
                    <span className="block text-[10px] font-semibold text-[#78716c]">{CHANGE_TAG[r.change]}</span>
                  )}
                </td>
                <td className="py-1.5 px-2.5 text-right tabular-nums text-[#78716c] whitespace-nowrap">{r.now}</td>
                <td
                  className={`py-1.5 px-2.5 text-right tabular-nums whitespace-nowrap ${
                    r.change === "same" ? "text-[#78716c]" : "font-semibold text-warm-charcoal"
                  }`}
                >
                  {r.then}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {unit && <p className="px-2.5 py-1 text-[11px] text-[#a8a29e] border-t border-warm-accent/60">{unit}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-3 rounded-xl border border-warm-accent bg-warm-cream/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-warm-charcoal">
          {nothing
            ? `${oldName} มีข้อมูลเหมือนฉบับที่ใช้อยู่ ย้อนกลับไปแล้วหน้าเว็บจะไม่เปลี่ยน`
            : `ถ้าย้อนกลับไปใช้${oldName}${nowNumber} หน้าเว็บจะเปลี่ยนตามนี้`}
        </p>
        {!nothing && (
          <label className="inline-flex items-center gap-1.5 text-[#78716c] cursor-pointer select-none">
            <input type="checkbox" checked={showSame} onChange={(e) => setShowSame(e.target.checked)} />
            <span>แสดงรายการที่เหมือนกันด้วย</span>
          </label>
        )}
      </div>

      {!old.has_web_data && current.has_web_data && (
        <p className="text-rose-700">ฉบับนี้ไม่มีข้อมูลจากเว็บ ค่าเทอม ค่าใช้จ่ายแฝง และความปลอดภัยจะหายจากหน้าเว็บ</p>
      )}
      {!old.school && (
        <p className="text-[#78716c]">ฉบับนี้บันทึกก่อนที่ลิงก์ หมุด และหลักสูตรจะเป็นเวอร์ชัน ย้อนแล้วสามส่วนนี้คงค่าปัจจุบัน</p>
      )}

      {(counts.fees > 0 || showSame) && (
        <Section title="ค่าเทอม" note={`ต่าง ${counts.fees} จาก ${feeRows.length} รายการ`}>
          {table(feeRows, "บาทต่อปี ถ้าเว็บโรงเรียนให้แค่ค่าเทอมต่อภาคจะระบุ /ภาค")}
        </Section>
      )}
      {(counts.extra > 0 || showSame) && (
        <Section title="ค่าใช้จ่ายอื่น" note={`ต่าง ${counts.extra} จาก ${extraRows.length} รายการ`}>
          {table(extraRows)}
        </Section>
      )}
      {(counts.safety > 0 || showSame) && (
        <Section title="ความปลอดภัย" note={`ต่าง ${counts.safety} จาก ${safetyRows.length} ข้อ`}>
          {table(safetyRows)}
        </Section>
      )}
      {counts.facilities > 0 && (
        <Section title="สิ่งอำนวยความสะดวก">
          <ul className="space-y-0.5">
            {facilitiesAdded.map((f) => (
              <li key={`+${f}`} className="text-warm-charcoal">
                <span className="text-[10px] font-semibold text-[#456ca6] mr-1.5">มีเฉพาะฉบับนี้</span>
                {f}
              </li>
            ))}
            {facilitiesRemoved.map((f) => (
              <li key={`-${f}`} className="text-[#78716c]">
                <span className="text-[10px] font-semibold text-rose-700 mr-1.5">ไม่มีในฉบับนี้</span>
                <span className="line-through">{f}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {counts.school > 0 && (
        <Section title="ลิงก์ หมุด และหลักสูตร">
          {table(schoolRows.map((r) => ({ ...r, change: "changed" as Change })))}
        </Section>
      )}
    </div>
  );
}
