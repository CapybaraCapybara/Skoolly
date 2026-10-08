import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { getSchools } from '@/api/schoolsApi';
import { useAuth } from '@/lib/auth';
import type { School } from '@/types';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu';
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
  Heart,
  GitCompare,
  LogOut,
} from 'lucide-react';
import { BrandLogo, HeaderShell, NAV_PILL_CLASS } from '@/components/layout/HeaderShell';
import { curriculumLabel, schoolNames } from '@/lib/labels';

export type NavKey = 'schools' | 'calculator' | 'community' | 'favorites';

interface NavbarProps {
  /** Page the user is on, highlighted in the bar */
  current?: NavKey | null;
  onLogin?: () => void;
  compareCount?: number;
  onCompare?: () => void;
  onCalculator?: () => void;
  onForum?: () => void;
  onHome?: () => void;
  onAdmin?: () => void;
  favoritesCount?: number;
  onFavorites?: () => void;
}

// One look for every item in the bar: links and dropdown triggers alike
const navItem = (active = false) =>
  cn(
    'h-9 rounded-full bg-transparent px-2.5 py-0 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer xl:px-3',
    'focus:bg-transparent focus-visible:bg-warm-accent/50',
    'data-open:bg-warm-card data-open:text-warm-charcoal data-popup-open:bg-warm-card data-popup-open:text-warm-charcoal',
    active
      ? 'bg-warm-card text-warm-charcoal hover:bg-warm-card focus:bg-warm-card'
      : 'text-warm-charcoal/70 hover:bg-warm-accent/50 hover:text-warm-charcoal'
  );

const iconButton =
  'relative flex size-9 shrink-0 items-center justify-center rounded-full text-warm-charcoal/70 transition-colors hover:bg-warm-accent/50 hover:text-warm-charcoal cursor-pointer';

const drawerItem =
  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left font-medium text-warm-charcoal transition-colors hover:bg-warm-cream cursor-pointer';

