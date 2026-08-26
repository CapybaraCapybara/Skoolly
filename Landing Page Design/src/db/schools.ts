/**
 * db/schools.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Mock database seed data for School records.
 *
 * In production, replace this file's exports with actual DB queries
 * (e.g. Prisma, Supabase, or a REST fetch against your own API).
 */

import type { School } from "@/types";

export const SCHOOLS_SEED: School[] = [
  {
    id: 1,
    name: "Bangkok Patana School",
    curriculum: "British",
    location: "Sukhumvit, Bangkok",
    tuitionStart: 420000,
    rating: 4.8,
    reviewCount: 312,
    distance: 2.4,
    language: "English",
    grades: "Pre-K–Year 13",
    image: "photo-1580582932707-520aed937b7b",
    badge: "Top Rated",
  },
  {
    id: 2,
    name: "NIST International School",
    curriculum: "IB",
    location: "Asok, Bangkok",
    tuitionStart: 510000,
    rating: 4.7,
    reviewCount: 198,
    distance: 1.1,
    language: "English",
    grades: "Pre-K–Grade 12",
    image: "photo-1523050854058-8df90110c9f1",
    badge: "IB World School",
  },
  {
    id: 3,
    name: "Ruamrudee International School",
    curriculum: "American",
    location: "Lat Phrao, Bangkok",
    tuitionStart: 380000,
    rating: 4.6,
    reviewCount: 274,
    distance: 6.7,
    language: "English",
    grades: "Pre-K–Grade 12",
    image: "photo-1509062522246-3755977927d7",
    badge: null,
  },
  {
    id: 4,
    name: "Harrow International School",
    curriculum: "British",
    location: "Kanchanaphisek, Bangkok",
    tuitionStart: 560000,
    rating: 4.9,
    reviewCount: 145,
    distance: 12.3,
    language: "English",
    grades: "Year 3–Year 13",
    image: "photo-1562774053-701939374585",
    badge: "Premium",
  },
  {
    id: 5,
    name: "ISB – International School Bangkok",
    curriculum: "American",
    location: "Nichada, Nonthaburi",
    tuitionStart: 490000,
    rating: 4.7,
    reviewCount: 389,
    distance: 15.0,
    language: "English",
    grades: "Pre-K–Grade 12",
    image: "photo-1541339907198-e08756dedf3f",
    badge: null,
  },
  {
    id: 6,
    name: "Shrewsbury International School",
    curriculum: "British",
    location: "Riverside, Bangkok",
    tuitionStart: 530000,
    rating: 4.8,
    reviewCount: 221,
    distance: 5.9,
    language: "English",
    grades: "Year 2–Year 13",
    image: "photo-1497633762265-9d179a990aa6",
    badge: "Riverside Campus",
  },
];
