import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Calculator, Menu, Heart, GitCompare, LogOut, MessageSquare, House } from 'lucide-react';
import { BrandLogo, HeaderShell, NAV_PILL_CLASS } from '@/components/layout/HeaderShell';

export type NavKey = 'home' | 'calculator' | 'community' | 'favorites';

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

const navItem = (active = false) =>
  cn(
    'flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer xl:px-3.5',
    active ? 'bg-warm-card text-warm-charcoal' : 'text-warm-charcoal/70 hover:bg-warm-accent/50 hover:text-warm-charcoal'
  );

const iconButton =
  'relative flex size-9 shrink-0 items-center justify-center rounded-full text-warm-charcoal/70 transition-colors hover:bg-warm-accent/50 hover:text-warm-charcoal cursor-pointer';

const drawerItem =
  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left font-medium text-warm-charcoal transition-colors hover:bg-warm-cream cursor-pointer';

const countBadge = (color: string) =>
  cn('flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white', color);

/** How this session signed in ("oauth" or "password"), from the token's amr claim. app_metadata.provider
 *  is only the first method the account ever used, so an email account later linked to Google says "email". */
function sessionMethod(token?: string): string | undefined {
  try {
    const payload = JSON.parse(atob(token!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.amr?.[0]?.method;
  } catch {
    return undefined;
  }
}

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
  const { user, session, signOut } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    if (!accountOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAccountOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [accountOpen]);

  const handleMobileNav = (action?: () => void) => {
    action?.();
    setSheetOpen(false);
  };

  // Name and picture come from the sign-in itself (Google profile, or the name typed at sign-up)
  const meta = user?.user_metadata ?? {};
  const displayName: string = meta.full_name || meta.name || user?.email?.split('@')[0] || '';
  const avatarUrl: string | undefined = meta.avatar_url || meta.picture;
  const signedInWith = sessionMethod(session?.access_token) === 'oauth' ? 'Google' : 'อีเมลและรหัสผ่าน';

  // In the order parents use the site: find schools, save them, compare, work out the cost, ask others
  const links: { key: NavKey | 'compare'; label: string; icon: typeof House; onClick?: () => void; count?: number; countColor?: string }[] = [
    { key: 'home', label: 'หน้าแรก', icon: House, onClick: onHome },
    { key: 'favorites', label: 'รายการโปรด', icon: Heart, onClick: onFavorites, count: favoritesCount, countColor: 'bg-rose-500' },
    { key: 'compare', label: 'เปรียบเทียบ', icon: GitCompare, onClick: onCompare, count: compareCount, countColor: 'bg-warm-bronze' },
    { key: 'calculator', label: 'คำนวณค่าใช้จ่าย', icon: Calculator, onClick: onCalculator },
    { key: 'community', label: 'ชุมชน', icon: MessageSquare, onClick: onForum },
  ];

  return (
    <HeaderShell adminActive={false} onToggleAdmin={onAdmin}>
      <nav aria-label="เมนูหลัก" className={NAV_PILL_CLASS}>
        <BrandLogo onClick={onHome} label="หน้าแรก Skoolly" />

        <div className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex">
          {links.map(({ key, label, icon: Icon, onClick, count, countColor }) => {
            const active = current === key;
            return (
              <button
                key={key}
                type="button"
                onClick={onClick}
                className={navItem(active)}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className={cn('size-4', active ? 'text-warm-bronze' : 'text-warm-charcoal/45')} />
                {label}
                {!!count && <span className={countBadge(countColor!)}>{count}</span>}
              </button>
            );
          })}
        </div>

        {/* ── Right side ────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Favorites and compare shortcuts on small screens, where the links are in the drawer */}
          <button
            type="button"
            onClick={onFavorites}
            className={cn(iconButton, 'lg:hidden', current === 'favorites' && 'bg-warm-card text-warm-charcoal')}
            title="รายการโปรด"
            aria-label="รายการโปรด"
          >
            <Heart className={cn('size-4', favoritesCount > 0 && 'fill-rose-500 text-rose-500')} />
            {favoritesCount > 0 && (
              <span className={cn(countBadge('bg-rose-500'), 'absolute -right-0.5 -top-0.5 text-[9px] ring-2 ring-warm-cream')}>
                {favoritesCount}
              </span>
            )}
          </button>

          {compareCount > 0 && (
            <button type="button" onClick={onCompare} className={cn(iconButton, 'lg:hidden')} title="เปรียบเทียบ" aria-label="เปรียบเทียบ">
              <GitCompare className="size-4 text-warm-bronze" />
              <span className={cn(countBadge('bg-warm-bronze'), 'absolute -right-0.5 -top-0.5 text-[9px] ring-2 ring-warm-cream')}>
                {compareCount}
              </span>
            </button>
          )}

          {user ? (
            <div className="relative ml-1">
              <button
                type="button"
                onClick={() => setAccountOpen((o) => !o)}
                aria-expanded={accountOpen}
                aria-haspopup="dialog"
                className="flex h-9 items-center gap-2 rounded-full border border-warm-accent bg-warm-card pl-1 pr-1 transition-colors hover:bg-warm-accent/50 cursor-pointer md:pr-3"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="size-7 rounded-full object-cover" />
                ) : (
                  <span className="flex size-7 items-center justify-center rounded-full bg-warm-charcoal text-xs font-bold text-white">
                    {(displayName || 'U').charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="hidden max-w-[110px] truncate text-sm font-medium text-warm-charcoal md:inline">{displayName}</span>
              </button>
              {accountOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAccountOpen(false)} aria-hidden="true" />
                  <div
                    role="dialog"
                    aria-label="บัญชีของฉัน"
                    className="absolute right-0 top-11 z-50 w-64 rounded-2xl border border-warm-accent bg-warm-card p-4 shadow-lg"
                  >
                    <div className="truncate font-semibold text-warm-charcoal">{displayName}</div>
                    {user.email && <div className="truncate text-sm text-warm-charcoal/60">{user.email}</div>}
                    <div className="mt-3 text-xs text-warm-charcoal/60">เข้าสู่ระบบด้วย {signedInWith}</div>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        signOut();
                      }}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-warm-accent py-2 text-sm font-medium text-warm-charcoal transition-colors hover:bg-warm-accent/50 cursor-pointer"
                    >
                      <LogOut className="size-4" />
                      ออกจากระบบ
                    </button>
                  </div>
                </>
              )}
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

          {/* ── Drawer on small screens (< lg) ─────────────────────────────── */}
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
                  {links.map(({ key, label, icon: Icon, onClick, count, countColor }) => (
                    <button
                      key={key}
                      onClick={() => handleMobileNav(onClick)}
                      className={cn(drawerItem, 'justify-between', current === key && 'bg-warm-card')}
                      aria-current={current === key ? 'page' : undefined}
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="size-4 text-warm-bronze" />
                        {label}
                      </span>
                      {!!count && <span className={countBadge(countColor!)}>{count}</span>}
                    </button>
                  ))}
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
