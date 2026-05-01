// src/components/wellness/FoodPlaybookLibrary.tsx
//
// "Browse Full Library" modal for the Food Playbook tab. Shows ALL meals the
// user is eligible to eat (filtered by their life_context), grouped by playbook,
// with meal-type tabs, search, and PDF export. Stays client-side — no LLM
// involvement, no extra cost. Designed to give users 60-90 options so they
// stop having to regenerate every 3 days.
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import { useAuthStore } from '../../store/authStore';
import { getEligibleMeals } from '../../lib/foodEligibility';
import type { MealEntry, Playbook, MealSlot } from '../../data/foodPlaybook';

const PLAYBOOK_META: Record<Playbook, { label: string; sub: string; emoji: string; color: string }> = {
  convenience_store: { label: 'Convenience Store Grabs', sub: 'Wawa, 7-Eleven, gas stations, truck stops', emoji: '🏪', color: '#7B1FA2' },
  fast_food: { label: 'Fast-Food Smart Orders', sub: 'Real chains, real orders — protein-doubled', emoji: '🍔', color: '#E8922A' },
  protein_bar_shake: { label: 'Bars & Shakes', sub: 'Real brands, anywhere in 60 sec', emoji: '🍫', color: '#C94F4F' },
  crock_pot: { label: 'Crock Pot Set-and-Forget', sub: 'Throw it in, eats for the week', emoji: '🍲', color: '#5E8C61' },
  sheet_pan: { label: 'Sheet-Pan / One-Pan', sub: '5 ingredients, zero cleanup', emoji: '🥘', color: '#D4A574' },
  frozen_aisle: { label: 'Frozen Aisle Wins', sub: 'Costco, Trader Joe\'s, Aldi specifics', emoji: '❄️', color: '#1B423A' },
  frozen_breakfast: { label: 'Frozen Breakfast Sandwiches', sub: 'Microwave, eat, go', emoji: '🥪', color: '#A2845E' },
  low_cal_drink: { label: 'Drink Swaps', sub: 'Replace soda + sweet coffee', emoji: '🥤', color: '#2A9D8F' },
  mom_friendly: { label: 'Kid-Tested + Adult-Friendly', sub: 'Same plate, parent gets the protein', emoji: '🧒', color: '#B5651D' },
  viral_hack: { label: 'Viral Hacks That Actually Work', sub: 'TikTok-tested, lab-targeted', emoji: '📱', color: '#9B59B6' },
  lunchbox_thermos: { label: 'Lunchbox / Cooler / Thermos', sub: 'Driver, construction, shift work', emoji: '🧊', color: '#1F77B4' },
  simple_home_cook: { label: 'Simple Home Cook', sub: 'Real recipes, still grocery-store basic', emoji: '🍳', color: '#1B4332' },
  travel_hotel: { label: 'Travel & Hotel', sub: 'Airport, road trip, hotel mini-fridge hacks', emoji: '✈️', color: '#3D5A80' },
  dorm_no_stove: { label: 'Dorm / No-Stove', sub: 'Microwave + mini-fridge only', emoji: '🛏️', color: '#7C3AED' },
  protein_dessert: { label: 'Protein Desserts', sub: 'Sweet-tooth swaps that hit macros', emoji: '🍦', color: '#EC4899' },
  international: { label: 'International Flavors', sub: 'Pho, curry, bibimbap, ceviche', emoji: '🌍', color: '#0D9488' },
  big_box_grocery: { label: 'Costco / Walmart / Aldi', sub: 'Big-box hauls + ready-to-eat staples', emoji: '🛒', color: '#475569' },
};
const PLAYBOOK_ORDER: Playbook[] = [
  'convenience_store', 'fast_food', 'big_box_grocery', 'protein_bar_shake', 'frozen_aisle',
  'travel_hotel', 'dorm_no_stove', 'protein_dessert', 'international',
  'frozen_breakfast', 'lunchbox_thermos', 'sheet_pan', 'crock_pot',
  'simple_home_cook', 'mom_friendly', 'viral_hack', 'low_cal_drink',
];

