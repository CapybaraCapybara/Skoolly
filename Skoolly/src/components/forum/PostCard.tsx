/**
 * components/forum/PostCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable forum post card. Renders post content, actions, and comments.
 */

import { useState } from "react";
import type { Post } from "@/types";
import { AvatarCircle } from "./AvatarCircle";
import { CommentItem } from "./CommentItem";

const CATEGORY_COLORS: Record<string, string> = {
  Review: "bg-teal-50 text-teal-700 border-teal-200",
  Question: "bg-blue-50 text-blue-700 border-blue-200",
  Update: "bg-amber-50 text-amber-700 border-amber-200",
  Tips: "bg-purple-50 text-purple-700 border-purple-200",
};

interface PostCardProps {
  post: Post;
  onLikePost: (id: number) => void;
  onLikeComment: (postId: number, commentId: number) => void;
  onSchoolClick: (schoolId: number) => void;
}

export function PostCard({ post, onLikePost, onLikeComment, onSchoolClick }: PostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [showCommentBox, setShowCommentBox] = useState(false);

  return (
    <article className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {post.image && (
        <div className="h-40 bg-slate-100 overflow-hidden">
          <img
            src={`https://images.unsplash.com/${post.image}?w=800&h=320&fit=crop&auto=format`}
            alt=""
            className="w-full h-full object-cover opacity-80"
            loading="lazy"
          />
        </div>
      )}

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <AvatarCircle initials={post.avatar} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-navy-900">{post.author}</span>
              <span className="text-xs text-slate-400">{post.role}</span>
              <span className="text-xs text-slate-300">·</span>
              <span className="text-xs text-slate-400">{post.time}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <button
                onClick={() => onSchoolClick(post.schoolId)}
                className="text-xs font-medium text-teal-600 hover:text-teal-800 hover:underline transition-colors"
              >
                🏫 {post.schoolTag}
              </button>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[post.category]}`}
              >
                {post.category}
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <h3 className="font-semibold text-navy-900 text-base mb-2">{post.title}</h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          {expanded || post.content.length < 220
            ? post.content
            : post.content.slice(0, 220) + "…"}
        </p>
        {post.content.length >= 220 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-teal-600 hover:text-teal-800 mt-1 font-medium"
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100">
          <button
            onClick={() => onLikePost(post.id)}
            className={`flex items-center gap-1.5 text-sm transition-colors ${
              post.liked ? "text-rose-500" : "text-slate-400 hover:text-rose-400"
            }`}
          >
            <svg
              className="w-4 h-4"
              fill={post.liked ? "currentColor" : "none"}
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
            <span className="font-medium">{post.likes + (post.liked ? 1 : 0)}</span>
          </button>

          <button
            onClick={() => setShowCommentBox((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-teal-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <span className="font-medium">{post.comments.length} comments</span>
          </button>

          <button
            onClick={() => onSchoolClick(post.schoolId)}
            className="ml-auto flex items-center gap-1.5 text-xs text-slate-400 hover:text-teal-600 transition-colors font-medium"
          >
            View school →
          </button>
        </div>

        {/* Comments */}
        {(showCommentBox || post.comments.length > 0) && (
          <div className="mt-4 space-y-3">
            {post.comments.slice(0, expanded ? undefined : 2).map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                onLike={() => onLikeComment(post.id, c.id)}
              />
            ))}
            {!expanded && post.comments.length > 2 && (
              <button
                onClick={() => setExpanded(true)}
                className="text-xs text-slate-500 hover:text-teal-600 ml-10 transition-colors"
              >
                + {post.comments.length - 2} more comments
              </button>
            )}

            {/* New comment input */}
            <div className="flex gap-2 mt-2">
              <AvatarCircle initials="ME" size="sm" />
              <div className="flex-1 flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Share your thoughts…"
                  className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400 transition"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newComment.trim()) setNewComment("");
                  }}
                />
                {newComment.trim() && (
                  <button
                    onClick={() => setNewComment("")}
                    className="px-3 py-2 rounded-xl text-xs font-semibold text-white transition-all"
                    style={{ background: "linear-gradient(135deg,#0f9488,#152d55)" }}
                  >
                    Post
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
