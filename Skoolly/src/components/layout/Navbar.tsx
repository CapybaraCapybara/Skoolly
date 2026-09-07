import { cn } from '@/lib/utils';
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
}: NavbarProps) {
  return (
    <div className="relative w-full py-4 bg-warm-bg/95 border-b border-warm-accent/30" style={{ backdropFilter: 'blur(12px)' }}>
      <div className="mx-auto flex max-w-7xl items-center justify-center px-4 sm:px-6">
        {/* Floating Navbar Pill */}
        <div className="flex h-16 w-full max-w-6xl items-center justify-between gap-1 xl:gap-2 rounded-full border border-warm-accent bg-warm-cream px-3 sm:px-4 shadow-sm">
          {/* Logo */}
          <button onClick={onHome} className="flex items-center gap-2 pr-2 pl-2 sm:pl-3 hover:opacity-80 transition-opacity shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white bg-warm-bronze">
              <BookOpen className="size-4" />
            </div>
            <span className="text-base font-bold tracking-tight text-warm-charcoal">
              Skool<span className="text-warm-bronze">ly</span>
            </span>
          </button>

          {/* Desktop & Tablet Navigation */}
          <div className="hidden md:block">
            <NavigationMenu
              className={cn(
                'static',
                '[&>div:last-child]:inset-x-0 [&>div:last-child]:top-full [&>div:last-child]:w-full',
                '[&_[data-slot=navigation-menu-viewport]]:mx-auto [&_[data-slot=navigation-menu-viewport]]:-mt-6 [&_[data-slot=navigation-menu-viewport]]:max-w-[calc(100vw-2rem)] [&_[data-slot=navigation-menu-viewport]]:md:max-w-3xl [&_[data-slot=navigation-menu-viewport]]:lg:max-w-4xl [&_[data-slot=navigation-menu-viewport]]:ring-0',
                '[&_[data-slot=navigation-menu-viewport]]:rounded-[2rem] [&_[data-slot=navigation-menu-viewport]]:border [&_[data-slot=navigation-menu-viewport]]:border-warm-accent',
                '[&_[data-slot=navigation-menu-viewport]]:bg-warm-cream [&_[data-slot=navigation-menu-viewport]]:shadow-2xl',
                '[&_[data-slot=navigation-menu-viewport]]:transition-all [&_[data-slot=navigation-menu-viewport]]:duration-300 [&_[data-slot=navigation-menu-viewport]]:ease-in-out',
              )}
            >
              <NavigationMenuList className="gap-0.5 lg:gap-1 flex-nowrap">
                <NavigationMenuItem>
                  <NavigationMenuLink
                    className="rounded-full bg-transparent px-2 lg:px-2.5 xl:px-3 py-1.5 text-[11px] md:text-xs xl:text-sm font-medium text-warm-charcoal/80 transition-colors hover:text-warm-bronze cursor-pointer whitespace-nowrap"
                    href="#schools"
                    onClick={(e) => {
                      e.preventDefault();
                      onHome?.();
                    }}
                  >
                    Browse Schools
                  </NavigationMenuLink>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuLink
                    href="#calculator"
                    onClick={(e) => {
                      e.preventDefault();
                      onCalculator?.();
                    }}
                    className="rounded-full bg-transparent px-2 lg:px-2.5 xl:px-3 py-1.5 text-[11px] md:text-xs xl:text-sm font-medium text-warm-charcoal/80 transition-colors hover:text-warm-bronze cursor-pointer whitespace-nowrap"
                  >
                    Cost Calculator
                  </NavigationMenuLink>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuTrigger className="h-auto rounded-full bg-transparent px-2 lg:px-2.5 xl:px-3 py-1.5 text-[11px] md:text-xs xl:text-sm font-medium text-warm-charcoal/80 transition-all hover:bg-warm-accent/50 hover:text-warm-charcoal focus:bg-transparent data-[state=open]:bg-warm-accent whitespace-nowrap">
                    Find by Criteria
                  </NavigationMenuTrigger>
                  <NavigationMenuContent className="p-0">
                    <div className="grid w-3xl grid-cols-3 gap-6 divide-x divide-warm-accent px-8 py-8">
                      <div className="flex flex-col gap-3">
                        <div className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-warm-card">
                          <GraduationCap className="h-5 w-5 text-warm-bronze" />
                        </div>
                        <h4 className="text-sm font-semibold text-warm-charcoal">By Curriculum</h4>
                        <p className="text-xs text-warm-charcoal/70">Filter by British, American, IB, French, or bilingual programmes.</p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {['British', 'American', 'IB', 'Bilingual'].map((c) => (
                            <a key={c} href="#schools" className="rounded-full border border-warm-accent px-2.5 py-0.5 text-xs font-medium text-warm-charcoal/80 hover:border-warm-bronze hover:text-warm-bronze transition-colors">{c}</a>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 pl-6">
                        <div className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-warm-card">
                          <MapPin className="h-5 w-5 text-warm-bronze" />
                        </div>
                        <h4 className="text-sm font-semibold text-warm-charcoal">By Location</h4>
                        <div className="flex flex-col gap-2 mt-1">
                          {['Sukhumvit / Asok', 'Riverside / Silom', 'Lat Phrao / Ladprao', 'Nonthaburi'].map((loc) => (
                            <a key={loc} href="#schools" className="text-sm font-medium tracking-tight text-warm-charcoal/70 transition-colors hover:text-warm-bronze">{loc}</a>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col pl-6">
                        <h4 className="mb-4 text-xs text-warm-charcoal/60 uppercase">Top Ranked</h4>
                        <a
                          href="#schools"
                          className="group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl p-5 ring ring-warm-bronze/40 transition-all"
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-warm-bronze/5 via-transparent to-transparent" />
                          <div className="absolute inset-0 -z-10 bg-warm-card" />
                          <div>
                            <Badge variant="outline" className="mb-3 border-warm-accent bg-warm-cream text-warm-bronze text-xs">
                              <Star className="size-3 mr-1 fill-current" /> Editor's Pick
                            </Badge>
                            <h4 className="mb-1.5 text-sm font-semibold text-warm-charcoal">Bangkok Patana School</h4>
                            <p className="text-xs tracking-tight text-warm-charcoal/70">British curriculum · 4.8★ · 312 parent reviews</p>
                          </div>
                          <div className="mt-4 flex items-center text-xs font-semibold text-warm-bronze">
                            View school <ArrowUpRight className="ml-1 size-3.5 transition-transform group-hover:translate-x-0.5" />
                          </div>
                        </a>
                      </div>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuTrigger className="h-auto rounded-full bg-transparent px-2 lg:px-2.5 xl:px-3 py-1.5 text-[11px] md:text-xs xl:text-sm font-medium text-warm-charcoal/80 transition-all hover:bg-warm-accent/50 hover:text-warm-charcoal focus:bg-transparent data-[state=open]:bg-warm-accent whitespace-nowrap">
                    AI Tools
                  </NavigationMenuTrigger>
                  <NavigationMenuContent className="p-0">
                    <div className="grid w-md max-w-[calc(100vw-3rem)] grid-cols-1 gap-4 px-6 py-6">
                      <a href="#features" className="group flex flex-col gap-3 rounded-2xl border border-warm-accent bg-warm-card p-5 hover:border-warm-bronze transition-all">
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white bg-warm-charcoal">
                          <MessageSquare className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-semibold text-warm-charcoal">AI School Advisor</h4>
                            <Badge className="bg-warm-accent text-warm-charcoal text-[10px] px-1.5 rounded-full hover:bg-warm-accent">Free</Badge>
                          </div>
                          <p className="text-xs text-warm-charcoal/70">Chat with AI to get a personalised school shortlist based on your child's needs.</p>
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
                    className="flex items-center gap-1 rounded-full bg-transparent px-1.5 lg:px-2 xl:px-3 py-1.5 text-[11px] md:text-xs xl:text-sm font-medium text-warm-charcoal/80 transition-colors hover:text-warm-bronze cursor-pointer whitespace-nowrap"
                  >
                    Compare
                    {compareCount > 0 && (
                      <span className="flex h-3.5 w-3.5 lg:h-4 lg:w-4 items-center justify-center rounded-full text-[9px] lg:text-[10px] font-bold text-white bg-warm-bronze">
                        {compareCount}
                      </span>
                    )}
                  </NavigationMenuLink>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuLink
                    href="#forum"
                    onClick={(e) => {
                      e.preventDefault();
                      onForum?.();
                    }}
                    className="rounded-full bg-transparent px-1.5 lg:px-2 xl:px-3 py-1.5 text-[11px] md:text-xs xl:text-sm font-medium text-warm-charcoal/80 transition-colors hover:text-warm-bronze cursor-pointer whitespace-nowrap"
                  >
                    Community
                  </NavigationMenuLink>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <button
                    type="button"
                    onClick={onScrape || onAdmin}
                    className="flex items-center gap-1 rounded-full bg-warm-card px-2 lg:px-2.5 xl:px-3 py-1 text-[11px] md:text-xs font-bold text-warm-charcoal/90 border border-warm-accent transition-all hover:border-warm-bronze hover:text-warm-bronze shadow-2xs whitespace-nowrap cursor-pointer shrink-0"
                    title="Scrape Management (Admin)"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Scrape</span>
                    <span className="hidden sm:inline text-[9px] uppercase tracking-wider font-extrabold px-1 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300">Admin</span>
                  </button>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="hidden items-center gap-1 sm:flex">
              <Button
                variant="ghost"
                size="icon"
                onClick={onLogin}
                className="rounded-full text-warm-charcoal/70 hover:bg-warm-accent/50 size-8"
              >
                <User className="size-4" />
              </Button>
            </div>
            <Button
              onClick={onSignUp}
              className="hidden rounded-full px-3 lg:px-3.5 xl:px-4 py-1.5 text-xs xl:text-sm font-semibold text-white md:block bg-warm-charcoal hover:bg-warm-charcoal/90 whitespace-nowrap"
            >
              Sign Up Free
            </Button>


            {/* Mobile (only on < md) */}
            <div className="md:hidden">
              <Sheet>
                <SheetTrigger className="inline-flex items-center justify-center rounded-full p-2 text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors">
                  <Menu className="size-5" />
                </SheetTrigger>
                <SheetContent side="right" className="flex w-[300px] flex-col gap-6 p-6 dark:bg-neutral-950">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ background: 'linear-gradient(135deg,#0f9488,#152d55)' }}>
                      <BookOpen className="size-4" />
                    </div>
                    <span className="text-base font-bold text-neutral-900 dark:text-white">
                      Skool<span className="text-teal-500">ly</span>
                    </span>
                  </div>

                  <div className="flex flex-col gap-4">
                    <button onClick={onHome} className="text-left text-base font-medium text-neutral-900 dark:text-neutral-50">
                      Browse Schools
                    </button>

                    <button
                      onClick={onCalculator}
                      className="text-left text-base font-medium text-neutral-900 dark:text-neutral-50"
                    >
                      Cost Calculator
                    </button>

                    <Accordion className="w-full">
                      <AccordionItem value="criteria" className="border-none">
                        <AccordionTrigger className="justify-between py-0 text-base font-medium text-neutral-900 hover:no-underline dark:text-neutral-50">
                          Find by Criteria
                        </AccordionTrigger>
                        <AccordionContent className="mt-1 ml-2 flex !h-auto flex-col gap-3 border-l border-neutral-200 pb-0 pl-4 dark:border-neutral-800 [&_a]:no-underline">
                          <div className="flex flex-col gap-2 pt-3">
                            <span className="text-xs text-neutral-400 uppercase">Curriculum</span>
                            {['British', 'American', 'IB', 'Bilingual'].map((c) => (
                              <a key={c} href="#schools" className="text-sm font-medium text-neutral-600 hover:text-teal-600 dark:text-neutral-300">{c}</a>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                      <AccordionItem value="ai" className="border-none mt-2">
                        <AccordionTrigger className="justify-between py-0 text-base font-medium text-neutral-900 hover:no-underline dark:text-neutral-50">
                          AI Tools
                        </AccordionTrigger>
                        <AccordionContent className="mt-1 ml-2 flex !h-auto flex-col gap-2 border-l border-neutral-200 pb-0 pl-4 dark:border-neutral-800 [&_a]:no-underline">
                          <div className="flex flex-col gap-2 pt-3">
                            <a href="#features" className="text-sm font-medium text-neutral-600 hover:text-teal-600 dark:text-neutral-300">AI School Advisor</a>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>


                    <button onClick={onCompare} className="text-left text-base font-medium text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
                      Compare Schools
                      {compareCount > 0 && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: '#0f9488' }}>
                          {compareCount}
                        </span>
                      )}
                    </button>
                    <button onClick={onForum} className="text-left text-base font-medium text-neutral-900 dark:text-neutral-50">
                      Community
                    </button>
                    <button type="button" onClick={onScrape || onAdmin} className="text-left text-base font-semibold text-warm-charcoal hover:text-warm-bronze flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Scrape Management
                      </span>
                      <span className="text-[10px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">Admin</span>
                    </button>
                  </div>

                  <div className="mt-auto flex flex-col gap-3">
                    <button onClick={onLogin} className="w-full rounded-full border border-neutral-200 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors">Log in</button>
                    <button onClick={onSignUp} className="w-full rounded-full py-2 text-sm font-semibold text-white transition-all hover:opacity-90" style={{ background: 'linear-gradient(135deg,#0f9488,#152d55)' }}>
                      Sign Up Free
                    </button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
