import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  X,
  Globe,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Search,
  RefreshCw,
  Download,
  Upload,
  Check,
  Edit2,
  ShieldCheck,
  Loader2,
  Layers,
  Sparkles,
  ArrowUpDown,
} from "lucide-react";
import type { WebsiteRegistryItem, WebsiteRegistryResponse } from "@/types/opec";
import {
  getWebsiteRegistry,
  verifySchoolWebsite,
  syncWebsiteRegistryFromText,
} from "@/api/opecApi";

interface OpecUrlVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
}

type FilterTab = "all" | "verified" | "opec" | "probed" | "missing";

export function OpecUrlVerificationModal({
  isOpen,
  onClose,
  onDataChanged,
}: OpecUrlVerificationModalProps) {
  const [data, setData] = useState<WebsiteRegistryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [actionLoadingCode, setActionLoadingCode] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editUrlValue, setEditUrlValue] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMessage({ text, type });
    window.setTimeout(() => setMessage(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getWebsiteRegistry();
      setData(res);
    } catch (err: any) {
      showMsg(err.message || "ไม่สามารถโหลดข้อมูลทะเบียนได้", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  // Handle single URL verify
  const handleVerify = async (item: WebsiteRegistryItem) => {
    if (!item.website) {
      showMsg("ไม่สามารถรับรองได้เนื่องจากยังไม่มี URL เว็บไซต์", "error");
      return;
    }
    setActionLoadingCode(item.school_code);
    try {
      await verifySchoolWebsite(item.school_code, item.website, true);
      showMsg(`รับรองเว็บไซต์ทางการสำหรับ "${item.school_name_th}" สำเร็จ`);
      await loadData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      showMsg(err.message || "เกิดข้อผิดพลาดในการรับรอง", "error");
    } finally {
      setActionLoadingCode(null);
    }
  };

  // Handle single URL edit submit
  const handleSaveEdit = async (schoolCode: string) => {
    setActionLoadingCode(schoolCode);
    try {
      await verifySchoolWebsite(schoolCode, editUrlValue.trim(), true);
      showMsg(`บันทึกและรับรอง URL โรงเรียน [${schoolCode}] สำเร็จ`);
      setEditingCode(null);
      setEditUrlValue("");
      await loadData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      showMsg(err.message || "เกิดข้อผิดพลาดในการบันทึก", "error");
    } finally {
      setActionLoadingCode(null);
    }
  };

  // Handle bulk sync from schoolAndURL.txt
  const handleBulkSync = async () => {
    if (!window.confirm("ต้องการซิงค์รายชื่อเว็บไซต์ทั้งหมด 284 โรงเรียนจาก reference/schoolAndURL.txt เข้าสู่ระบบและ Supabase ใช่หรือไม่?")) {
      return;
    }
    setIsSyncingAll(true);
    try {
      const res = await syncWebsiteRegistryFromText();
      showMsg(`ซิงค์ข้อมูลจาก schoolAndURL.txt สำเร็จ! (Local: +${res.synced_local}, Supabase: +${res.synced_supabase} แห่ง)`);
      await loadData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      showMsg(err.message || "เกิดข้อผิดพลาดในการซิงค์ข้อมูล", "error");
    } finally {
      setIsSyncingAll(false);
    }
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    let list = data.items;

    if (activeTab === "verified") {
      list = list.filter((i) => i.status === "verified");
    } else if (activeTab === "opec") {
      list = list.filter((i) => i.status === "opec");
    } else if (activeTab === "probed") {
      list = list.filter((i) => i.status === "probed");
    } else if (activeTab === "missing") {
      list = list.filter((i) => i.status === "missing");
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (i) =>
          i.school_code.includes(q) ||
          i.school_name_th.toLowerCase().includes(q) ||
          (i.school_name_en && i.school_name_en.toLowerCase().includes(q)) ||
          (i.province && i.province.toLowerCase().includes(q)) ||
          i.website.toLowerCase().includes(q)
      );
    }

    return list;
  }, [data, activeTab, search]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#faf8f5] border border-[#eae0d0] rounded-3xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scaleIn">
        {/* Header */}
        <div className="p-5 sm:px-8 border-b border-[#eae0d0] bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[#0f9488]/15 text-[#0f9488] flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-[#1c1917]">
                  ศูนย์ตรวจสอบและรับรองเว็บไซต์ทางการ (Official URL Verification)
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 font-bold border border-teal-200">
                  Audited Registry
                </span>
              </div>
              <p className="text-xs text-[#78716c] mt-0.5">
                ควบคุมและรับรองความถูกต้องของ URL โรงเรียนนานาชาติ ซิงค์ตรงกับ Supabase และ reference/schoolAndURL.txt
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBulkSync}
              disabled={isSyncingAll}
              className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              title="ซิงค์ข้อมูล URL 284 แห่งจาก schoolAndURL.txt เข้าสู่ Supabase"
            >
              {isSyncingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span className="hidden sm:inline">📥 ซิงค์จาก schoolAndURL.txt</span>
            </button>

            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded-xl bg-[#faf5ee] border border-[#eae0d0] hover:bg-[#eae0d0]/50 text-[#1c1917] transition-all"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw className={`w-4 h-4 text-[#78716c] ${loading ? "animate-spin" : ""}`} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-[#eae0d0]/50 text-[#78716c] hover:text-[#1c1917] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`px-6 py-2.5 text-xs font-bold flex items-center gap-2 transition-all ${
              message.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-b border-emerald-200"
                : "bg-rose-50 text-rose-800 border-b border-rose-200"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* KPI Cards Row */}
        <div className="p-4 sm:px-8 bg-[#faf5ee]/70 border-b border-[#eae0d0] shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 bg-white rounded-2xl border border-[#eae0d0] shadow-xs">
              <div className="text-[11px] text-[#78716c] font-medium flex items-center justify-between">
                <span>มีเว็บไซต์ทั้งหมด</span>
                <Globe className="w-3.5 h-3.5 text-[#25508a]" />
              </div>
              <div className="text-xl font-black text-[#1c1917] mt-1">
                {data ? `${data.with_website} / ${data.total}` : "—"}
              </div>
              <div className="text-[10px] text-emerald-600 font-bold mt-0.5">
                {data ? `${Math.round((data.with_website / data.total) * 100)}% ครอบคลุม` : ""}
              </div>
            </div>

            <div className="p-3 bg-white rounded-2xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
              <div className="text-[11px] text-emerald-800 font-medium flex items-center justify-between">
                <span>รับรองทางการแล้ว</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="text-xl font-black text-emerald-700 mt-1">
                {data?.verified_count ?? 0}
              </div>
              <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                Verified Official
              </div>
            </div>

            <div className="p-3 bg-white rounded-2xl border border-amber-200 bg-amber-50/20 shadow-xs">
              <div className="text-[11px] text-amber-800 font-medium flex items-center justify-between">
                <span>จากระบบ สช. (OPEC)</span>
                <Layers className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <div className="text-xl font-black text-amber-700 mt-1">
                {data?.opec_count ?? 0}
              </div>
              <div className="text-[10px] text-amber-600 font-semibold mt-0.5">
                OPEC Profile
              </div>
            </div>

            <div className="p-3 bg-white rounded-2xl border border-blue-200 bg-blue-50/20 shadow-xs">
              <div className="text-[11px] text-blue-800 font-medium flex items-center justify-between">
                <span>บอทตรวจพบใหม่</span>
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="text-xl font-black text-blue-700 mt-1">
                {data?.probed_count ?? 0}
              </div>
              <div className="text-[10px] text-blue-600 font-semibold mt-0.5">
                AI Probed Live
              </div>
            </div>

            <div className="p-3 bg-white rounded-2xl border border-rose-200 bg-rose-50/20 shadow-xs">
              <div className="text-[11px] text-rose-800 font-medium flex items-center justify-between">
                <span>ยังไม่มีเว็บไซต์</span>
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
              </div>
              <div className="text-xl font-black text-rose-700 mt-1">
                {data?.missing_count ?? 0}
              </div>
              <div className="text-[10px] text-rose-600 font-semibold mt-0.5">
                รอการค้นพบ
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar & Filter Tabs */}
        <div className="p-4 sm:px-8 bg-white border-b border-[#eae0d0] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 bg-[#faf5ee] p-1 rounded-2xl border border-[#eae0d0] overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === "all"
                  ? "bg-white text-[#1c1917] shadow-xs border border-[#eae0d0]"
                  : "text-[#78716c] hover:text-[#1c1917]"
              }`}
            >
              ทั้งหมด ({data?.total ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("verified")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === "verified"
                  ? "bg-emerald-50 text-emerald-800 shadow-xs border border-emerald-200"
                  : "text-[#78716c] hover:text-emerald-700"
              }`}
            >
              🟢 รับรองแล้ว ({data?.verified_count ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("opec")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === "opec"
                  ? "bg-amber-50 text-amber-800 shadow-xs border border-amber-200"
                  : "text-[#78716c] hover:text-amber-700"
              }`}
            >
              🟡 จาก สช. ({data?.opec_count ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("probed")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === "probed"
                  ? "bg-blue-50 text-blue-800 shadow-xs border border-blue-200"
                  : "text-[#78716c] hover:text-blue-700"
              }`}
            >
              🔵 บอทตรวจพบ ({data?.probed_count ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("missing")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === "missing"
                  ? "bg-rose-50 text-rose-800 shadow-xs border border-rose-200"
                  : "text-[#78716c] hover:text-rose-700"
              }`}
            >
              ⚪ ไม่มีเว็บ ({data?.missing_count ?? 0})
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[#a8a29e] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อโรงเรียน, รหัส, หรือ URL..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#faf5ee] border border-[#eae0d0] text-xs text-[#1c1917] focus:outline-none focus:ring-2 focus:ring-[#0f9488]/40 placeholder:text-[#a8a29e]"
            />
          </div>
        </div>

        {/* Auditable Checklist Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:px-8">
          <div className="bg-white border border-[#eae0d0] rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#faf5ee] border-b border-[#eae0d0] text-[#78716c] font-bold">
                  <th className="py-3 px-3.5 w-24">รหัส OPEC</th>
                  <th className="py-3 px-3.5 min-w-[220px]">โรงเรียนนานาชาติ</th>
                  <th className="py-3 px-3.5 w-28">จังหวัด</th>
                  <th className="py-3 px-3.5 min-w-[240px]">Official Website URL</th>
                  <th className="py-3 px-3.5 w-36">สถานะการรับรอง</th>
                  <th className="py-3 px-3.5 w-44 text-center">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eae0d0]/60">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-[#78716c]">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#0f9488] mb-2" />
                      กำลังโหลดข้อมูลทะเบียนเว็บไซต์...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#78716c]">
                      ไม่พบข้อมูลโรงเรียนตามเงื่อนไขที่ค้นหา
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const isEditing = editingCode === item.school_code;
                    const isActing = actionLoadingCode === item.school_code;

                    return (
                      <tr
                        key={item.school_code}
                        className="hover:bg-[#faf5ee]/50 transition-colors"
                      >
                        <td className="py-3 px-3.5 font-mono font-bold text-[#78593a]">
                          {item.school_code}
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="font-bold text-[#1c1917]">
                            {item.school_name_th}
                          </div>
                          <div className="text-[11px] text-[#78716c] truncate max-w-sm">
                            {item.school_name_en || "—"}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-[#78716c]">
                          {item.province || "—"}
                        </td>
                        <td className="py-3 px-3.5">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editUrlValue}
                                onChange={(e) => setEditUrlValue(e.target.value)}
                                placeholder="https://www.example.ac.th"
                                className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-[#0f9488] bg-white focus:outline-none"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(item.school_code)}
                                disabled={isActing}
                                className="px-2.5 py-1 rounded-lg bg-[#0f9488] text-white font-bold hover:bg-[#0d7d72] transition-colors"
                              >
                                {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : "บันทึก"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCode(null)}
                                className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                              >
                                ยกเลิก
                              </button>
                            </div>
                          ) : item.website ? (
                            <div className="flex items-center gap-2">
                              <a
                                href={
                                  item.website.startsWith("http")
                                    ? item.website
                                    : `https://${item.website}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#25508a] font-semibold hover:underline inline-flex items-center gap-1 max-w-[260px] truncate"
                              >
                                <Globe className="w-3 h-3 shrink-0" />
                                <span className="truncate">{item.website}</span>
                              </a>
                            </div>
                          ) : (
                            <span className="text-[#a8a29e] italic text-[11px]">
                              ยังไม่มีเว็บไซต์
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5">
                          {item.status === "verified" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Verified Official
                            </span>
                          ) : item.status === "opec" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              OPEC Profile
                            </span>
                          ) : item.status === "probed" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                              <Sparkles className="w-3 h-3 text-blue-600" />
                              AI Probed Live
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
                              Missing
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {item.website && (
                              <a
                                href={
                                  item.website.startsWith("http")
                                    ? item.website
                                    : `https://${item.website}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg bg-[#faf5ee] border border-[#eae0d0] hover:bg-[#eae0d0]/50 text-[#25508a] transition-all"
                                title="เปิดทดสอบเว็บไซต์ในแท็บใหม่"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}

                            {!item.is_verified && item.website && (
                              <button
                                type="button"
                                onClick={() => handleVerify(item)}
                                disabled={isActing}
                                className="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 font-bold text-[10px] flex items-center gap-1 transition-all"
                                title="กดยืนยันว่าเป็นเว็บไซต์ทางการที่ถูกต้อง (Verified Official)"
                              >
                                {isActing ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )}
                                <span>รับรอง ✓</span>
                              </button>
                            )}

                            {!isEditing && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCode(item.school_code);
                                  setEditUrlValue(item.website || "");
                                }}
                                className="p-1.5 rounded-lg bg-[#faf5ee] border border-[#eae0d0] hover:bg-[#eae0d0]/50 text-[#78716c] hover:text-[#1c1917] transition-all"
                                title="แก้ไข URL ทางการ"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:px-8 bg-[#faf5ee]/70 border-t border-[#eae0d0] flex items-center justify-between text-xs text-[#78716c] shrink-0">
          <div>
            แสดง {filteredItems.length} จาก {data?.total ?? 0} โรงเรียน
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white border border-[#eae0d0] hover:bg-gray-50 text-[#1c1917] font-bold transition-all shadow-xs"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
