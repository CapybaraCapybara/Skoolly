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
  // Written by the GPS button (enrich_school_gps.py, method "consensus-v2"), or "manual"
  // for a pin an admin placed by hand (PUT /api/school/{code}/gps), which nothing overwrites
  gps_method?: string;
  gps_locked?: boolean;
  gps_manual?: { source: string; note: string; by: string; at: string };
  gps_confidence?: "high" | "medium" | "low"; // high: independent sources agree; medium: one name-verified POI
  gps_confirmed_by?: string[]; // sources that agreed on the chosen point
  gps_evidence?: GpsEvidence[]; // every candidate pin, for review
  gps_anchor?: { level: "tambon" | "amphoe"; lat: number; lon: number; label: string } | null;
  opec_latitude?: string; // raw OPEC pin, never overwritten
  opec_longitude?: string;
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
  is_isat_member?: boolean;
  is_boarding?: boolean;
  year_established?: number;
  accreditations?: string[];
  isat_school_name?: string;
  line_id?: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  fetched_at?: string;
  last_updated?: string;
}

/** One candidate pin the GPS button considered, with its distance from the chosen point. */
export interface GpsEvidence {
  source: "opec" | "website" | "osm" | "arcgis_poi" | "arcgis_address" | "overture" | "dopa";
  lat?: number; // absent for sources whose coordinates may not be stored (ArcGIS)
  lon?: number;
  distance_m: number | null; // null when no point was chosen
  label: string;
  pin?: "place" | "camera"; // website pins only: the marker itself, or Google's view centre
  origin?: "school" | "google"; // website pins only: written by the school, or taken from a Google embed
  keys?: string[]; // Overture only: how identity was matched (domain / phone / facebook / name)
  confidence?: number; // Overture only: the record's own existence confidence
  overture_id?: string;
  category?: string;
  score?: number; // name-match strength (OSM / ArcGIS POI)
  osm_id?: string;
  anchor_m?: number; // distance from the registered tambon/amphoe/khet centre
  shared?: boolean; // an OPEC pin that another record also uses
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

export interface ProvinceStat {
  province: string;
  count: number;
  pct: number;
  hasWebsite: number;
  hasGps: number;
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
  is_isat_member?: boolean;
  is_boarding?: boolean;
  year_established?: number | null;
  accreditations?: string[];
  isat_school_name?: string | null;
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

export interface VersionFeeItem {
  fee_id: string;
  grade_label: string;
  level_code?: string | null;
  annual_thb?: number | null;
  semester_thb?: number | null;
  currency: string;
  notes?: string | null;
}

export interface VersionExtraFeeItem {
  extra_fee_id: string;
  name: string;
  amount_thb?: number | null;
  frequency: string;
  notes?: string | null;
}

export interface VersionSafetyData {
  security_guards?: boolean | null;
  cctv_monitoring?: boolean | null;
  nurse_medical_clinic?: boolean | null;
  child_safeguarding_policy?: boolean | null;
  air_quality_pm25_protocol?: boolean | null;
  visitor_access_control?: boolean | null;
  highlights?: string[] | null;
  policy_summary?: string | null;
  policy_url?: string | null;
}

export interface PendingVersionRecord {
  version_id: string;
  school_id: string;
  version_number: number;
  status: "pending_review" | "published" | "superseded" | "rejected";
  source_type: string;
  confidence_score?: number | null;
  confidence_reasoning?: string | null;
  scraped_page_url?: string | null;
  diff_summary?: any;
  data_snapshot?: any;
  submitted_at?: string;
  name_th: string;
  name_en?: string | null;
  opec_school_code?: string | null;
  province?: string | null;
  district?: string | null;
  logo_url?: string | null;
  official_website_url?: string | null;
  current_published_version_id?: string | null;
  current_pub_min_thb?: number | null;
  current_pub_max_thb?: number | null;
  current_has_safeguarding?: boolean | null;
  current_curriculums?: string[] | null;
  current_pub_data_updated_at?: string | null;
  fees: VersionFeeItem[];
  extra_fees: VersionExtraFeeItem[];
  safety?: VersionSafetyData | null;
  scraped_curriculums?: string[];
  scraped_general_info?: {
    about?: string;
    founded?: string;
    student_count?: string;
    levels_offered?: string[];
    is_boarding?: boolean;
  };
  scraped_facilities?: string[];
  previous_fees?: VersionFeeItem[];
  previous_safety?: VersionSafetyData | null;
  previous_curriculums?: string[];
  previous_facilities?: string[];
  previous_general_info?: {
    about?: string;
    founded?: string;
    student_count?: string;
    levels_offered?: string[];
    is_boarding?: boolean;
  };
  previous_submitted_at?: string | null;
}

export interface ScrapeLogRecord {
  log_id: number;
  school_id?: string | null;
  version_id?: string | null;
  run_id?: string | null;
  correlation_id?: string | null;
  phase: string;
  status: "ok" | "no_tuition_found" | "nav_failed" | "blocked" | "timeout" | "error" | string;
  page_scraped?: string | null;
  elapsed_sec?: number | null;
  ai_model?: string | null;
  ai_reasoning?: string | null;
  error_message?: string | null;
  created_at: string;
  name_th?: string | null;
  name_en?: string | null;
  opec_school_code?: string | null;
  official_website_url?: string | null;
}


