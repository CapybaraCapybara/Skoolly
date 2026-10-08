import type { ReactNode } from 'react';
import { BookOpen, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

// Shared by the public Navbar and the admin header so both bars have the same size and position

export const NAV_PILL_CLASS =
  'flex h-14 min-w-0 flex-1 items-center justify-between gap-2 rounded-full border border-warm-accent bg-warm-cream pl-2 pr-2 sm:pl-3 shadow-xs';

export function BrandLogo({ onClick, label }: { onClick?: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-2 rounded-full pr-1 transition-opacity hover:opacity-85 cursor-pointer"
      aria-label={label}
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-warm-bronze text-white">
        <BookOpen className="size-4" />
      </span>
      <span className="text-lg font-bold tracking-tight text-warm-charcoal">
        Skool<span className="text-warm-bronze">ly</span>
      </span>
    </button>
  );
}

// Temporary switch between the public site and the admin console, kept outside the nav pill
function AdminModeToggle({ active, onClick }: { active: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onClick}
      title={active ? 'ออกจากโหมด Admin' : 'เข้าโหมด Admin'}
      className={cn(
        'flex h-14 shrink-0 items-center gap-2 rounded-full border bg-warm-cream px-3 text-sm font-semibold shadow-xs transition-colors cursor-pointer',
        active
          ? 'border-warm-bronze text-warm-charcoal'
          : 'border-warm-accent text-warm-charcoal/70 hover:border-warm-bronze hover:text-warm-charcoal'
      )}
    >
      <ShieldCheck className={cn('size-4', active ? 'text-warm-bronze' : 'text-warm-charcoal/50')} />
      <span className="hidden xl:inline">Admin</span>
      <span
        aria-hidden="true"
        className={cn('relative h-5 w-9 rounded-full transition-colors', active ? 'bg-warm-bronze' : 'bg-warm-accent')}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-[left]',
            active ? 'left-[1.125rem]' : 'left-0.5'
          )}
        />
      </span>
    </button>
  );
}

export function HeaderShell({
  children,
  adminActive,
  onToggleAdmin,
}: {
  children: ReactNode;
  adminActive: boolean;
  onToggleAdmin?: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 w-full bg-warm-bg/90 py-3 backdrop-blur-md">
      {/* 1440px = the admin console width, so the bar doesn't move when switching modes */}
      <div className="mx-auto flex max-w-[1440px] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        {children}
        <AdminModeToggle active={adminActive} onClick={onToggleAdmin} />
      </div>
    </header>
  );
}
