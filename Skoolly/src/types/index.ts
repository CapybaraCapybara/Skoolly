// ─── Navigation ───────────────────────────────────────────────────────────────
export type View =
  | "home"
  | "forum"
  | "calculator"
  | "admin"
  | "supabase-admin"
  | "favorites"
  | "login"
  | { type: "school"; id: number }
  | { type: "calculator"; schoolId?: number };

// ─── School (core record — stored in DB) ──────────────────────────────────────
export interface School {
  id: number;
  name: string;
  nameTh?: string;
  schoolCode?: string | null;
  curriculum: string;
  /** Every curriculum the school lists with OPEC, e.g. "สหราชอาณาจักร (British)" */
  curricula?: string[];
  location: string;
  province?: string;
  /** Levels from OPEC: ก่อนอนุบาล, อนุบาล, ประถมศึกษา, มัธยมศึกษาตอนต้น, มัธยมศึกษาตอนปลาย */
  levels?: string[];
  tuitionStart: number;
  tuitionMax?: number | null;
  rating: number;
  reviewCount: number;
  distance: number;
  language: string;
  grades: string;
  image: string;
  logoUrl?: string | null;
  badge?: string | null;
  lastUpdated?: string;
  studentCount?: number | null;
  teacherCount?: number | null;
  isBoarding?: boolean | null;
  isIsatMember?: boolean | null;
  websiteUrl?: string | null;
  phone?: string | null;
  coords?: SchoolCoords;
}

export interface SchoolCoords {
  lat: number;
  lng: number;
  precision: "Exact" | "Approximate";
  source?: string | null;
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

export interface SchoolSafety {
  securityGuards?: string;
  cctv?: string;
  medicalNurse?: string;
  safeguardingPolicy?: string;
  airQualityPM25?: string;
  visitorControl?: string;
  emergencyDrill?: string;
  summary?: string;
  highlights?: string[];
  policyUrl?: string;
}

export interface SchoolDetail {
  founded: string;
  students: string;
  teacherCount?: number | null;
  studentTeacherRatio?: string | null;
  levelRange?: string | null;
  levelsOffered?: string[];
  curriculums?: string[];
  isBoarding?: boolean | null;
  isIsatMember?: boolean | null;
  officialPhone?: string | null;
  officialEmail?: string | null;
  facebookUrl?: string | null;
  address?: string | null;
  district?: string | null;
  subdistrict?: string | null;
  province?: string | null;
  accreditation: string[];
  website: string;
  about: string;
  fees: SchoolFee[];
  gallery: string[];
  facilities: string[];
  reviews: SchoolReview[];
  safety?: SchoolSafety;
  lastUpdated?: string;
  logoUrl?: string | null;
  schoolCode?: string | null;
}

// ─── Filters (UI state only — not persisted) ──────────────────────────────────
export interface Filters {
  query: string;
  /** "" = every province */
  province: string;
  /** "" = every curriculum; otherwise an OPEC curriculum name */
  curriculum: string;
  /** Max yearly fee in baht; null = no limit */
  maxFee: number | null;
  /** Levels the school must offer, all of them */
  levels: string[];
  isatOnly: boolean;
  boardingOnly: boolean;
}

export type SortKey = "name-th" | "name-en" | "opec" | "distance" | "students" | "fee-asc" | "fee-desc";

// ─── Forum (stored in DB) ─────────────────────────────────────────────────────
export interface Comment {
  id: string;
  author: string;
  avatar: string;
  content: string;
  time: string;
  likes: number;
  liked: boolean;
}

export interface Post {
  id: string;
  author: string;
  avatar: string;
  role: string;
  schoolTag: string | null;
  schoolId: number | null;
  category: "Review" | "Question" | "Update" | "Tips";
  title: string;
  content: string;
  time: string;
  likes: number;
  liked: boolean;
  comments: Comment[];
  image?: string;
}
