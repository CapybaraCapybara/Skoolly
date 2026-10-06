import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { getSchools } from '@/api/schoolsApi';
import type { School } from '@/types';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  BookOpen,
  GraduationCap,
  MapPin,
  Star,
  Calculator,
  MessageSquare,
  Menu,
  ArrowUpRight,
  User,
  Heart,
  GitCompare,
  Sparkles,
  ChevronDown,
  ExternalLink,
  ShieldCheck,
  MoreHorizontal,
} from 'lucide-react';

interface NavbarProps {
  onSignUp?: () => void;
  onLogin?: () => void;
  compareCount?: number;
  onCompare?: () => void;
  onCalculator?: () => void;
  onForum?: () => void;
  onHome?: () => void;
  onAdmin?: () => void;
  onScrape?: () => void;
  favoritesCount?: number;
  onFavorites?: () => void;
}

export function Navbar({
  onSignUp,
  onLogin,
  compareCount = 0,
  onCompare,
  onCalculator,
  onForum,
  onHome,
  onAdmin,
  onScrape,
  favoritesCount = 0,
  onFavorites,
}: NavbarProps) {
  const [schools, setSchools] = useState<School[]>([]);

  useEffect(() => {
    getSchools().then(setSchools).catch(() => setSchools([]));
  }, []);

  // Most common locations in the database, replacing a hand-picked list of areas
  const topLocations = useMemo(() => {
    const counts = new Map<string, number>();
    schools.forEach((s) => {
      if (s.location) counts.set(s.location, (counts.get(s.location) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([loc]) => loc);
  }, [schools]);

  // Highest-rated school with real reviews; the card is hidden until one exists
  const topSchool = useMemo(() => {
    return (
      schools
        .filter((s) => s.reviewCount > 0 && s.rating > 0)
        .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)[0] ?? null
    );
  }, [schools]);

  const [sheetOpen, setSheetOpen] = useState(false);

  const handleMobileNav = (action?: () => void) => {
    action?.();
    setSheetOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full py-2.5 sm:py-3.5 bg-warm-bg/95 border-b border-warm-accent/30 transition-all backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-center px-3 sm:px-6 lg:px-8">
        {/* Floating Navbar Pill */}
        <nav
          aria-label="Main Navigation"
          className="flex h-14 sm:h-16 w-full items-center justify-between gap-1.5 sm:gap-3 rounded-full border border-warm-accent bg-warm-cream/95 px-2.5 sm:px-4 shadow-xs transition-all"
        >
          {/* ── 1. LOGO ──────────────────────────────────────────────────────── */}
          <button
            onClick={onHome}
            className="flex items-center gap-2 pl-1 sm:pl-2 pr-1 hover:opacity-85 transition-opacity shrink-0 cursor-pointer"
            aria-label="Skoolly Home"
          >
            <div className="flex h-8 w-8 sm:h-8.5 sm:w-8.5 items-center justify-center rounded-xl text-white bg-warm-bronze shadow-2xs">
              <BookOpen className="size-4" />
            </div>
            <span className="text-base sm:text-lg font-bold tracking-tight text-warm-charcoal">
              Skool<span className="text-warm-bronze">ly</span>
            </span>
          </button>

          {/* ── 2. DESKTOP NAVIGATION (Visible on >= lg / 1024px) ─────────────── */}
          <div className="hidden lg:flex items-center justify-center min-w-0 flex-1 px-1">
            <NavigationMenu
              className={cn(
                'static max-w-full',
                '[&>div:last-child]:inset-x-0 [&>div:last-child]:top-full [&>div:last-child]:w-full',
                '[&_[data-slot=navigation-menu-viewport]]:mx-auto [&_[data-slot=navigation-menu-viewport]]:-mt-4 [&_[data-slot=navigation-menu-viewport]]:max-w-4xl [&_[data-slot=navigation-menu-viewport]]:ring-0',
                '[&_[data-slot=navigation-menu-viewport]]:rounded-[2rem] [&_[data-slot=navigation-menu-viewport]]:border [&_[data-slot=navigation-menu-viewport]]:border-warm-accent',
                '[&_[data-slot=navigation-menu-viewport]]:bg-warm-cream [&_[data-slot=navigation-menu-viewport]]:shadow-2xl',
                '[&_[data-slot=navigation-menu-viewport]]:transition-all [&_[data-slot=navigation-menu-viewport]]:duration-200'
              )}
            >
              <NavigationMenuList className="gap-0.5 xl:gap-1 flex-nowrap">
                {/* Browse Schools */}
                <NavigationMenuItem>
                  <NavigationMenuLink
                    className="rounded-full bg-transparent px-2.5 xl:px-3 py-1.5 text-xs xl:text-sm font-medium text-warm-charcoal/80 transition-colors hover:text-warm-bronze cursor-pointer whitespace-nowrap"
                    href="#schools"
                    onClick={(e) => {
                      e.preventDefault();
                      onHome?.();
                    }}
                  >
                    Browse Schools
                  </NavigationMenuLink>
                </NavigationMenuItem>

                {/* Cost Calculator */}
                <NavigationMenuItem>
                  <NavigationMenuLink
                    href="#calculator"
                    onClick={(e) => {
                      e.preventDefault();
                      onCalculator?.();
                    }}
                    className="rounded-full bg-transparent px-2.5 xl:px-3 py-1.5 text-xs xl:text-sm font-medium text-warm-charcoal/80 transition-colors hover:text-warm-bronze cursor-pointer whitespace-nowrap"
                  >
                    Cost Calculator
                  </NavigationMenuLink>
                </NavigationMenuItem>

                {/* Find by Criteria (Dropdown) */}
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="h-auto rounded-full bg-transparent px-2.5 xl:px-3 py-1.5 text-xs xl:text-sm font-medium text-warm-charcoal/80 transition-all hover:bg-warm-accent/50 hover:text-warm-charcoal focus:bg-transparent data-[state=open]:bg-warm-accent whitespace-nowrap">
                    Find by Criteria
                  </NavigationMenuTrigger>
                  <NavigationMenuContent className="p-0">
                    <div className="grid w-3xl grid-cols-3 gap-6 divide-x divide-warm-accent px-8 py-8">
                      <div className="flex flex-col gap-3">
                        <div className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-warm-card">
                          <GraduationCap className="h-5 w-5 text-warm-bronze" />
                        </div>
                        <h4 className="text-sm font-semibold text-warm-charcoal">By Curriculum</h4>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {['British', 'American', 'IB', 'Bilingual'].map((c) => (
                            <a
                              key={c}
                              href="#schools"
                              className="rounded-full border border-warm-accent px-2.5 py-0.5 text-xs font-medium text-warm-charcoal/80 hover:border-warm-bronze hover:text-warm-bronze transition-colors"
                            >
                              {c}
                            </a>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 pl-6">
                        <div className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-warm-card">
                          <MapPin className="h-5 w-5 text-warm-bronze" />
                        </div>
                        <h4 className="text-sm font-semibold text-warm-charcoal">By Location</h4>
                        <div className="flex flex-col gap-2 mt-1">
                          {topLocations.map(
                            (loc) => (
                              <a
                                key={loc}
                                href="#schools"
                                className="text-sm font-medium tracking-tight text-warm-charcoal/70 transition-colors hover:text-warm-bronze"
                              >
                                {loc}
                              </a>
                            )
                          )}
                        </div>
                      </div>

                      {topSchool && (
                      <div className="flex flex-col pl-6">
                        <h4 className="mb-4 text-xs text-warm-charcoal/60 uppercase">Top Ranked</h4>
                        <a
                          href="#schools"
                          className="group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl p-5 ring ring-warm-bronze/40 transition-all bg-warm-card"
                        >
                          <div>
                            <Badge
                              variant="outline"
                              className="mb-3 border-warm-accent bg-warm-cream text-warm-bronze text-xs"
                            >
                              <Star className="size-3 mr-1 fill-current" /> Top Rated
                            </Badge>
                            <h4 className="mb-1 text-sm font-semibold text-warm-charcoal">
                              {topSchool.name}
                            </h4>
                            <p className="text-xs text-warm-charcoal/70">
                              {topSchool.curriculum} curriculum · {topSchool.rating.toFixed(1)}★ · {topSchool.reviewCount.toLocaleString('en-US')} parent reviews
                            </p>
                          </div>
                          <div className="mt-3 flex items-center text-xs font-semibold text-warm-bronze">
                            View school{' '}
                            <ArrowUpRight className="ml-1 size-3.5 transition-transform group-hover:translate-x-0.5" />
                          </div>
                        </a>
                      </div>
                      )}
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                {/* AI Tools (Dropdown) */}
                <NavigationMenuItem className="hidden xl:block">
                  <NavigationMenuTrigger className="h-auto rounded-full bg-transparent px-2.5 xl:px-3 py-1.5 text-xs xl:text-sm font-medium text-warm-charcoal/80 transition-all hover:bg-warm-accent/50 hover:text-warm-charcoal focus:bg-transparent data-[state=open]:bg-warm-accent whitespace-nowrap">
                    AI Tools
                  </NavigationMenuTrigger>
                  <NavigationMenuContent className="p-0">
                    <div className="grid w-md max-w-[calc(100vw-3rem)] grid-cols-1 gap-4 px-6 py-6">
                      <a
                        href="#features"
                        className="group flex flex-col gap-3 rounded-2xl border border-warm-accent bg-warm-card p-5 hover:border-warm-bronze transition-all"
                      >
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white bg-warm-charcoal">
                          <MessageSquare className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-warm-charcoal mb-1">
                            AI School Advisor
                          </h4>
                          <p className="text-xs text-warm-charcoal/70">
                            Describe what you need and get a shortlist of schools.
                          </p>
                        </div>
                      </a>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                {/* Compare */}
                <NavigationMenuItem>
                  <NavigationMenuLink
                    href="#compare"
                    onClick={(e) => {
                      e.preventDefault();
                      onCompare?.();
                    }}
                    className="flex items-center gap-1.5 rounded-full bg-transparent px-2 xl:px-3 py-1.5 text-xs xl:text-sm font-medium text-warm-charcoal/80 transition-colors hover:text-warm-bronze cursor-pointer whitespace-nowrap"
                  >
                    <span>Compare</span>
                    {compareCount > 0 && (
                      <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full text-[10px] font-bold text-white bg-warm-bronze">
                        {compareCount}
                      </span>
                    )}
                  </NavigationMenuLink>
                </NavigationMenuItem>

                {/* Community (Visible on >= xl) */}
                <NavigationMenuItem className="hidden xl:block">
                  <NavigationMenuLink
                    href="#forum"
                    onClick={(e) => {
                      e.preventDefault();
                      onForum?.();
                    }}
                    className="rounded-full bg-transparent px-2.5 xl:px-3 py-1.5 text-xs xl:text-sm font-medium text-warm-charcoal/80 transition-colors hover:text-warm-bronze cursor-pointer whitespace-nowrap"
                  >
                    Community
                  </NavigationMenuLink>
                </NavigationMenuItem>

                {/* Scrape Management Button (Visible on >= 2xl) */}
                <NavigationMenuItem className="hidden 2xl:block">
                  <button
                    type="button"
                    onClick={onScrape || onAdmin}
                    className="flex items-center gap-1 rounded-full bg-warm-card px-2.5 py-1 text-xs font-bold text-warm-charcoal/90 border border-warm-accent transition-all hover:border-warm-bronze hover:text-warm-bronze shadow-2xs whitespace-nowrap cursor-pointer shrink-0"
                    title="Admin console"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Admin</span>
                  </button>
                </NavigationMenuItem>

                {/* ── Overflow / More Dropdown (Visible on lg to xl screens) ── */}
                <NavigationMenuItem className="block 2xl:hidden">
                  <NavigationMenuTrigger className="h-auto rounded-full bg-transparent px-2.5 py-1.5 text-xs xl:text-sm font-medium text-warm-charcoal/80 transition-all hover:bg-warm-accent/50 hover:text-warm-charcoal focus:bg-transparent data-[state=open]:bg-warm-accent whitespace-nowrap">
                    <MoreHorizontal className="size-4 mr-1 text-warm-charcoal/60" />
                    <span>More</span>
                  </NavigationMenuTrigger>
                  <NavigationMenuContent className="p-0">
                    <div className="flex flex-col gap-2 p-3 w-64 bg-warm-card rounded-2xl border border-warm-accent shadow-xl">
                      <a
                        href="#features"
                        className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-warm-cream transition-colors text-xs font-semibold text-warm-charcoal"
                      >
                        <MessageSquare className="size-4 text-warm-bronze" />
                        <span>AI School Advisor</span>
                      </a>

                      <button
                        onClick={onForum}
                        className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-warm-cream transition-colors text-xs font-semibold text-warm-charcoal text-left cursor-pointer"
                      >
                        <Star className="size-4 text-warm-bronze" />
                        <span>Community</span>
                      </button>

                      <div className="my-1 border-t border-warm-accent/60" />

                      <button
                        type="button"
                        onClick={onScrape || onAdmin}
                        className="flex items-center justify-between p-2 rounded-xl bg-warm-cream hover:bg-warm-accent/50 transition-colors text-xs font-bold text-warm-charcoal text-left cursor-pointer border border-warm-accent/50"
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Admin console
                        </span>
                      </button>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          {/* ── 3. ACTIONS (Right Side - Fully adaptive) ──────────────────────── */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Favorites Heart Icon (Visible on ALL devices) */}
            <button
              type="button"
              onClick={onFavorites}
              className="relative flex items-center justify-center rounded-full text-warm-charcoal/80 hover:text-rose-600 hover:bg-rose-50/80 p-2 transition-all cursor-pointer size-8 sm:size-9 shrink-0"
              title="Saved schools"
              aria-label="Favorites"
            >
              <Heart
                className={`size-4 sm:size-4.5 transition-transform hover:scale-110 active:scale-95 ${
                  favoritesCount > 0 ? 'text-rose-500 fill-rose-500' : ''
                }`}
              />
              {favoritesCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full text-[9px] font-bold text-white bg-rose-500 ring-2 ring-warm-cream shadow-xs">
                  {favoritesCount}
                </span>
              )}
            </button>

            {/* Quick Compare Badge on Tablet/Mobile (Visible on < lg when compareCount > 0) */}
            {compareCount > 0 && (
              <button
                type="button"
                onClick={onCompare}
                className="lg:hidden relative flex items-center justify-center rounded-full text-warm-charcoal/80 hover:bg-warm-accent/50 p-2 transition-colors cursor-pointer size-8"
                title="Compare"
                aria-label="Compare"
              >
                <GitCompare className="size-4 text-warm-bronze" />
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 px-0.5 items-center justify-center rounded-full text-[8px] font-bold text-white bg-warm-bronze">
                  {compareCount}
                </span>
              </button>
            )}

            {/* User Profile Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onLogin}
              className="rounded-full text-warm-charcoal/70 hover:bg-warm-accent/50 size-8 sm:size-8.5 shrink-0"
              title="Account"
              aria-label="User Account"
            >
              <User className="size-4" />
            </Button>

            {/* Sign Up Free (Visible on >= sm / 640px) */}
            <Button
              onClick={onSignUp}
              className="hidden sm:inline-flex rounded-full px-3.5 lg:px-4 py-1.5 text-xs xl:text-sm font-semibold text-white bg-warm-charcoal hover:bg-warm-charcoal/90 whitespace-nowrap shadow-xs transition-all shrink-0 cursor-pointer"
            >
              Sign Up Free
            </Button>

            {/* ── 4. MOBILE & TABLET DRAWER (Visible on < lg / < 1024px) ───────── */}
            <div className="lg:hidden">
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger
                  className="inline-flex items-center justify-center rounded-full p-2 text-warm-charcoal hover:bg-warm-accent/50 transition-colors cursor-pointer size-8.5"
                  aria-label="Open navigation menu"
                >
                  <Menu className="size-5" />
                </SheetTrigger>
                <SheetContent
                  side="right"
                  className="flex w-[320px] max-w-[85vw] flex-col gap-5 p-6 bg-warm-bg text-warm-charcoal border-l border-warm-accent shadow-2xl overflow-y-auto"
                >
                  {/* Drawer Logo */}
                  <div className="flex items-center gap-2 pb-2 border-b border-warm-accent/50">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white bg-warm-bronze">
                      <BookOpen className="size-4" />
                    </div>
                    <span className="text-base font-bold text-warm-charcoal">
                      Skool<span className="text-warm-bronze">ly</span>
                    </span>
                  </div>

                  {/* Drawer Navigation Links */}
                  <div className="flex flex-col gap-1.5 text-sm">
                    {/* Primary actions */}
                    <button
                      onClick={() => handleMobileNav(onHome)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-warm-cream font-medium text-warm-charcoal text-left transition-colors cursor-pointer"
                    >
                      <BookOpen className="size-4 text-warm-bronze" />
                      <span>Browse Schools</span>
                    </button>

                    <button
                      onClick={() => handleMobileNav(onCalculator)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-warm-cream font-medium text-warm-charcoal text-left transition-colors cursor-pointer"
                    >
                      <Calculator className="size-4 text-warm-bronze" />
                      <span>Cost Calculator</span>
                    </button>

                    <button
                      onClick={() => handleMobileNav(onFavorites)}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-warm-cream font-medium text-warm-charcoal text-left transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-3">
                        <Heart
                          className={`size-4 ${
                            favoritesCount > 0 ? 'text-rose-500 fill-rose-500' : 'text-warm-bronze'
                          }`}
                        />
                        <span>Saved Schools</span>
                      </span>
                      {favoritesCount > 0 && (
                        <span className="flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full text-xs font-bold text-white bg-rose-500">
                          {favoritesCount}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => handleMobileNav(onCompare)}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-warm-cream font-medium text-warm-charcoal text-left transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-3">
                        <GitCompare className="size-4 text-warm-bronze" />
                        <span>Compare</span>
                      </span>
                      {compareCount > 0 && (
                        <span className="flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full text-xs font-bold text-white bg-warm-bronze">
                          {compareCount}
                        </span>
                      )}
                    </button>

                    {/* Criteria Accordion */}
                    <Accordion className="w-full">
                      <AccordionItem value="criteria" className="border-none">
                        <AccordionTrigger className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-warm-cream font-medium text-warm-charcoal hover:no-underline">
                          <span className="flex items-center gap-3">
                            <GraduationCap className="size-4 text-warm-bronze" />
                            <span>Find by Criteria</span>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pt-1 pb-2 pl-9 pr-3 flex flex-col gap-2">
                          <span className="text-[10px] text-warm-charcoal/50 uppercase font-bold tracking-wider">
                            Curriculums
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {['British', 'American', 'IB', 'Bilingual'].map((c) => (
                              <a
                                key={c}
                                href="#schools"
                                onClick={() => setSheetOpen(false)}
                                className="px-2.5 py-1 rounded-full text-xs bg-warm-cream border border-warm-accent text-warm-charcoal/80 hover:border-warm-bronze"
                              >
                                {c}
                              </a>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>

                    {/* Community */}
                    <button
                      onClick={() => handleMobileNav(onForum)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-warm-cream font-medium text-warm-charcoal text-left transition-colors cursor-pointer"
                    >
                      <Star className="size-4 text-warm-bronze" />
                      <span>Community</span>
                    </button>

                    {/* AI Advisor */}
                    <a
                      href="#features"
                      onClick={() => setSheetOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-warm-cream font-medium text-warm-charcoal text-left transition-colors cursor-pointer"
                    >
                      <MessageSquare className="size-4 text-warm-bronze" />
                      <span>AI School Advisor</span>
                    </a>

                    {/* Scrape Management (Admin) */}
                    <div className="pt-2 mt-2 border-t border-warm-accent/50">
                      <button
                        type="button"
                        onClick={() => handleMobileNav(onScrape || onAdmin)}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-warm-cream/70 hover:bg-warm-accent/50 border border-warm-accent/60 font-semibold text-warm-charcoal text-left transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2 text-xs">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          Admin console
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Drawer Footer Buttons */}
                  <div className="mt-auto pt-4 flex flex-col gap-2.5 border-t border-warm-accent/50">
                    <Button
                      variant="outline"
                      onClick={() => handleMobileNav(onLogin)}
                      className="w-full rounded-full border-warm-accent text-warm-charcoal hover:bg-warm-cream font-semibold"
                    >
                      Log in
                    </Button>
                    <Button
                      onClick={() => handleMobileNav(onSignUp)}
                      className="w-full rounded-full bg-warm-charcoal text-white hover:bg-warm-charcoal/90 font-semibold shadow-sm"
                    >
                      Sign Up Free
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}
