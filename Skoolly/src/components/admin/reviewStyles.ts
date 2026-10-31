// One look for every section of the admin "รอตรวจ" page, taken from the fee-draft cards
export const review = {
  card: "bg-warm-cream border border-warm-accent hover:border-amber-400/60 rounded-[2rem] p-5 sm:p-6 shadow-xs transition-all",
  row: "flex flex-col lg:flex-row lg:items-center justify-between gap-5",
  monogram:
    "w-12 h-12 rounded-2xl bg-warm-cream border border-warm-accent flex items-center justify-center shrink-0 text-warm-bronze font-bold text-sm",
  chipAmber: "px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[11px] font-bold",
  chipGreen: "px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200",
  meta: "text-xs text-[#78716c]",
  title: "text-base font-bold text-warm-charcoal",
  details: "flex flex-wrap items-center gap-3 pt-1 text-xs text-[#57534e]",
  label: "text-[#a8a29e]",
  actions: "flex flex-wrap items-center gap-2 shrink-0 self-end lg:self-center",
  linkIcon:
    "p-2.5 rounded-xl bg-warm-cream hover:bg-warm-accent text-[#78716c] hover:text-warm-charcoal transition-all border border-warm-accent",
  btnNavy:
    "px-4 py-2.5 rounded-full bg-warm-charcoal hover:bg-black text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50",
  btnGreen:
    "px-3.5 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50",
  btnRose:
    "px-3 py-2.5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50",
  btnOutline:
    "px-4 py-2.5 rounded-full bg-white border border-warm-accent hover:border-warm-bronze text-warm-charcoal text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50",
  toolbarBtn:
    "px-3.5 py-2 rounded-full bg-warm-cream border border-warm-accent hover:border-warm-bronze text-warm-charcoal text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50",
  empty: "bg-warm-cream border border-warm-accent rounded-[2rem] p-12 text-center shadow-xs space-y-4",
  emptyIcon:
    "w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto",
};

/** Province initials for the card's square, as the fee-draft cards show */
export const placeInitials = (province?: string | null) => (province ? province.substring(0, 2) : "รร");
