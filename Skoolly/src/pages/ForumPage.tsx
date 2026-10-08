import { useState, useEffect } from "react";
import type { Post, School } from "@/types";
import { getForum, type ForumStats } from "@/api/forumApi";
import { getSchools } from "@/api/schoolsApi";
import { PostCard } from "@/components/forum/PostCard";
import { forumCategoryLabel, schoolNames } from "@/lib/labels";

const CATEGORIES = ["All", "Review", "Question", "Update", "Tips"];

interface ForumPageProps {
  onSchoolClick: (schoolId: number) => void;
}

export function ForumPage({ onSchoolClick }: ForumPageProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState<ForumStats | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [schools, setSchools] = useState<School[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [newPostOpen, setNewPostOpen] = useState(false);

  // ── Fetch posts from the API layer on mount ────────────────────────────────
  useEffect(() => {
    getForum()
      .then((data) => {
        setPosts(data.posts);
        setStats(data.stats);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
    getSchools().then(setSchools).catch(() => setSchools([]));
  }, []);

  const filtered =
    activeCategory === "All" ? posts : posts.filter((p) => p.category === activeCategory);

  function likePost(postId: string) {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, liked: !p.liked } : p))
    );
  }

  function likeComment(postId: string, commentId: string) {
    setPosts((prev) =>
      prev.map((p) =>
        p.id !== postId
          ? p
          : {
              ...p,
              comments: p.comments.map((c) =>
                c.id === commentId ? { ...c, liked: !c.liked } : c
              ),
            }
      )
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Forum header */}
      <div
        style={{ background: "linear-gradient(160deg,#0c1a33 0%,#233a5e 60%,#36578b 100%)" }}
        className="pt-10 pb-14 px-4"
      >
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">ชุมชนผู้ปกครอง</h1>
          <p className="text-slate-300 text-sm max-w-lg mx-auto mb-7">
            คำถามและประสบการณ์เรื่องโรงเรียนจากผู้ปกครองคนอื่น
          </p>
          <button
            onClick={() => setNewPostOpen(true)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm text-white shadow-lg transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#456ca6,#36578b)" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            ตั้งกระทู้
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-3xl mx-auto px-4 -mt-6 pb-20">
        {/* Stats bar — counts come from the database */}
        {stats && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-3 mb-5 flex items-center gap-6 flex-wrap">
            {[
              [stats.members, "สมาชิก"],
              [stats.posts, "กระทู้"],
              [stats.comments, "ความคิดเห็น"],
              [stats.schools, "โรงเรียน"],
            ].map(([n, l]) => (
              <div key={l} className="text-center">
                <div className="font-bold text-navy-900 text-base">{n.toLocaleString("en-US")}</div>
                <div className="text-xs text-slate-500">{l}</div>
              </div>
            ))}
          </div>
        )}

        {/* Category filter */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-all ${
                activeCategory === cat
                  ? "text-white border-transparent"
                  : "bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700"
              }`}
              style={
                activeCategory === cat
                  ? { background: "linear-gradient(135deg,#456ca6,#233a5e)" }
                  : {}
              }
            >
              {forumCategoryLabel(cat)}
            </button>
          ))}
        </div>

        {/* Posts */}
        <div className="space-y-4">
          {loadState === "loading" && (
            <div className="py-16 text-center text-sm text-slate-400">กำลังโหลดกระทู้…</div>
          )}
          {loadState === "error" && (
            <div className="py-16 text-center text-sm text-slate-500">โหลดกระทู้ไม่สำเร็จ ลองใหม่อีกครั้งภายหลัง</div>
          )}
          {loadState === "ready" && filtered.length === 0 && (
            <div className="py-16 text-center">
              <p className="font-semibold text-navy-900">{activeCategory !== "All" ? "ยังไม่มีกระทู้ในหมวดนี้" : "ยังไม่มีกระทู้"}</p>
            </div>
          )}
          {filtered.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onLikePost={likePost}
              onLikeComment={likeComment}
              onSchoolClick={onSchoolClick}
            />
          ))}
        </div>
      </div>

      {/* New post modal */}
      {newPostOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(10,22,40,0.7)" }}
          onClick={() => setNewPostOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-navy-900 mb-4">ตั้งกระทู้</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="หัวข้อ"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
              <select className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option>เลือกโรงเรียน (ไม่บังคับ)</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{schoolNames(s).primary}</option>
                ))}
              </select>
              <select className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option>หมวด</option>
                {CATEGORIES.filter((c) => c !== "All").map((c) => (
                  <option key={c} value={c}>{forumCategoryLabel(c)}</option>
                ))}
              </select>
              <textarea
                rows={4}
                placeholder="เขียนข้อความ"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setNewPostOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => setNewPostOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#456ca6,#233a5e)" }}
              >
                โพสต์
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
