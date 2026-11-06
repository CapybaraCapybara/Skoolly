import type { DataSources } from "@/api/sourcesApi";

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
  latitude?: string | number;
  longitude?: string | number;
  gps_source?: string;
  gps_precision?: string; // "Exact" | "Approximate" | "None"
  // Written by the GPS button (enrich_school_gps.py, method "consensus-v3"), or "manual"
  // for a pin an admin placed by hand in the past, which nothing overwrites
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
  data_sources?: DataSources; // where each part of the record came from and when
  levels_offered?: string[];
  level_range?: string;
  student_count?: number;
  teacher_count?: number;
  curriculums?: string[];
  licensee_name?: string;
  director_name?: string;
  manager_name?: string;
  tuition_min_thb?: number | null; // published fee, empty until a fee version is approved
  /** "archived" = closed by an admin: hidden from parents, can be reopened */
  status?: "active" | "archived";
  archived_at?: string | null;
  /** When OPEC stopped listing the school; null while OPEC lists it */
  opec_missing_since?: string | null;
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
  /** The published version the page shows; sent back with an edit so a stale page gets 409 */
  current_published_version_id?: string | null;
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
  /** The school's published version when the list was loaded (see OpecSchoolRecord) */
  version_id?: string | null;
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
  scraped_signature_programs?: { name: string; category?: string; description?: string; evidence?: string }[];
  previous_fees?: VersionFeeItem[];
  previous_safety?: VersionSafetyData | null;
  previous_curriculums?: string[];
  added_curriculums?: string[]; // scraped names whose curriculum code the school did not have before
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



/** One school in the admin's curriculum review (GET /api/curriculums/review) */
export interface CurriculumReviewItem {
  school_code: string;
  name_th: string | null;
  name_en: string | null;
  province: string | null;
  district: string | null;
  opec_codes: string[];
  /** OPEC's own wording, one entry per registered curriculum */
  opec_text: string[];
  website_codes: string[];
  website_text: string;
  website_url: string;
  current_codes: string[];
  confirmed_at: string | null;
  confirmed_by: string | null;
  /** The school's published version when the list was loaded (see OpecSchoolRecord) */
  version_id: string | null;
}

/** One version of a school (GET /api/school/{code}/versions) */
export interface SchoolVersion {
  version_id: string;
  version_number: number;
  status: "pending_review" | "approved" | "rejected" | "published" | "superseded";
  source_type: "admin" | "scraper" | "bulk_import" | "opec_import" | "pipeline";
  submitted_at: string | null;
  reviewed_at: string | null;
  scraped_page_url: string | null;
  /** action: what was done; fields: each changed value as [before, after]; restored_from: rollback source */
  diff_summary: {
    action?: string;
    fields?: Record<string, [unknown, unknown]>;
    restored_from?: number;
    web_changed?: boolean;
    by?: string;
  } | null;
  rejection_reason: string | null;
  has_web_data: boolean;
  /** The scraper version this version's fees and website data came from */
  web_from_number: number | null;
  fee_rows: number;
  /** Lowest and highest annual tuition, as the site shows it from this version */
  annual_min: number | null;
  annual_max: number | null;
  extra_rows: number;
  /** Link, pin and curriculums; null in versions saved before 4 Nov 2569 */
  school: Record<string, unknown> | null;
}

/** One side of GET /api/school/{code}/versions/{id}/compare */
export interface VersionDetail {
  version_number: number | null;
  has_web_data: boolean;
  /** In the order the school's own fee page lists them */
  fees: { grade_label: string; annual_thb: number | null; semester_thb: number | null; notes: string | null }[];
  extra_fees: VersionExtraFeeItem[];
  safety: VersionSafetyData | null;
  facilities: string[];
  /** Link, pin and curriculums; null for a version saved before 4 Nov 2569 */
  school: Record<string, unknown> | null;
}

export interface VersionCompare {
  version: VersionDetail;
  current: VersionDetail;
}

export interface CurriculumReviewResponse {
  /** OPEC and the school's website name different curriculums, nothing in common */
  conflicts: CurriculumReviewItem[];
  /** Schools an admin has decided; OPEC imports leave them as they are */
  confirmed: CurriculumReviewItem[];
  /** Curriculum code -> Thai label */
  labels: Record<string, string>;
}

