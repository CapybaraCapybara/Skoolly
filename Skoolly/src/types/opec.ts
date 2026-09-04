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
