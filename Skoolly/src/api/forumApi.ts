/**
 * api/forumApi.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Backend service layer for Forum data.
 *
 * Reads approved posts and comments from community.forum_* via
 * GET /api/public/forum/posts (opec_service).
 *
 * Note: Like / comment mutations are handled as local state in ForumPage
 * until an auth system is in place. Once auth exists, add mutation functions
 * here (e.g. likePost, addComment).
 */

import type { Comment, Post } from "@/types";
import { getSchools } from "@/api/schoolsApi";

export interface ForumStats {
  members: number;
  posts: number;
  comments: number;
  schools: number;
}

interface ApiComment {
  id: string;
  author: string | null;
  content: string;
  likes: number;
  created_at: string;
}

interface ApiPost {
  id: string;
  author: string | null;
  role: string | null;
  category: Post["category"];
  title: string;
  content: string;
  likes: number;
  created_at: string;
  school_code: string | null;
  school_name: string | null;
  comments: ApiComment[];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const units: [number, string][] = [
    [60 * 60 * 24 * 365, "y"],
    [60 * 60 * 24 * 30, "mo"],
    [60 * 60 * 24 * 7, "w"],
    [60 * 60 * 24, "d"],
    [60 * 60, "h"],
    [60, "m"],
  ];
  for (const [size, label] of units) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${label} ago`;
  }
  return "just now";
}

function mapComment(c: ApiComment): Comment {
  const author = c.author?.trim() || "Parent";
  return {
    id: c.id,
    author,
    avatar: initials(author),
    content: c.content,
    time: timeAgo(c.created_at),
    likes: c.likes,
    liked: false,
  };
}

// ─── Forum Posts ───────────────────────────────────────────────────────────────

/**
 * Fetch approved forum posts and community stats.
 * Posts tagged with a school are linked to that school's id in schoolsApi.
 */
export async function getForum(): Promise<{ posts: Post[]; stats: ForumStats }> {
  const res = await fetch(`/api/public/forum/posts?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Forum request failed (HTTP ${res.status})`);
  const data: { posts: ApiPost[]; stats: ForumStats } = await res.json();

  const schools = await getSchools().catch(() => []);
  const idByCode = new Map(schools.filter((s) => s.schoolCode).map((s) => [s.schoolCode!, s.id]));

  const posts = data.posts.map((p): Post => {
    const author = p.author?.trim() || "Parent";
    return {
      id: p.id,
      author,
      avatar: initials(author),
      role: p.role === "admin" ? "Admin" : "Parent",
      schoolTag: p.school_name,
      schoolId: p.school_code ? idByCode.get(p.school_code) ?? null : null,
      category: p.category,
      title: p.title,
      content: p.content,
      time: timeAgo(p.created_at),
      likes: p.likes,
      liked: false,
      comments: p.comments.map(mapComment),
    };
  });

  return { posts, stats: data.stats };
}
