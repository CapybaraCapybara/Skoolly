import { useState, useEffect } from "react";
import type { Post } from "@/types";
import { getPosts } from "@/api/forumApi";
import { PostCard } from "@/components/forum/PostCard";

const CATEGORIES = ["All", "Review", "Question", "Update", "Tips"];

interface ForumPageProps {
  onSchoolClick: (schoolId: number) => void;
}

export function ForumPage({ onSchoolClick }: ForumPageProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [newPostOpen, setNewPostOpen] = useState(false);

  // ── Fetch posts from the API layer on mount ────────────────────────────────
  useEffect(() => {
    getPosts().then(setPosts);
  }, []);

  const filtered =
    activeCategory === "All" ? posts : posts.filter((p) => p.category === activeCategory);

  function likePost(postId: number) {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, liked: !p.liked } : p))
    );
  }

  function likeComment(postId: number, commentId: number) {
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
        style={{ background: "linear-gradient(160deg,#0a1628 0%,#152d55 60%,#0d7d72 100%)" }}
        className="pt-10 pb-14 px-4"
      >
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-xs font-medium text-teal-300 mb-5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
            </svg>
            Parent Community · Talk Forum
          </div>
          <h1 className="font-display text-3xl md:text-4xl text-white mb-3">
            Real talk from <span className="italic text-teal-300">real parents</span>
          </h1>
          <p className="text-slate-300 text-sm max-w-lg mx-auto mb-7">
            Share your school experiences, ask questions, and help other families make confident
            choices. No school PR — just honest parent voices.
          </p>
          <button
            onClick={() => setNewPostOpen(true)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm text-white shadow-lg transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#0f9488,#0d7d72)" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Start a discussion
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-3xl mx-auto px-4 -mt-6 pb-20">
        {/* Stats bar */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-3 mb-5 flex items-center gap-6 flex-wrap">
          {[
            ["1,240", "Parent members"],
            ["340", "Active discussions"],
            ["12K+", "Comments posted"],
            ["48", "Schools discussed"],
          ].map(([n, l]) => (
            <div key={l} className="text-center">
              <div className="font-bold text-navy-900 text-base">{n}</div>
              <div className="text-xs text-slate-500">{l}</div>
            </div>
          ))}
        </div>

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
                  ? { background: "linear-gradient(135deg,#0f9488,#152d55)" }
                  : {}
              }
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Posts */}
        <div className="space-y-4">
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
            <h3 className="font-display text-xl text-navy-900 mb-4">Start a discussion</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Title — e.g. 'Our experience at NIST after 1 year'"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
              <select className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option>Select school (optional)</option>
                {[
                  "Bangkok Patana School",
                  "NIST International School",
                  "Ruamrudee International",
                  "Harrow International",
                  "ISB Bangkok",
                  "Shrewsbury International",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <select className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option>Category</option>
                <option>Review</option>
                <option>Question</option>
                <option>Update</option>
                <option>Tips</option>
              </select>
              <textarea
                rows={4}
                placeholder="Share your thoughts, experience, or question…"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setNewPostOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setNewPostOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#0f9488,#152d55)" }}
              >
                Post discussion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
