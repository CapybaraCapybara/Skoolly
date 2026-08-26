/**
 * components/forum/CommentItem.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable single comment row used inside PostCard.
 */

import type { Comment } from "@/types";
import { AvatarCircle } from "./AvatarCircle";

interface CommentItemProps {
  comment: Comment;
  onLike: () => void;
}

export function CommentItem({ comment, onLike }: CommentItemProps) {
  return (
    <div className="flex gap-3">
      <AvatarCircle initials={comment.avatar} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="bg-slate-50 rounded-xl px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-navy-900">{comment.author}</span>
            <span className="text-xs text-slate-400">{comment.time}</span>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">{comment.content}</p>
        </div>
        <button
          onClick={onLike}
          className={`mt-1 ml-1 flex items-center gap-1 text-xs transition-colors ${
            comment.liked ? "text-rose-500" : "text-slate-400 hover:text-rose-400"
          }`}
        >
          <svg
            className="w-3.5 h-3.5"
            fill={comment.liked ? "currentColor" : "none"}
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
          {comment.likes + (comment.liked ? 1 : 0)}
        </button>
      </div>
    </div>
  );
}