export function Navbar({
  current = null,
  onLogin,
  compareCount = 0,
  onCompare,
  onCalculator,
  onForum,
  onHome,
  onAdmin,
  favoritesCount = 0,
  onFavorites,
}: NavbarProps) {
  const { user, profile, signOut } = useAuth();
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

  const displayName = profile?.display_name || user?.email?.split('@')[0] || '';

  return (
    <HeaderShell adminActive={false} onToggleAdmin={onAdmin}>
      <nav aria-label="เมนูหลัก" className={NAV_PILL_CLASS}>
        <BrandLogo onClick={onHome} label="หน้าแรก Skoolly" />

        {/* ── Desktop links (>= lg) ─────────────────────────────────────────── */}
        <div className="hidden min-w-0 flex-1 items-center justify-center lg:flex">
          <NavigationMenu className="max-w-full">
            <NavigationMenuList className="flex-nowrap gap-0.5">
              <NavigationMenuItem>
                <NavigationMenuLink
                  href="#schools"
                  onClick={(e) => {
                    e.preventDefault();
                    onHome?.();
                  }}
                  className={navItem(current === 'schools')}
                >
                  รายชื่อโรงเรียน
                </NavigationMenuLink>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <NavigationMenuLink
                  href="#calculator"
                  onClick={(e) => {
                    e.preventDefault();
                    onCalculator?.();
                  }}
                  className={navItem(current === 'calculator')}
                >
                  คำนวณค่าใช้จ่าย
                </NavigationMenuLink>
              </NavigationMenuItem>

              {/* Find by Criteria (dropdown) */}
              <NavigationMenuItem>
                <NavigationMenuTrigger className={navItem()}>ค้นตามเงื่อนไข</NavigationMenuTrigger>
                <NavigationMenuContent className="p-0">
                  <div className="grid w-3xl grid-cols-3 gap-6 divide-x divide-warm-accent px-8 py-8">
                    <div className="flex flex-col gap-3">
                      <div className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-warm-card">
                        <GraduationCap className="h-5 w-5 text-warm-bronze" />
                      </div>
                      <h4 className="text-sm font-semibold text-warm-charcoal">ตามหลักสูตร</h4>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {['British', 'American', 'IB', 'Bilingual'].map((c) => (
                          <a
                            key={c}
                            href="#schools"
                            className="rounded-full border border-warm-accent px-2.5 py-0.5 text-xs font-medium text-warm-charcoal/80 transition-colors hover:border-warm-bronze hover:text-warm-bronze"
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
                      <h4 className="text-sm font-semibold text-warm-charcoal">ตามที่ตั้ง</h4>
                      <div className="mt-1 flex flex-col gap-2">
                        {topLocations.map((loc) => (
                          <a
                            key={loc}
                            href="#schools"
                            className="text-sm font-medium tracking-tight text-warm-charcoal/70 transition-colors hover:text-warm-bronze"
                          >
                            {loc}
                          </a>
                        ))}
                      </div>
                    </div>

                    {topSchool && (
                      <div className="flex flex-col pl-6">
                        <h4 className="mb-4 text-xs text-warm-charcoal/60">คะแนนสูงสุด</h4>
                        <a
                          href="#schools"
                          className="group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl bg-warm-card p-5 ring ring-warm-bronze/40 transition-all"
                        >
                          <div>
                            <Badge variant="outline" className="mb-3 border-warm-accent bg-warm-cream text-xs text-warm-bronze">
                              <Star className="mr-1 size-3 fill-current" /> คะแนนรีวิวสูง
                            </Badge>
                            <h4 className="mb-1 text-sm font-semibold text-warm-charcoal">{schoolNames(topSchool).primary}</h4>
                            <p className="text-xs text-warm-charcoal/70">
                              หลักสูตร {curriculumLabel(topSchool.curriculum)} · {topSchool.rating.toFixed(1)}★ ·{' '}
                              {topSchool.reviewCount.toLocaleString('en-US')} รีวิว
                            </p>
                          </div>
                          <div className="mt-3 flex items-center text-xs font-semibold text-warm-bronze">
                            ดูโรงเรียน{' '}
                            <ArrowUpRight className="ml-1 size-3.5 transition-transform group-hover:translate-x-0.5" />
                          </div>
                        </a>
                      </div>
                    )}
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>

              {/* AI Tools (dropdown, >= xl; folded into More below that) */}
              <NavigationMenuItem className="hidden xl:block">
                <NavigationMenuTrigger className={navItem()}>ผู้ช่วย AI</NavigationMenuTrigger>
                <NavigationMenuContent className="p-0">
                  <div className="grid w-md max-w-[calc(100vw-3rem)] grid-cols-1 gap-4 px-6 py-6">
                    <a
                      href="#features"
                      className="group flex flex-col gap-3 rounded-2xl border border-warm-accent bg-warm-card p-5 transition-all hover:border-warm-bronze"
                    >
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-warm-charcoal text-white">
                        <MessageSquare className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="mb-1 text-sm font-semibold text-warm-charcoal">ผู้ช่วยเลือกโรงเรียน</h4>
                        <p className="text-xs text-warm-charcoal/70">
                          บอกสิ่งที่ต้องการ แล้วรับรายชื่อโรงเรียนที่น่าไปดู
                        </p>
                      </div>
                    </a>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <NavigationMenuLink
                  href="#compare"
                  onClick={(e) => {
                    e.preventDefault();
                    onCompare?.();
                  }}
                  className={cn(navItem(), 'gap-1.5')}
                >
                  เปรียบเทียบ
                  {compareCount > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-warm-bronze px-1 text-[10px] font-bold text-white">
                      {compareCount}
                    </span>
                  )}
                </NavigationMenuLink>
              </NavigationMenuItem>

              {/* Community (>= xl; folded into More below that) */}
              <NavigationMenuItem className="hidden xl:block">
                <NavigationMenuLink
                  href="#forum"
                  onClick={(e) => {
                    e.preventDefault();
                    onForum?.();
                  }}
                  className={navItem(current === 'community')}
                >
                  ชุมชน
                </NavigationMenuLink>
              </NavigationMenuItem>

              {/* More (lg only): what doesn't fit */}
              <NavigationMenuItem className="xl:hidden">
                <NavigationMenuTrigger className={navItem(current === 'community')}>เพิ่มเติม</NavigationMenuTrigger>
                <NavigationMenuContent className="p-0">
                  <div className="flex w-56 flex-col gap-1 p-2">
                    <a
                      href="#features"
                      className="flex items-center gap-2.5 rounded-xl p-2 text-sm font-medium text-warm-charcoal transition-colors hover:bg-warm-card"
                    >
                      <MessageSquare className="size-4 text-warm-bronze" />
                      ผู้ช่วยเลือกโรงเรียน
                    </a>
                    <button
                      type="button"
                      onClick={onForum}
                      className="flex items-center gap-2.5 rounded-xl p-2 text-left text-sm font-medium text-warm-charcoal transition-colors hover:bg-warm-card cursor-pointer"
                    >
                      <Star className="size-4 text-warm-bronze" />
                      ชุมชน
                    </button>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        {/* ── Right side ────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onFavorites}
            className={cn(iconButton, current === 'favorites' && 'bg-warm-card text-warm-charcoal')}
            title="รายการโปรด"
            aria-label="รายการโปรด"
          >
            <Heart className={cn('size-4', favoritesCount > 0 && 'fill-rose-500 text-rose-500')} />
            {favoritesCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-warm-cream">
                {favoritesCount}
              </span>
            )}
          </button>

          {/* Compare shortcut below lg, where the Compare link is hidden */}
          {compareCount > 0 && (
            <button type="button" onClick={onCompare} className={cn(iconButton, 'lg:hidden')} title="เปรียบเทียบ" aria-label="เปรียบเทียบ">
              <GitCompare className="size-4 text-warm-bronze" />
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warm-bronze px-1 text-[9px] font-bold text-white ring-2 ring-warm-cream">
                {compareCount}
              </span>
            </button>
          )}

          {user ? (
            <div className="ml-1 flex h-9 items-center gap-2 rounded-full border border-warm-accent bg-warm-card pl-1 pr-1">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="size-7 rounded-full object-cover" />
              ) : (
                <span className="flex size-7 items-center justify-center rounded-full bg-warm-charcoal text-xs font-bold text-white">
                  {(displayName || 'U').charAt(0).toUpperCase()}
                </span>
              )}
              <span className="hidden max-w-[110px] truncate text-sm font-medium text-warm-charcoal md:inline">{displayName}</span>
              <button
                type="button"
                onClick={() => signOut()}
                className="flex size-7 items-center justify-center rounded-full text-warm-charcoal/50 transition-colors hover:bg-warm-accent hover:text-warm-charcoal cursor-pointer"
                title="ออกจากระบบ"
                aria-label="ออกจากระบบ"
              >
                <LogOut className="size-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              className="ml-1 hidden h-9 items-center rounded-full bg-warm-charcoal px-4 text-sm font-semibold text-white transition-colors hover:bg-warm-charcoal/90 sm:inline-flex cursor-pointer"
            >
              เข้าสู่ระบบ
            </button>
          )}

          {/* ── Mobile & tablet drawer (< lg) ─────────────────────────────── */}
          <div className="lg:hidden">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger className={iconButton} aria-label="เปิดเมนู">
                <Menu className="size-5" />
              </SheetTrigger>
              <SheetContent
                side="right"
                className="flex w-[320px] max-w-[85vw] flex-col gap-5 overflow-y-auto border-l border-warm-accent bg-warm-bg p-6 text-warm-charcoal shadow-2xl"
              >
                <div className="border-b border-warm-accent/50 pb-3">
                  <BrandLogo onClick={() => handleMobileNav(onHome)} label="หน้าแรก Skoolly" />
                </div>

                <div className="flex flex-col gap-1.5 text-sm">
                  <button onClick={() => handleMobileNav(onHome)} className={drawerItem}>
                    <BookOpen className="size-4 text-warm-bronze" />
                    รายชื่อโรงเรียน
                  </button>

                  <button onClick={() => handleMobileNav(onCalculator)} className={drawerItem}>
                    <Calculator className="size-4 text-warm-bronze" />
                    คำนวณค่าใช้จ่าย
                  </button>

                  <button onClick={() => handleMobileNav(onFavorites)} className={cn(drawerItem, 'justify-between')}>
                    <span className="flex items-center gap-3">
                      <Heart className={cn('size-4', favoritesCount > 0 ? 'fill-rose-500 text-rose-500' : 'text-warm-bronze')} />
                      รายการโปรด
                    </span>
                    {favoritesCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">
                        {favoritesCount}
                      </span>
                    )}
                  </button>

                  <button onClick={() => handleMobileNav(onCompare)} className={cn(drawerItem, 'justify-between')}>
                    <span className="flex items-center gap-3">
                      <GitCompare className="size-4 text-warm-bronze" />
                      เปรียบเทียบ
                    </span>
                    {compareCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-warm-bronze px-1.5 text-xs font-bold text-white">
                        {compareCount}
                      </span>
                    )}
                  </button>

                  <Accordion className="w-full">
                    <AccordionItem value="criteria" className="border-none">
                      <AccordionTrigger className="flex items-center justify-between rounded-xl px-3 py-2.5 font-medium text-warm-charcoal hover:bg-warm-cream hover:no-underline">
                        <span className="flex items-center gap-3">
                          <GraduationCap className="size-4 text-warm-bronze" />
                          ค้นตามเงื่อนไข
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="flex flex-col gap-2 pb-2 pl-9 pr-3 pt-1">
                        <span className="text-xs font-bold text-warm-charcoal/50">หลักสูตร</span>
                        <div className="flex flex-wrap gap-1.5">
                          {['British', 'American', 'IB', 'Bilingual'].map((c) => (
                            <a
                              key={c}
                              href="#schools"
                              onClick={() => setSheetOpen(false)}
                              className="rounded-full border border-warm-accent bg-warm-cream px-2.5 py-1 text-xs text-warm-charcoal/80 hover:border-warm-bronze"
                            >
                              {c}
                            </a>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>

                  <button onClick={() => handleMobileNav(onForum)} className={drawerItem}>
                    <Star className="size-4 text-warm-bronze" />
                    ชุมชน
                  </button>

                  <a href="#features" onClick={() => setSheetOpen(false)} className={drawerItem}>
                    <MessageSquare className="size-4 text-warm-bronze" />
                    ผู้ช่วยเลือกโรงเรียน
                  </a>
                </div>

                {!user && (
                  <div className="mt-auto border-t border-warm-accent/50 pt-4">
                    <button
                      type="button"
                      onClick={() => handleMobileNav(onLogin)}
                      className="w-full rounded-full bg-warm-charcoal py-2.5 text-sm font-semibold text-white transition-colors hover:bg-warm-charcoal/90 cursor-pointer"
                    >
                      เข้าสู่ระบบ
                    </button>
                  </div>
                )}
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>
    </HeaderShell>
  );
}
