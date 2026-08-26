/**
 * db/schoolDetails.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Mock database seed data for extended School detail records.
 * Includes fees, gallery images, facilities, and parent reviews.
 *
 * In production, replace with a real DB query keyed by school ID.
 */

import type { SchoolDetail } from "@/types";

export const SCHOOL_DETAILS_SEED: Record<number, SchoolDetail> = {
  1: {
    founded: "1957",
    students: "2,100+",
    accreditation: ["BSO", "CIS", "IBO"],
    website: "bangkokpatana.ac.th",
    about:
      "Bangkok Patana School is one of Southeast Asia's leading international schools, founded in 1957. Operating under the British National Curriculum through to A Levels, it serves a diverse community of over 60 nationalities. The school is fully accredited and consistently places students into top universities worldwide including Oxford, Cambridge, LSE, and Ivy League institutions.",
    fees: [
      { label: "Registration fee (one-time)", amount: "฿50,000" },
      { label: "Capital levy (one-time)", amount: "฿250,000" },
      { label: "Tuition – Pre-K", amount: "฿420,000 / yr" },
      { label: "Tuition – Primary (Y1–Y6)", amount: "฿475,000 / yr" },
      { label: "Tuition – Secondary (Y7–Y11)", amount: "฿545,000 / yr" },
      { label: "Tuition – Sixth Form (Y12–Y13)", amount: "฿590,000 / yr" },
    ],
    gallery: [
      "photo-1580582932707-520aed937b7b",
      "photo-1509062522246-3755977927d7",
      "photo-1497633762265-9d179a990aa6",
      "photo-1541339907198-e08756dedf3f",
    ],
    facilities: [
      "Olympic-sized swimming pool",
      "Performing arts centre",
      "IB Design lab",
      "3 sports fields",
      "350-seat auditorium",
      "Makerspace & robotics lab",
    ],
    reviews: [
      {
        author: "Nattaporn S.",
        avatar: "NS",
        rating: 5,
        text: "Exceptional pastoral care. The transition from Thai schooling was seamless thanks to the form tutor system. Academically rigorous but in a supportive way.",
        time: "2 months ago",
        childYear: "Year 8",
      },
      {
        author: "Michael R.",
        avatar: "MR",
        rating: 4,
        text: "Outstanding academics and university guidance. My daughter got into UCL for Economics. The canteen and traffic are the only complaints from our family.",
        time: "4 months ago",
        childYear: "Year 13 (graduated)",
      },
      {
        author: "Priya L.",
        avatar: "PL",
        rating: 5,
        text: "The Arts programme here is genuinely world class. My son performed at the Edinburgh Fringe through the school. Worth every baht for arts-focused children.",
        time: "6 months ago",
        childYear: "Year 11",
      },
    ],
  },
  2: {
    founded: "1992",
    students: "1,700+",
    accreditation: ["IBO", "CIS", "WASC"],
    website: "nist.ac.th",
    about:
      "NIST International School is Bangkok's only IB Continuum World School, offering the full International Baccalaureate programme from PYP through to the Diploma. Founded in 1992 and located in the heart of Asok, NIST is known for its inquiry-led learning philosophy, sustainability focus, and strong community of globally minded families.",
    fees: [
      { label: "Registration fee (one-time)", amount: "฿80,000" },
      { label: "Capital levy (one-time)", amount: "฿350,000" },
      { label: "Tuition – PYP (Pre-K–G5)", amount: "฿510,000 / yr" },
      { label: "Tuition – MYP (G6–G10)", amount: "฿570,000 / yr" },
      { label: "Tuition – DP (G11–G12)", amount: "฿630,000 / yr" },
    ],
    gallery: [
      "photo-1523050854058-8df90110c9f1",
      "photo-1562774053-701939374585",
      "photo-1580582932707-520aed937b7b",
      "photo-1509062522246-3755977927d7",
    ],
    facilities: [
      "Rooftop garden & farm",
      "Innovation Hub",
      "Black box theatre",
      "25m indoor pool",
      "IB Design studio",
      "Media production suite",
    ],
    reviews: [
      {
        author: "James L.",
        avatar: "JL",
        rating: 5,
        text: "The IB here is taught with real depth. Our son went from a national school to NIST in Grade 6 — the inquiry approach took adjustment but he's now thriving.",
        time: "1 month ago",
        childYear: "Grade 8",
      },
      {
        author: "Kanokwan T.",
        avatar: "KT",
        rating: 4,
        text: "Assessment Day preparation is key. Once you're in, the community is incredibly warm. The parent body is engaged and the events are superb.",
        time: "3 months ago",
        childYear: "Grade 5",
      },
    ],
  },
  3: {
    founded: "1957",
    students: "1,500+",
    accreditation: ["WASC", "NEASC"],
    website: "ruamrudee.ac.th",
    about:
      "Ruamrudee International School (RIS) is one of Bangkok's oldest international schools, founded in 1957 by the Roman Catholic Diocese of Bangkok. It follows the American curriculum leading to a US High School Diploma and offers excellent AP course options for university-bound students.",
    fees: [
      { label: "Registration fee (one-time)", amount: "฿30,000" },
      { label: "Capital levy (one-time)", amount: "฿120,000" },
      { label: "Tuition – Pre-K–Grade 2", amount: "฿380,000 / yr" },
      { label: "Tuition – Grade 3–Grade 8", amount: "฿420,000 / yr" },
      { label: "Tuition – Grade 9–Grade 12", amount: "฿460,000 / yr" },
    ],
    gallery: [
      "photo-1509062522246-3755977927d7",
      "photo-1562774053-701939374585",
      "photo-1497633762265-9d179a990aa6",
      "photo-1580582932707-520aed937b7b",
    ],
    facilities: [
      "8 tennis courts",
      "Football pitch",
      "Chapel",
      "Library with 30,000 volumes",
      "Science labs ×6",
      "Community service centre",
    ],
    reviews: [
      {
        author: "Lisa M.",
        avatar: "LM",
        rating: 4,
        text: "Excellent value for an accredited American curriculum school. The AP programme is strong. The campus is huge — kids love having space.",
        time: "2 months ago",
        childYear: "Grade 10",
      },
    ],
  },
  4: {
    founded: "1998",
    students: "1,200+",
    accreditation: ["BSO", "CIS"],
    website: "harrowschool.ac.th",
    about:
      "Harrow International School Bangkok is part of the worldwide Harrow family, linked to the historic Harrow School in England. The school follows the British curriculum to GCSE and A Level and is renowned for its House pastoral system, high academic standards, and exceptional co-curricular programme in sport, arts, and community service.",
    fees: [
      { label: "Registration fee (one-time)", amount: "฿100,000" },
      { label: "Capital levy (one-time)", amount: "฿500,000" },
      { label: "Tuition – Year 3–Year 6", amount: "฿560,000 / yr" },
      { label: "Tuition – Year 7–Year 11", amount: "฿620,000 / yr" },
      { label: "Tuition – Year 12–Year 13", amount: "฿680,000 / yr" },
    ],
    gallery: [
      "photo-1562774053-701939374585",
      "photo-1580582932707-520aed937b7b",
      "photo-1541339907198-e08756dedf3f",
      "photo-1523050854058-8df90110c9f1",
    ],
    facilities: [
      "Full-size cricket ground",
      "Olympic pool",
      "House system boarding facilities",
      "Harrow Hill theatre",
      "Equestrian centre nearby",
      "25+ sports offered",
    ],
    reviews: [
      {
        author: "Charlotte H.",
        avatar: "CH",
        rating: 5,
        text: "The House system is unlike anything else in Bangkok. My son has a housemaster who knows him as a whole person, not just a student number. Transformative education.",
        time: "1 week ago",
        childYear: "Year 10",
      },
      {
        author: "Robert F.",
        avatar: "RF",
        rating: 5,
        text: "The co-curricular breadth is staggering. My daughter does debating, polo, and orchestra. The fees are high but the education is holistic in a way few schools match.",
        time: "5 months ago",
        childYear: "Year 12",
      },
    ],
  },
  5: {
    founded: "1951",
    students: "1,800+",
    accreditation: ["WASC", "CIS", "NEASC"],
    website: "isb.ac.th",
    about:
      "International School Bangkok (ISB) was founded in 1951 making it one of the oldest international schools in Thailand. Located in the gated Nichada Thani compound in Nonthaburi, it offers an American curriculum with a strong AP programme and an exceptional breadth of extra-curricular activities. ISB is well known for its vibrant, community-focused campus culture.",
    fees: [
      { label: "Registration fee (one-time)", amount: "฿60,000" },
      { label: "Capital levy (one-time)", amount: "฿280,000" },
      { label: "Tuition – Pre-K", amount: "฿490,000 / yr" },
      { label: "Tuition – Elementary", amount: "฿530,000 / yr" },
      { label: "Tuition – Middle School", amount: "฿575,000 / yr" },
      { label: "Tuition – High School", amount: "฿620,000 / yr" },
    ],
    gallery: [
      "photo-1541339907198-e08756dedf3f",
      "photo-1509062522246-3755977927d7",
      "photo-1562774053-701939374585",
      "photo-1497633762265-9d179a990aa6",
    ],
    facilities: [
      "Nichada compound (secure campus)",
      "Multiple pools",
      "Gymnasium complex",
      "Performing arts centre",
      "30+ AP courses",
      "College counselling centre",
    ],
    reviews: [
      {
        author: "David K.",
        avatar: "DK",
        rating: 4,
        text: "The community inside Nichada is incredibly tight. Kids walk/cycle to school, families socialise together. The compound lifestyle is very particular but we love it.",
        time: "3 months ago",
        childYear: "Grade 7",
      },
    ],
  },
  6: {
    founded: "2003",
    students: "1,400+",
    accreditation: ["BSO", "CIS"],
    website: "shrewsbury.ac.th",
    about:
      "Shrewsbury International School Bangkok follows the British curriculum and has two campuses — the original East campus in Bang Na and the newer Riverside campus by the Chao Phraya. The school is a branch of Shrewsbury School in England and is known for its strong academic results, excellent pastoral care, and beautiful riverside facilities at its newer campus.",
    fees: [
      { label: "Registration fee (one-time)", amount: "฿60,000" },
      { label: "Capital levy (one-time)", amount: "฿300,000" },
      { label: "Tuition – Year 2–Year 6", amount: "฿530,000 / yr" },
      { label: "Tuition – Year 7–Year 11", amount: "฿595,000 / yr" },
      { label: "Tuition – Year 12–Year 13", amount: "฿640,000 / yr" },
    ],
    gallery: [
      "photo-1497633762265-9d179a990aa6",
      "photo-1580582932707-520aed937b7b",
      "photo-1541339907198-e08756dedf3f",
      "photo-1523050854058-8df90110c9f1",
    ],
    facilities: [
      "Riverside waterfront campus",
      "Theatre & black box",
      "Indoor sports hall",
      "River view dining",
      "Art & design studios",
      "Sailing & water sports",
    ],
    reviews: [
      {
        author: "Sirikanya B.",
        avatar: "SB",
        rating: 5,
        text: "The Riverside campus is stunning. Morning assembly with the river view is a daily wow moment. Academic standards are high and the teachers genuinely care.",
        time: "2 months ago",
        childYear: "Year 10",
      },
    ],
  },
};
