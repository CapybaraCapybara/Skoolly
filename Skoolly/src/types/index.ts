// ─── Navigation ───────────────────────────────────────────────────────────────
export type View = "home" | "forum" | "calculator" | { type: "school"; id: number } | { type: "calculator"; schoolId?: number };

// ─── School (core record — stored in DB) ──────────────────────────────────────
export interface School {
  id: number;
  name: string;
  curriculum: string;
  location: string;
  tuitionStart: number;
  rating: number;
  reviewCount: number;
  distance: number;
  language: string;
  grades: string;
  image: string;
  badge?: string | null;
}

// ─── School Detail (extended — stored in DB, fetched on demand) ───────────────
export interface SchoolFee {
  label: string;
  amount: string;
}

export interface SchoolReview {
  author: string;
  avatar: string;
  rating: number;
  text: string;
  time: string;
  childYear: string;
}

export interface SchoolDetail {
  founded: string;
  students: string;
  accreditation: string[];
  website: string;
  about: string;
  fees: SchoolFee[];
  gallery: string[];
  facilities: string[];
  reviews: SchoolReview[];
}

// ─── Filters (UI state only — not persisted) ──────────────────────────────────
export interface Filters {
  curriculum: string;
  gradeLevel: string;
  tuitionMax: number;
  location: string;
  language: string;
}

// ─── Forum (stored in DB) ─────────────────────────────────────────────────────
export interface Comment {
  id: number;
  author: string;
  avatar: string;
  content: string;
  time: string;
  likes: number;
  liked: boolean;
}

export interface Post {
  id: number;
  author: string;
  avatar: string;
  role: string;
  schoolTag: string;
  schoolId: number;
  category: "Review" | "Question" | "Update" | "Tips";
  title: string;
  content: string;
  time: string;
  likes: number;
  liked: boolean;
  comments: Comment[];
  image?: string;
}
