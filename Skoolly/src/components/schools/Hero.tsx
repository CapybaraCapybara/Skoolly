'use client';

import { ArrowRight } from 'lucide-react';

interface HeroProps {
  eyebrow?: string;
  headingPrefix?: string;
  headingHighlight?: string;
  headingSuffix?: string;
  description?: string;
  primaryCtaLabel?: string;
  primaryCtaHref?: string;
  backgroundImage?: string;
  /** ตัวเลขใต้ Hero คำนวณจากข้อมูลจริงโดยหน้าที่เรียกใช้ ถ้าไม่ส่งมาจะไม่แสดงส่วนนี้ */
  stats?: HeroStat[];
  /** คะแนนเฉลี่ยจากรีวิวจริง ถ้ายังไม่มีรีวิวให้ส่ง null เพื่อซ่อน badge */
  averageRating?: number | null;
}

export interface HeroStat {
  value: string;
  label: string;
}

export function Hero({
  eyebrow = 'AI-POWERED SCHOOL MATCHING · THAILAND',
  headingPrefix = 'Find the Right International',
  headingHighlight = 'School',
  headingSuffix = 'For Your Child',
  description = 'Compare international schools in Thailand by curriculum, cost, distance, and real parent reviews — with AI-powered personalised recommendations.',
  primaryCtaLabel = 'Sign Up Free',
  primaryCtaHref = '#schools',
  backgroundImage = 'https://images.unsplash.com/photo-1541829070764-84a7d30dd3f3?w=1000&h=800&fit=crop&auto=format',
  stats = [],
  averageRating = null,
}: HeroProps) {
  return (
    <section className="relative bg-warm-bg pt-4 sm:pt-8 pb-12 sm:pb-16 px-4 sm:px-8 md:px-12 lg:px-16 overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* ── LEFT COLUMN ────────────────────────────────────────────────── */}
          <div className="lg:col-span-6 flex flex-col items-start text-left z-10">
            <span className="inline-block text-[11px] sm:text-xs font-bold tracking-widest text-warm-bronze uppercase mb-3 sm:mb-4">
              {eyebrow}
            </span>
            <h1 className="font-sans text-3xl sm:text-4xl md:text-5xl lg:text-[3.75rem] font-bold leading-[1.15] tracking-tight text-warm-charcoal mb-4 sm:mb-6">
              {headingPrefix}{' '}
              <span className="text-warm-bronze italic font-serif font-normal">{headingHighlight}</span>{' '}
              {headingSuffix}
            </h1>
            <p className="text-warm-charcoal/70 text-sm sm:text-base md:text-lg leading-relaxed max-w-lg mb-6 sm:mb-8">
              {description}
            </p>
            <a
              href={primaryCtaHref}
              className="inline-flex items-center justify-center gap-2 bg-warm-charcoal text-white hover:bg-warm-charcoal/90 text-sm sm:text-base font-semibold px-6 sm:px-8 py-3.5 sm:py-4 rounded-full shadow-lg transition-all active:scale-[0.98]"
            >
              {primaryCtaLabel}
              <ArrowRight className="size-4" />
            </a>
          </div>

          {/* ── RIGHT COLUMN ───────────────────────────────────────────────── */}
          <div className="lg:col-span-6 relative w-full flex justify-center lg:justify-end mt-2 lg:mt-0">
            {/* Main Image Frame (Dwello style) */}
            <div className="relative w-full max-w-[500px] h-[260px] sm:h-[360px] md:h-[450px] rounded-[1.75rem] sm:rounded-[2rem] overflow-hidden border-4 sm:border-[8px] border-warm-card shadow-xl sm:shadow-2xl">
              <img
                src={backgroundImage}
                alt="International School Campus"
                className="w-full h-full object-cover"
              />
            </div>
            
            {/* Micro Badge — แสดงเฉพาะเมื่อมีรีวิวจริงในระบบ */}
            {averageRating != null && (
              <div className="absolute -bottom-3 left-2 sm:-bottom-4 sm:-left-4 bg-warm-cream border border-warm-accent rounded-xl sm:rounded-2xl p-2.5 sm:p-4 shadow-lg sm:shadow-xl z-20 flex items-center gap-2.5 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-warm-bronze/10 flex items-center justify-center text-warm-bronze text-sm sm:text-base">
                  ⭐
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-bold text-warm-charcoal">{averageRating.toFixed(1)} / 5.0</div>
                  <div className="text-[9px] sm:text-[10px] text-warm-charcoal/60 uppercase tracking-wider font-semibold">Average Parent Rating</div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ── STATS SECTION (Dwello style) ────────────────────────────────── */}
        {stats.length > 0 && (
          <div className="grid grid-cols-3 gap-3 sm:gap-6 md:gap-12 mt-10 sm:mt-16 pt-8 sm:pt-12 border-t border-warm-accent/40 text-left max-w-3xl">
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-warm-charcoal">{stat.value}</div>
                <div className="text-[11px] sm:text-xs md:text-sm text-warm-charcoal/60 font-medium mt-0.5 sm:mt-1 leading-tight">{stat.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default Hero;
