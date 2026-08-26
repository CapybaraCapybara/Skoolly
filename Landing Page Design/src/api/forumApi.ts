/**
 * api/forumApi.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Backend service layer for Forum data.
 *
 * Currently reads from the mock database (src/db/).
 * To connect to a real backend, replace the function bodies with fetch() calls:
 *
 *   const res = await fetch(`${API_BASE}/forum/posts`);
 *   return res.json();
 *
 * Note: Like / comment mutations are handled as local state in ForumPage
 * until an auth system is in place. Once auth exists, add mutation functions
 * here (e.g. likePost, addComment).
 */

import type { Post } from "@/types";
import { FORUM_POSTS_SEED } from "@/db/forumPosts";

// ─── Forum Posts ───────────────────────────────────────────────────────────────

/**
 * Fetch all forum posts.
 * Replace body with: fetch(`${API_BASE}/forum/posts`).then(r => r.json())
 */
export async function getPosts(): Promise<Post[]> {
  return FORUM_POSTS_SEED;
}

/**
 * Fetch a single post by ID.
 * Replace body with: fetch(`${API_BASE}/forum/posts/${id}`).then(r => r.json())
 */
export async function getPostById(id: number): Promise<Post | undefined> {
  return FORUM_POSTS_SEED.find((p) => p.id === id);
}