type SlotFilter = 'all' | MealSlot;
const SLOT_TABS: { id: SlotFilter; label: string; emoji: string }[] = [
  { id: 'all', label: 'All', emoji: '📋' },
  { id: 'breakfast', label: 'Breakfast', emoji: '🥚' },
  { id: 'lunch', label: 'Lunch', emoji: '🥪' },
  { id: 'dinner', label: 'Dinner', emoji: '🍽️' },
  { id: 'snack', label: 'Snack & Drinks', emoji: '🍪' },
];

interface Props { open: boolean; onClose: () => void }

export const FoodPlaybookLibrary = ({ open, onClose }: Props) => {
  const profile = useAuthStore(s => s.profile);
  const [slot, setSlot] = useState<SlotFilter>('all');
  const [query, setQuery] = useState('');

  // Lock body scroll when open
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const allEligible = useMemo(() => {
    return getEligibleMeals({
      lifeContext: profile?.lifeContext ?? undefined,
      diet: (profile?.lifestyle as any)?.dietType ?? 'standard',
    });
  }, [profile?.lifeContext, profile?.lifestyle]);

  const filtered = useMemo(() => {
    let list = allEligible;
    if (slot !== 'all') list = list.filter(m => m.when === slot);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.ingredients.some(i => i.toLowerCase().includes(q))
      );
    }
    return list;
  }, [allEligible, slot, query]);

  const grouped = useMemo(() => {
    const map = new Map<Playbook, MealEntry[]>();
    for (const m of filtered) {
      if (!map.has(m.playbook)) map.set(m.playbook, []);
      map.get(m.playbook)!.push(m);
    }
    return PLAYBOOK_ORDER.filter(k => map.has(k)).map(k => ({ key: k, meals: map.get(k)! }));
  }, [filtered]);

  const exportPDF = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = margin;
    const ensureSpace = (need: number) => {
      if (y + need > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
    };
    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(27, 66, 58);
    doc.text('Your CauseHealth Food Playbook', margin, y);
    y += 24;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100);
    const userName = profile?.firstName ? `${profile.firstName} · ` : '';
    doc.text(`${userName}${filtered.length} meal${filtered.length === 1 ? '' : 's'} matched to your life — ${new Date().toLocaleDateString()}`, margin, y);
    y += 18;
    doc.setFontSize(9);
    doc.text('Real chain orders, frozen-aisle wins, lunchbox hacks, viral picks. Eat from this list — no recipe required.', margin, y);
    y += 24;

    for (const group of grouped) {
      const meta = PLAYBOOK_META[group.key];
      ensureSpace(40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(27, 66, 58);
      doc.text(`${meta.emoji}  ${meta.label}  (${group.meals.length})`, margin, y);
      y += 14;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(120);
      doc.text(meta.sub, margin, y);
      y += 14;

      for (const m of group.meals) {
        ensureSpace(54);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(40);
        const nameLines = doc.splitTextToSize(`• ${m.name}`, pageWidth - margin * 2);
        for (const line of nameLines) { doc.text(line, margin, y); y += 12; }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(90);
        const meta2 = `${m.when} · ${m.prepMinutes === 0 ? 'no prep' : `${m.prepMinutes} min`}${m.protein_g ? ` · ~${m.protein_g}g protein` : ''}`;
        doc.text(meta2, margin + 12, y);
        y += 10;
        doc.setTextColor(120);
        const ing = doc.splitTextToSize(m.ingredients.slice(0, 6).join(' · '), pageWidth - margin * 2 - 12);
        for (const line of ing) { doc.text(line, margin + 12, y); y += 10; }
        y += 4;
      }
      y += 8;
    }

    // Footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(`Page ${i} of ${totalPages} · CauseHealth Food Playbook`, margin, doc.internal.pageSize.getHeight() - 24);
    }
    doc.save('causehealth-food-playbook.pdf');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose}>
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30 }}
            className="absolute bottom-0 left-0 right-0 top-12 bg-clinical-cream rounded-t-[20px] shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 border-b border-outline-variant/15 flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#D4A574] mb-1">Browse the Full Library</p>
                <h2 className="text-authority text-2xl text-clinical-charcoal font-bold">Your Food Playbook</h2>
                <p className="text-body text-clinical-stone text-sm mt-1">{allEligible.length} meals you can actually eat — filtered to your life. Save it. Share it. Print it.</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={exportPDF} className="inline-flex items-center gap-1.5 text-precision text-[0.65rem] font-bold tracking-widest uppercase px-3 py-2 bg-gradient-to-br from-[#1B423A] to-[#0F2A24] hover:from-[#244F46] hover:to-[#163730] text-[#D4A574] rounded-[8px] transition-all">
                  <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
                  Export PDF
                </button>
                <button onClick={onClose} aria-label="Close" className="text-clinical-stone hover:text-clinical-charcoal transition-colors p-2">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="p-5 border-b border-outline-variant/15 space-y-3">
              <div className="flex gap-1 bg-[#131313] rounded-[10px] p-1 overflow-x-auto">
                {SLOT_TABS.map(t => (
                  <button key={t.id} onClick={() => setSlot(t.id)}
                    className={`flex-1 min-w-fit flex items-center justify-center gap-1.5 py-2 px-3 text-precision text-[0.6rem] tracking-wider uppercase font-bold transition-all ${slot === t.id ? 'bg-primary-container text-white rounded-lg' : 'text-on-surface-variant hover:text-white'}`}>
                    <span>{t.emoji}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
              <div className="relative">
                <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Search by meal name, ingredient, or chain (e.g. Wawa, salmon, crock pot)…"
                  className="w-full pl-10 pr-4 py-2.5 bg-clinical-white border border-outline-variant/20 text-clinical-charcoal placeholder-clinical-stone/50 text-body text-sm focus:border-primary-container focus:outline-none transition-colors rounded-[8px]" />
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-clinical-stone text-[16px]">search</span>
              </div>
              <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">
                Showing {filtered.length} of {allEligible.length} eligible meals
              </p>
            </div>

            {/* Body — meals grouped by playbook */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {grouped.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-body text-clinical-stone text-sm mb-2">No meals match your filters.</p>
                  <p className="text-body text-clinical-stone text-xs">Try clearing the search or switching tabs.</p>
                </div>
              ) : grouped.map(g => {
                const meta = PLAYBOOK_META[g.key];
                return (
                  <div key={g.key}>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl flex-shrink-0">{meta.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-clinical-charcoal">{meta.label}</p>
                        <p className="text-precision text-[0.6rem] text-clinical-stone">{meta.sub}</p>
                      </div>
                      <span className="text-precision text-[0.55rem] text-clinical-stone tracking-widest">{g.meals.length}</span>
                    </div>
                    <div className="space-y-2">
                      {g.meals.map(m => (
                        <div key={m.id} className="bg-clinical-white border-l-2 rounded-[10px] p-4" style={{ borderLeftColor: meta.color }}>
                          <div className="flex items-start gap-3">
                            <span className="text-2xl flex-shrink-0">{m.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                                <p className="text-body text-clinical-charcoal font-semibold leading-snug">{m.name}</p>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <span className="text-precision text-[0.55rem] font-bold tracking-widest uppercase text-primary-container">{m.when}</span>
                                  {m.prepMinutes > 0 && (
                                    <span className="text-precision text-[0.55rem] text-clinical-stone tracking-wide">{m.prepMinutes}min</span>
                                  )}
                                </div>
                              </div>
                              <p className="text-body text-clinical-stone text-xs">{m.ingredients.slice(0, 6).join(' · ')}</p>
                              {m.protein_g && (
                                <p className="text-precision text-[0.6rem] text-[#1B423A] tracking-wide mt-1">~{m.protein_g}g protein</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
