export interface OpecSchoolRecord {
  no?: number;
  school_code: string;
  school_name_th: string;
  school_name_en?: string;
  province?: string;
  district?: string;
  subdistrict?: string;
  address?: string;
  website?: string;
  website_source?: string;
  facebook?: string;
  telephone?: string;
  mobile?: string;
  email?: string;
  latitude?: string | number;
  longitude?: string | number;
  gps_source?: string;
  gps_precision?: string; // "Exact" | "Approximate" | "None"
  opec_profile_url?: string;
  levels_offered?: string[];
  level_range?: string;
  student_count?: number;
  teacher_count?: number;
  curriculums?: string[];
  licensee_name?: string;
  director_name?: string;
  manager_name?: string;
  government_support?: string; // "ไม่รับเงินอุดหนุน" | "รับเงินอุดหนุน"
  school_history?: string;
  vision?: string;
  mission?: string;
  maxim?: string;
  uniqueness?: string;
  identity?: string;
  tags?: string;
  school_logo_url?: string;
  line_id?: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  fetched_at?: string;
  last_updated?: string;
}

export interface ScraperProgressState {
  is_running: boolean;
  task: string;
  current: number;
  total: number;
  percent: number;
  log: string;
  logs: string[];
}

export interface DashboardKpis {
  totalSchools: number;
  totalProvinces: number;
  totalStudents: number;
  avgStudents: number;
  totalTeachers: number;
  studentTeacherRatio: string;
  websitesCount: number;
  websitesPct: number;
  gpsExactCount: number;
  gpsExactPct: number;
}

export interface ProvinceStat {
  province: string;
  count: number;
  pct: number;
  hasWebsite: number;
  hasGps: number;
}

export interface CurriculumStat {
  name: string;
  count: number;
  pct: number;
}

export interface TopSchool {
  rank: number;
  code: string;
  name_th: string;
  name_en?: string;
  province: string;
  student_count: number;
  ratio: string;
}

export interface SupabaseSchoolRecord {
  school_id: string;
  opec_school_code?: string | null;
  slug: string;
  name_th: string;
  name_en?: string | null;
  status: "active" | "archived";
  official_website_url?: string | null;
  website_source?: string | null;
  official_phone?: string | null;
  official_mobile?: string | null;
  official_email?: string | null;
  facebook_url?: string | null;
  line_id?: string | null;
  instagram_url?: string | null;
  youtube_url?: string | null;
  province: string;
  district?: string | null;
  subdistrict?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  gps_precision?: string | null;
  gps_source?: string | null;
  logo_url?: string | null;
  level_range?: string | null;
  levels_offered: string[];
  curriculums: string[];
  student_count?: number | null;
  teacher_count?: number | null;
  pub_tuition_min_thb?: number | null;
  pub_tuition_max_thb?: number | null;
  pub_has_safeguarding_policy?: boolean | null;
  pub_data_updated_at?: string | null;
  rating_avg?: number | null;
  review_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SupabaseSchoolsResponse {
  schools: SupabaseSchoolRecord[];
  total: number;
  kpis: {
    total_schools: number;
    total_provinces: number;
    total_students: number;
    with_website: number;
  };
}

export interface SupabaseSchoolsFilterParams {
  search?: string;
  province?: string;
  curriculum?: string;
  level?: string;
  limit?: number;
  offset?: number;
}

export interface WebsiteHealthState {
  is_running: boolean;
  current: number;
  total: number;
  percent: number;
  broken_count: number;
  healthy_count: number;
  message: string;
  last_run_at?: string;
}

export interface WebsiteRegistryItem {
  school_code: string;
  school_name_th: string;
  school_name_en?: string;
  province?: string;
  website: string;
  website_source: string;
  is_verified: boolean;
  status: "verified" | "opec" | "probed" | "missing";
  ref_url?: string;
  verified_at?: string;
  verified_at_display?: string;
  verified_by?: string;
  http_status?: number | null;
  is_broken?: boolean;
  error_reason?: string;
  last_checked_at?: string;
  last_checked_at_display?: string;
}

export interface WebsiteRegistryResponse {
  total: number;
  with_website: number;
  verified_count: number;
  opec_count: number;
  probed_count: number;
  missing_count: number;
  broken_count?: number;
  healthy_count?: number;
  health_state?: WebsiteHealthState;
  items: WebsiteRegistryItem[];
}


