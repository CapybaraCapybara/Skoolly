/**
 * db/forumPosts.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Mock database seed data for Forum Posts.
 *
 * In production, replace with a real DB query (e.g. Prisma, Supabase).
 */

import type { Post } from "@/types";

export const FORUM_POSTS_SEED: Post[] = [
  {
    id: 1,
    author: "Nattaporn S.",
    avatar: "NP",
    role: "Parent · Year 7",
    schoolTag: "Bangkok Patana School",
    schoolId: 1,
    category: "Review",
    title: "2 years in — honest thoughts on Bangkok Patana",
    content:
      "Our son moved from a Thai government school to Patana in Year 7. The transition was tough at first — the academic pace is noticeably faster and there's a lot more written work. But the pastoral care team was brilliant. His English shot up within one term. One thing nobody mentions: the canteen wait times at lunch are brutal 😅 Overall we'd recommend it for kids who are academically motivated.",
    time: "2 hours ago",
    likes: 47,
    liked: false,
    image: "photo-1580582932707-520aed937b7b",
    comments: [
      {
        id: 1,
        author: "Kanokwan T.",
        avatar: "KT",
        content:
          "This matches our experience exactly! The pastoral team really went above and beyond when my daughter was settling in.",
        time: "1h ago",
        likes: 12,
        liked: false,
      },
      {
        id: 2,
        author: "Michael R.",
        avatar: "MR",
        content:
          "The canteen comment 😂 so true. We pack lunch now. Academically though, absolutely top tier.",
        time: "45m ago",
        likes: 8,
        liked: false,
      },
      {
        id: 3,
        author: "Supattra V.",
        avatar: "SV",
        content:
          "Can I ask — how did you find the parent communication? We're deciding between Patana and NIST right now.",
        time: "20m ago",
        likes: 3,
        liked: false,
      },
    ],
  },
  {
    id: 2,
    author: "James & Priya L.",
    avatar: "JP",
    role: "Parent · Grade 4 & 6",
    schoolTag: "NIST International School",
    schoolId: 2,
    category: "Tips",
    title: "NIST application tips — what worked for us (second attempt)",
    content:
      "We applied twice. First time we were rejected because we didn't prepare our daughter for the assessment day. Second time, we did 2 months of preparation focusing on reasoning tasks, not just academics. The school really looks for curiosity and how kids handle new problems. Also: submit your application the first week it opens. The queue fills fast and late applicants get the worst assessment slots.",
    time: "5 hours ago",
    likes: 93,
    liked: false,
    comments: [
      {
        id: 4,
        author: "Pimchanok A.",
        avatar: "PA",
        content: "This is gold. What kind of reasoning tasks did you practice? Khan Academy?",
        time: "4h ago",
        likes: 15,
        liked: false,
      },
      {
        id: 5,
        author: "James & Priya L.",
        avatar: "JP",
        content:
          "We used Bond Assessment Papers (order from Amazon) and also some GL Assessment books. Good luck!",
        time: "3h ago",
        likes: 22,
        liked: false,
      },
    ],
  },
  {
    id: 3,
    author: "Sirikanya B.",
    avatar: "SB",
    role: "Parent · Year 10",
    schoolTag: "Shrewsbury International School",
    schoolId: 6,
    category: "Update",
    title: "New Riverside campus — first impressions after one month",
    content:
      "We moved our daughter to the new Riverside campus this academic year. The facilities are stunning — the performing arts centre alone is worth the visit. Class sizes feel a bit larger than promised (28 in one class). The riverside location does mean traffic to Rama 3 is a pain in the afternoon. But the school community is incredibly tight-knit and welcoming.",
    time: "1 day ago",
    likes: 61,
    liked: false,
    comments: [
      {
        id: 6,
        author: "David K.",
        avatar: "DK",
        content:
          "The Rama 3 traffic is something else. We allow 45 mins buffer for pickup. Still sometimes late!",
        time: "22h ago",
        likes: 19,
        liked: false,
      },
    ],
  },
  {
    id: 4,
    author: "Anonymous Parent",
    avatar: "AP",
    role: "Parent · Grade 3",
    schoolTag: "Ruamrudee International School",
    schoolId: 3,
    category: "Question",
    title: "Does RIS offer Thai language support for non-Thai kids?",
    content:
      "We're relocating from Singapore next August. My children (ages 8 and 11) speak no Thai at all. I've read mixed things online about whether RIS provides Thai language catch-up support or if they're expected to manage in mainstream Thai classes from day one. Does anyone have direct experience with this?",
    time: "2 days ago",
    likes: 28,
    liked: false,
    comments: [
      {
        id: 7,
        author: "Lisa M.",
        avatar: "LM",
        content:
          "Yes! They have an EAL (English as Additional Language) equivalent for Thai. My son did it for one year and then joined mainstream. Very well supported.",
        time: "2d ago",
        likes: 11,
        liked: false,
      },
      {
        id: 8,
        author: "Tanawat P.",
        avatar: "TP",
        content:
          "Agree with Lisa. The Thai language coordinator is excellent. Email admissions directly and ask for Ms Wilasinee — she's very responsive.",
        time: "1d ago",
        likes: 7,
        liked: false,
      },
    ],
  },
  {
    id: 5,
    author: "Charlotte H.",
    avatar: "CH",
    role: "Parent · Year 9",
    schoolTag: "Harrow International School",
    schoolId: 4,
    category: "Review",
    title: "Is Harrow worth the ฿560K/yr? Our 3-year verdict",
    content:
      "Short answer: if you can afford it without financial stress, yes. Long answer: the pastoral system (House system) is genuinely exceptional — my son has a housemaster who knows him better than some teachers do. The boarding culture even for day students creates strong bonds. The drama and music programmes are elite. Sport is mandatory and intense — great for my son, would have been tough for a less sporty child. The fees also creep up 5-8% per year, plan for that.",
    time: "3 days ago",
    likes: 134,
    liked: false,
    comments: [
      {
        id: 9,
        author: "Robert F.",
        avatar: "RF",
        content:
          "The House system really is something special. Our daughter credits it for her confidence.",
        time: "2d ago",
        likes: 29,
        liked: false,
      },
      {
        id: 10,
        author: "Monthira J.",
        avatar: "MJ",
        content:
          "The fee increases are real. We budgeted for flat fees and got a shock. 7% last year alone.",
        time: "1d ago",
        likes: 41,
        liked: false,
      },
      {
        id: 11,
        author: "Charlotte H.",
        avatar: "CH",
        content:
          "@Monthira — exactly. I should have asked at admissions: 'What has the historical fee increase been?' They won't volunteer it.",
        time: "18h ago",
        likes: 33,
        liked: false,
      },
    ],
  },
];
