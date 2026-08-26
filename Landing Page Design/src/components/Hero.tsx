'use client';

import { ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

interface HeroProps {
  eyebrow?: string;
  headingPrefix?: string;
  headingHighlight?: string;
  headingSuffix?: string;
  description?: string;
  primaryCtaLabel?: string;
  primaryCtaHref?: string;
  backgroundImage?: string;
}

export function Hero({
  eyebrow = 'AI-POWERED SCHOOL MATCHING · THAILAND',
  headingPrefix = 'Find the Right International',
  headingHighlight = 'School',
  headingSuffix = 'For Your Child',
  description = 'Compare 120+ accredited international schools by curriculum, cost, distance, and real parent reviews — with AI-powered personalised recommendations.',
  primaryCtaLabel = 'Sign Up Free',
  primaryCtaHref = '#schools',
  backgroundImage = 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1000&h=800&fit=crop&auto=format',
}: HeroProps) {
  return (
    <section className="relative bg-warm-bg pt-8 pb-16 px-6 md:px-12 lg:px-16 overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* ── LEFT COLUMN ────────────────────────────────────────────────── */}
          <div className="lg:col-span-6 flex flex-col items-start text-left z-10">
            <span className="inline-block text-xs font-bold tracking-widest text-warm-bronze uppercase mb-4">
              {eyebrow}
            </span>
            <h1 className="font-sans text-[clamp(2.5rem,4.5vw,4.25rem)] font-bold leading-[1.1] tracking-tight text-warm-charcoal mb-6">
              {headingPrefix}{' '}
              <span className="text-warm-bronze italic font-serif font-normal">{headingHighlight}</span>{' '}
              {headingSuffix}
            </h1>
            <p className="text-warm-charcoal/70 text-base md:text-lg leading-relaxed max-w-lg mb-8">
              {description}
            </p>
            <a
              href={primaryCtaHref}
              className="inline-flex items-center justify-center gap-2 bg-warm-charcoal text-white hover:bg-warm-charcoal/90 text-base font-semibold px-8 py-4 rounded-full shadow-lg transition-all active:scale-[0.98]"
            >
              {primaryCtaLabel}
              <ArrowRight className="size-4" />
            </a>
          </div>

          {/* ── RIGHT COLUMN ───────────────────────────────────────────────── */}
          <div className="lg:col-span-6 relative w-full flex justify-center lg:justify-end">
            {/* Main Image Frame (Dwello style) */}
            <div className="relative w-full max-w-[500px] h-[360px] md:h-[450px] rounded-[2rem] overflow-hidden border-[8px] border-warm-card shadow-2xl">
              <img
                src={backgroundImage}
                alt="International School Campus"
                className="w-full h-full object-cover"
              />
            </div>
            
            {/* Micro Badge / Floating Stat (Vibe check) */}
            <div className="absolute -bottom-4 -left-4 bg-warm-cream border border-warm-accent rounded-2xl p-4 shadow-xl z-20 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-warm-bronze/10 flex items-center justify-center text-warm-bronze">
                ⭐
              </div>
              <div>
                <div className="text-sm font-bold text-warm-charcoal">4.8 / 5.0</div>
                <div className="text-[10px] text-warm-charcoal/60 uppercase tracking-wider font-semibold">Average Parent Rating</div>
              </div>
            </div>
          </div>

        </div>

        {/* ── STATS SECTION (Dwello style) ────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-6 md:gap-12 mt-16 pt-12 border-t border-warm-accent/40 text-left max-w-3xl">
          <div>
            <div className="text-3xl md:text-4xl font-bold text-warm-charcoal">120+</div>
            <div className="text-xs md:text-sm text-warm-charcoal/60 font-medium mt-1">Accredited Schools</div>
          </div>
          <div>
            <div className="text-3xl md:text-4xl font-bold text-warm-charcoal">50K+</div>
            <div className="text-xs md:text-sm text-warm-charcoal/60 font-medium mt-1">Parent Reviews</div>
          </div>
          <div>
            <div className="text-3xl md:text-4xl font-bold text-warm-charcoal">10K+</div>
            <div className="text-xs md:text-sm text-warm-charcoal/60 font-medium mt-1">Happy Families</div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
