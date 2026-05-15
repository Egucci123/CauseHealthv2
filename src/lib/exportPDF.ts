// src/lib/exportPDF.ts
import jsPDF from 'jspdf';
import type { WellnessPlanData } from '../hooks/useWellnessPlan';
import type { DoctorPrepDocument, TestToRequest } from '../hooks/useDoctorPrep';
import { format } from 'date-fns';

// ── Specialist routing for test grouping ───────────────────────────────
// Mirrors the on-screen Wellness Plan grouping (5 buckets: PCP / GI /
// Imaging / Functional / Mental Health). Legacy specialist keys collapse
// into the simplified set so old plans render correctly.
const SPECIALIST_TITLES: Record<string, string> = {
  pcp:           'Tests to ask your PCP for',
  gi:            'Tests at your GI follow-up',
  imaging:       'Imaging to schedule',
  functional:    'Cash-pay / functional MD',
  mental_health: 'Mental health screening',
};
const SPECIALIST_COLLAPSE: Record<string, string> = {
  cardiology: 'pcp', endocrinology: 'pcp', hepatology: 'pcp',
  rheumatology: 'pcp', nephrology: 'pcp', hematology: 'pcp',
  sleep_medicine: 'imaging',
};
const SPECIALIST_ORDER = ['pcp', 'gi', 'imaging', 'functional', 'mental_health'] as const;

/** Group tests_to_request by specialist, in display order. Returns only
 *  buckets that have at least one test. */
function groupTestsBySpecialist(tests: TestToRequest[]): Array<{ key: string; title: string; items: TestToRequest[] }> {
  const buckets: Record<string, TestToRequest[]> = {};
  for (const t of tests ?? []) {
    const raw = String((t as any).specialist ?? 'pcp');
    const key = SPECIALIST_COLLAPSE[raw] ?? raw;
    (buckets[key] ??= []).push(t);
  }
  return SPECIALIST_ORDER
    .filter(k => buckets[k]?.length)
    .map(k => ({ key: k, title: SPECIALIST_TITLES[k] ?? 'Tests to discuss', items: buckets[k] }));
}

export function exportWellnessPlanPDF(plan: WellnessPlanData, userName: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = margin;

  const checkPage = (needed = 20) => { if (y + needed > pageH - margin) { doc.addPage(); y = margin; } };

  // 2026-05-14: section header with optional accent color for safety
  // banners (red) vs standard sections (green). Same helper used for
  // every section so the PDF matches the on-screen visual rhythm.
  const addSection = (title: string, accent: [number, number, number] = [27, 67, 50]) => {
    y += 6; checkPage(15);
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.rect(margin, y - 4, contentW, 8, 'F');
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), margin + 3, y + 1); y += 8;
  };
  // Body paragraph helper — sets standard text style + line height.
  const para = (text: string, opts: { size?: number; indent?: number; italic?: boolean } = {}) => {
    if (!text) return;
    const size = opts.size ?? 9;
    const indent = opts.indent ?? 0;
    doc.setFontSize(size);
    doc.setFont('helvetica', opts.italic ? 'italic' : 'normal');
    doc.setTextColor(26, 26, 26);
    const lines = doc.splitTextToSize(stripUnsupportedChars(text), contentW - indent);
    checkPage(lines.length * (size * 0.42) + 4);
    doc.text(lines, margin + indent, y);
    y += lines.length * (size * 0.42) + 2;
  };

  // ── Header ─────────────────────────────────────────────────────────
  doc.setFillColor(19, 19, 19); // #131313
  doc.rect(0, 0, pageW, 35, 'F');
  doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('CauseHealth.', margin, 18);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(165, 208, 185);
  doc.text('PERSONALIZED WELLNESS PLAN', margin, 26);
  doc.setTextColor(107, 107, 107);
  const headerMeta = `Generated ${format(new Date(plan.generated_at), 'MMMM d, yyyy')} | ${userName}${plan.plan_mode === 'optimization' ? ' | LONGEVITY MODE' : ''}`;
  doc.text(headerMeta, margin, 32);
  y = 45;

  // ── Headline ───────────────────────────────────────────────────────
  if (plan.headline) {
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(19, 19, 19);
    const hLines = doc.splitTextToSize(stripUnsupportedChars(plan.headline), contentW);
    checkPage(hLines.length * 6 + 4);
    doc.text(hLines, margin, y); y += hLines.length * 6 + 3;
  }

  // ── SAFETY-CRITICAL: crisis_alert + emergency_alerts ──────────────
  // Render BEFORE any plan content so a user with a critical lab value
  // (K >6.5, Hgb <7, etc.) or detected suicide-risk language sees it
  // first when they open the PDF.
  const crisisMsg = typeof plan.crisis_alert === 'string'
    ? plan.crisis_alert
    : (plan.crisis_alert?.message ?? null);
  if (crisisMsg) {
    addSection('Worth talking to someone', [184, 110, 21]); // amber, not red
    para(crisisMsg);
    para('Free, confidential support is available 24/7 — call or text 988 (US Suicide & Crisis Lifeline), or bring this up with your doctor.', { italic: true });
  }
  if (Array.isArray(plan.emergency_alerts) && plan.emergency_alerts.length > 0) {
    addSection(`To discuss with your doctor promptly (${plan.emergency_alerts.length} ${plan.emergency_alerts.length === 1 ? 'value' : 'values'})`, [184, 110, 21]);
    para('These values are outside the range typically considered safe to leave untreated. Worth bringing to your doctor soon rather than waiting for your next routine appointment.', { size: 8, italic: true });
    plan.emergency_alerts.forEach(a => {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
      const direction = a.threshold === 'critical_low' ? 'well below range' : 'well above range';
      const head = stripUnsupportedChars(`${a.marker}: ${a.value} ${a.unit ?? ''} (${direction})`);
      checkPage(8); doc.text(head, margin, y); y += 4.5;
      if (a.message) para(a.message, { size: 8, indent: 4 });
    });
  }

  // ── Clinical summary ───────────────────────────────────────────────
  addSection('Clinical Summary');
  para(plan.summary, { size: 10 });

  // ── Multi-marker patterns ──────────────────────────────────────────
  if (Array.isArray(plan.multi_marker_patterns) && plan.multi_marker_patterns.length > 0) {
    addSection(`Lab patterns we noticed (${plan.multi_marker_patterns.length})`);
    plan.multi_marker_patterns.forEach(p => {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
      checkPage(8);
      doc.text(stripUnsupportedChars(p.name + (p.severity ? ` (${p.severity})` : '')), margin, y); y += 4.5;
      if (p.description) para(p.description, { size: 8, indent: 4 });
      if (Array.isArray(p.markers) && p.markers.length > 0) {
        para('Markers: ' + p.markers.join(', '), { size: 7, indent: 4, italic: true });
      }
    });
  }

  // ── Suspected conditions ───────────────────────────────────────────
  if (Array.isArray(plan.suspected_conditions) && plan.suspected_conditions.length > 0) {
    addSection(`Possible conditions to investigate (${plan.suspected_conditions.length})`);
    plan.suspected_conditions.forEach(c => {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
      checkPage(8);
      const head = stripUnsupportedChars(c.name + (c.confidence ? ` (${c.confidence} confidence)` : ''));
      doc.text(head, margin, y); y += 4.5;
      if (c.evidence) para(c.evidence, { size: 8, indent: 4 });
      if (c.what_to_ask_doctor) para('Ask: ' + c.what_to_ask_doctor, { size: 8, indent: 4, italic: true });
    });
  }

  // ── Risk calculators ───────────────────────────────────────────────
  if (plan.risk_calculators && typeof plan.risk_calculators === 'object') {
    const r = plan.risk_calculators;
    const rows: Array<[string, string | null]> = [
      ['ASCVD 10-year CV risk', r.ascvd_10yr ? `${r.ascvd_10yr.value}% (${r.ascvd_10yr.category})` : null],
      ['FIB-4 (liver fibrosis)', r.fib4 ? `${r.fib4.value} (${r.fib4.category})` : null],
      ['HOMA-IR (insulin resistance)', r.homa_ir ? `${r.homa_ir.value} (${r.homa_ir.category})` : null],
      ['TG:HDL ratio', r.tg_hdl_ratio ? `${r.tg_hdl_ratio.value} (${r.tg_hdl_ratio.category})` : null],
    ];
    const present = rows.filter(([, v]) => v != null);
    if (present.length > 0) {
      addSection(`Clinical risk scores (${present.length})`);
      present.forEach(([label, value]) => {
        checkPage(6);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(26, 26, 26);
        doc.text(stripUnsupportedChars(`• ${label}: ${value}`), margin, y); y += 4.5;
      });
    }
  }

  // ── Goal targets ───────────────────────────────────────────────────
  if (Array.isArray(plan.goal_targets) && plan.goal_targets.length > 0) {
    addSection(`Where you're aiming (${plan.goal_targets.length})`);
    plan.goal_targets.forEach(t => {
      checkPage(6);
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(26, 26, 26);
      doc.text(stripUnsupportedChars(`• ${t.marker}: ${t.today} -> ${t.goal} ${t.unit}  (${t.deltaText})`), margin, y); y += 4.5;
    });
  }

  // ── Suboptimal flags (watch list) ──────────────────────────────────
  if (Array.isArray(plan.suboptimal_flags) && plan.suboptimal_flags.length > 0) {
    addSection(`Worth watching — borderline values (${plan.suboptimal_flags.length})`);
    plan.suboptimal_flags.forEach(f => {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
      checkPage(8);
      const range = (f.optimalLow != null || f.optimalHigh != null) ? `  (optimal ${f.optimalLow ?? '?'}-${f.optimalHigh ?? '?'})` : '';
      doc.text(stripUnsupportedChars(`${f.marker}: ${f.value} ${f.unit}${range}`), margin, y); y += 4.5;
      if (f.rationale) para(f.rationale, { size: 8, indent: 4 });
    });
  }

  // ── Interaction warnings (drug-supplement safety) ──────────────────
  if (Array.isArray(plan.interaction_warnings) && plan.interaction_warnings.length > 0) {
    addSection(`Drug-supplement interactions (${plan.interaction_warnings.length})`, [184, 110, 21]);
    plan.interaction_warnings.forEach(w => {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
      checkPage(8);
      doc.text(stripUnsupportedChars(`${w.supplement} + ${w.medication}  [${w.severity}]`), margin, y); y += 4.5;
      if (w.warning) para(w.warning, { size: 8, indent: 4 });
    });
  }

  // ── Medication depletions ──────────────────────────────────────────
  if (Array.isArray((plan as any).medication_depletions) && (plan as any).medication_depletions.length > 0) {
    addSection(`Medication-related nutrient depletions (${(plan as any).medication_depletions.length})`);
    (plan as any).medication_depletions.forEach((d: any) => {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
      checkPage(8);
      doc.text(stripUnsupportedChars(d.medication || d.drug || 'Medication'), margin, y); y += 4.5;
      const nutrients = Array.isArray(d.depleted_nutrients) ? d.depleted_nutrients.join(', ') : (d.depleted ?? d.nutrient ?? '');
      if (nutrients) para('Depletes: ' + nutrients, { size: 8, indent: 4 });
      if (d.note || d.explanation) para(d.note ?? d.explanation, { size: 8, indent: 4 });
    });
  }

  // ── Medication alternatives ────────────────────────────────────────
  if (Array.isArray((plan as any).medication_alternatives) && (plan as any).medication_alternatives.length > 0) {
    addSection(`Medication alternatives to discuss (${(plan as any).medication_alternatives.length})`);
    (plan as any).medication_alternatives.forEach((m: any) => {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
      checkPage(8);
      doc.text(stripUnsupportedChars(m.medication || m.drug || 'Medication'), margin, y); y += 4.5;
      if (m.alternative || m.suggestion) para('Alternative: ' + (m.alternative ?? m.suggestion), { size: 8, indent: 4 });
      if (m.note || m.rationale) para(m.note ?? m.rationale, { size: 8, indent: 4 });
    });
  }

  // ── Supplements ────────────────────────────────────────────────────
  if (Array.isArray(plan.supplement_stack) && plan.supplement_stack.length > 0) {
    addSection(`Supplement Protocol (${plan.supplement_stack.length})`);
    plan.supplement_stack.forEach((sup, i) => {
      checkPage(20);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
      doc.text(stripUnsupportedChars(`${i + 1}. ${sup.nutrient} — ${sup.form}`), margin, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(107, 107, 107);
      doc.text(stripUnsupportedChars(`Dose: ${sup.dose}   Timing: ${sup.timing}   Priority: ${sup.priority.toUpperCase()}`), margin + 4, y); y += 4;
      const why = (sup as any).why ?? (sup as any).why_short ?? (sup as any).whyShort ?? '';
      if (why) {
        const whyLines = doc.splitTextToSize(stripUnsupportedChars(why), contentW - 4);
        doc.text(whyLines, margin + 4, y); y += whyLines.length * 3.5 + 4;
      }
    });
  }

  // ── Lifestyle ──────────────────────────────────────────────────────
  addSection('Lifestyle Interventions');
  (['diet', 'sleep', 'exercise', 'stress'] as const).forEach(cat => {
    const items = plan.lifestyle_interventions?.[cat];
    if (!items?.length) return;
    checkPage(12);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 67, 50);
    doc.text(cat.charAt(0).toUpperCase() + cat.slice(1), margin, y); y += 5;
    items.forEach(item => {
      checkPage(10);
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
      const tLines = doc.splitTextToSize(stripUnsupportedChars(`• ${item.intervention}`), contentW - 4);
      doc.text(tLines, margin + 2, y); y += tLines.length * 3.5 + 1;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 107, 107);
      const rLines = doc.splitTextToSize(stripUnsupportedChars(item.rationale), contentW - 8);
      doc.text(rLines, margin + 6, y); y += rLines.length * 3.5 + 3;
    });
  });

  // ── Eating pattern ─────────────────────────────────────────────────
  if (plan.eating_pattern && typeof plan.eating_pattern === 'object') {
    const ep = plan.eating_pattern as any;
    addSection('Eating Pattern');
    if (ep.name) { doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26); checkPage(6); doc.text(stripUnsupportedChars(ep.name), margin, y); y += 5; }
    if (ep.summary || ep.description) para(ep.summary ?? ep.description, { size: 9 });
    if (Array.isArray(ep.principles)) {
      ep.principles.forEach((p: string) => para(`• ${p}`, { size: 8, indent: 2 }));
    }
    if (Array.isArray(ep.eat_more) && ep.eat_more.length) { para('Eat more:', { size: 9, italic: true }); ep.eat_more.forEach((s: string) => para(`• ${s}`, { size: 8, indent: 4 })); }
    if (Array.isArray(ep.eat_less) && ep.eat_less.length) { para('Eat less:', { size: 9, italic: true }); ep.eat_less.forEach((s: string) => para(`• ${s}`, { size: 8, indent: 4 })); }
  }

  // ── Workouts ───────────────────────────────────────────────────────
  if (Array.isArray(plan.workouts) && plan.workouts.length > 0) {
    addSection(`Workouts (${plan.workouts.length})`);
    plan.workouts.forEach((w: any) => {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
      checkPage(8);
      const head = stripUnsupportedChars(`${w.name ?? 'Workout'}${w.duration ? '  (' + w.duration + ')' : ''}${w.intensity ? '  ' + w.intensity : ''}`);
      doc.text(head, margin, y); y += 4.5;
      if (w.description) para(w.description, { size: 8, indent: 4 });
      if (w.rationale) para(w.rationale, { size: 8, indent: 4, italic: true });
    });
  }

  // ── 90-Day Plan ────────────────────────────────────────────────────
  if (plan.action_plan && (plan.action_plan.phase_1 || plan.action_plan.phase_2 || plan.action_plan.phase_3)) {
    addSection('90-Day Action Plan');
    [plan.action_plan.phase_1, plan.action_plan.phase_2, plan.action_plan.phase_3].forEach(phase => {
      if (!phase) return;
      checkPage(18);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
      doc.text(stripUnsupportedChars(phase.name ?? ''), margin, y); y += 5;
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(107, 107, 107);
      if (phase.focus) {
        const fLines = doc.splitTextToSize(stripUnsupportedChars(phase.focus), contentW);
        doc.text(fLines, margin, y); y += fLines.length * 3.5 + 2;
      }
      doc.setFont('helvetica', 'normal');
      (phase.actions ?? []).forEach((action: string) => {
        checkPage(6);
        const aLines = doc.splitTextToSize(stripUnsupportedChars(`• ${action}`), contentW - 4);
        doc.text(aLines, margin + 2, y); y += aLines.length * 3.5 + 1;
      });
      y += 4;
    });
  }

  // ── Retest timeline (mirrors what the on-screen ActionPlan would
  //     render via specialist grouping; PDF lists chronologically). ──
  if (Array.isArray(plan.retest_timeline) && plan.retest_timeline.length > 0) {
    addSection(`Retest schedule (${plan.retest_timeline.length})`);
    plan.retest_timeline.forEach(t => {
      checkPage(6);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
      doc.text(stripUnsupportedChars(`${t.marker}  —  in ${t.retest_at}`), margin, y); y += 4.5;
      if (t.why) para(t.why, { size: 8, indent: 4 });
    });
  }

  // ── Prep instructions ──────────────────────────────────────────────
  if (Array.isArray(plan.prep_instructions) && plan.prep_instructions.length > 0) {
    addSection(`Before your next blood draw (${plan.prep_instructions.length})`);
    plan.prep_instructions.forEach(p => {
      checkPage(6);
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
      const tag = `[${p.category.toUpperCase()}]${p.importance === 'critical' ? ' CRITICAL' : ''}`;
      doc.text(stripUnsupportedChars(`${tag}  ${p.triggeredByTest}`), margin, y); y += 4;
      para(p.instruction, { size: 8, indent: 4 });
    });
  }

  // ── Symptoms addressed ─────────────────────────────────────────────
  if (Array.isArray(plan.symptoms_addressed) && plan.symptoms_addressed.length > 0) {
    addSection(`Your symptoms — and how this plan addresses them (${plan.symptoms_addressed.length})`);
    plan.symptoms_addressed.forEach(s => {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
      checkPage(8);
      doc.text(stripUnsupportedChars(s.symptom), margin, y); y += 4.5;
      if (s.how_addressed) para(s.how_addressed, { size: 8, indent: 4 });
    });
  }

  // ── Progress summary (longitudinal, only if prior draw exists) ─────
  if (plan.progress_summary && plan.progress_summary.movements?.length > 0) {
    addSection(`Progress since your last draw (${plan.progress_summary.movements.length} markers)`);
    para(`Prior draw: ${plan.progress_summary.prior_draw_date} (${plan.progress_summary.weeks_between} weeks ago).`, { size: 8, italic: true });
    plan.progress_summary.movements.slice(0, 30).forEach(m => {
      checkPage(5);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(26, 26, 26);
      const arrow = m.direction === 'improved' ? '↑' : m.direction === 'worsened' ? '↓' : '→';
      doc.text(stripUnsupportedChars(`• ${m.marker}: ${m.prior_display} -> ${m.current_display}  [${m.direction} ${arrow}]`), margin, y); y += 4;
    });
  }

  // ── Disclaimer (always at bottom of last page) ─────────────────────
  checkPage(25); y = pageH - 25;
  doc.setFillColor(245, 240, 232);
  doc.rect(margin, y - 3, contentW, 20, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(107, 107, 107);
  const dLines = doc.splitTextToSize(stripUnsupportedChars(plan.disclaimer), contentW - 4);
  doc.text(dLines, margin + 2, y + 2);

  doc.save(`CauseHealth-WellnessPlan-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

// PanelGapPDF removed — was used for the deleted Tier 1/2/3 section.
// Test recommendations come exclusively from doc.tests_to_request now.

// jsPDF's standard fonts don't support emoji or many unicode symbols —
// they render as garbled bytes ("Ø=Ý4") that often eat adjacent text.
// Strip everything outside the basic Latin-1 range and a few safe symbols
// before passing strings to pdf.text / splitTextToSize.
const stripUnsupportedChars = (s: string): string => {
  if (!s) return '';
  return s
    // Remove emoji and pictographic ranges
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{1F000}-\u{1F2FF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '') // variation selectors
    .replace(/[\u{200D}]/gu, '') // ZWJ used in emoji sequences
    // Replace common smart-punct that helvetica handles inconsistently
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    // Keep printable ASCII + Latin-1 supplement; drop the rest
    .replace(/[^\x20-\xFF\n]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// ─── Patient-facing visit guide ─────────────────────────────────────────
// Companion PDF to the Doctor Prep document. Same data, but rewritten
// for the patient: plain-English explanations, scripts, and what-to-do
// if the doctor pushes back. The patient brings the doctor PDF for the
// doctor and reads this one in the waiting room.
export function exportPatientVisitGuidePDF(doc: DoctorPrepDocument, userName: string, isHealthyMode: boolean = false) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = margin;

  const checkPage = (needed = 20) => { if (y + needed > pageH - margin) { pdf.addPage(); y = margin; } };
  const addRule = (color = '#E8E3DB') => { pdf.setDrawColor(color); pdf.line(margin, y, pageW - margin, y); y += 5; };

  const sectionHeader = (label: string) => {
    y += 4; checkPage(15);
    pdf.setFillColor(212, 165, 116); // brand cream-gold accent line
    pdf.rect(margin, y - 1, 6, 4, 'F');
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(19, 19, 19);
    pdf.text(stripUnsupportedChars(label), margin + 10, y + 2);
    y += 7; addRule();
  };

  const para = (text: string, opts: { size?: number; color?: [number, number, number]; bold?: boolean; italic?: boolean; indent?: number; gap?: number } = {}) => {
    const size = opts.size ?? 9;
    const color = opts.color ?? [40, 40, 40];
    const fontStyle = opts.bold && opts.italic ? 'bolditalic' : opts.bold ? 'bold' : opts.italic ? 'italic' : 'normal';
    const indent = opts.indent ?? 0;
    pdf.setFontSize(size); pdf.setFont('helvetica', fontStyle); pdf.setTextColor(color[0], color[1], color[2]);
    const lines = pdf.splitTextToSize(stripUnsupportedChars(text), contentW - indent);
    checkPage(lines.length * (size * 0.5) + 2);
    pdf.text(lines, margin + indent, y);
    y += lines.length * (size * 0.5) + (opts.gap ?? 2);
  };

  // ── Header ────────────────────────────────────────────────────────────
  pdf.setFillColor(19, 19, 19);
  pdf.rect(0, 0, pageW, 38, 'F');
  pdf.setFontSize(20); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255, 255, 255);
  pdf.text('CauseHealth.', margin, 16);
  pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(212, 165, 116);
  pdf.text('YOUR VISIT GUIDE - PATIENT COPY', margin, 23);
  pdf.setTextColor(170, 170, 170);
  pdf.text(`${stripUnsupportedChars(userName)}   |   Prepared ${format(new Date(doc.document_date), 'MMMM d, yyyy')}`, margin, 30);
  y = 48;

  // ── What this is ─────────────────────────────────────────────────────
  para(
    isHealthyMode
      ? "This is YOUR copy. You're using this appointment to add advanced markers and confirm the trajectory you're already on. Hand over the Doctor PDF and use this guide to stay on track during the visit."
      : "This is YOUR copy of what to bring up. Keep it with you in the waiting room and during the appointment. Your doctor gets a separate clinical document with ICD-10 codes and rationale - you focus on advocating for yourself.",
    { italic: true, color: [80, 80, 80], size: 8.5, gap: 6 }
  );

  // ── What's going on with your body ───────────────────────────────────
  sectionHeader(isHealthyMode ? "Where you stand right now" : "What's going on with your body right now");
  para(doc.chief_complaint, { size: 9 });
  if (doc.lab_summary?.urgent_findings?.length) {
    y += 2;
    para(isHealthyMode ? 'Worth pushing on:' : 'Your most important lab findings:', { bold: true, size: 9, gap: 3 });
    doc.lab_summary.urgent_findings.forEach(f => {
      checkPage(14);
      pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(isHealthyMode ? 232 : 201, isHealthyMode ? 146 : 79, isHealthyMode ? 42 : 79);
      pdf.text(stripUnsupportedChars(`- ${f.marker}: ${f.value}`), margin + 2, y); y += 4.5;
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(60, 60, 60); pdf.setFontSize(8.5);
      const noteLines = pdf.splitTextToSize(stripUnsupportedChars(f.clinical_note), contentW - 6);
      pdf.text(noteLines, margin + 6, y); y += noteLines.length * 3.8 + 2;
    });
  } else if (isHealthyMode) {
    para('Your bloodwork is solid — every marker in range. The visit is for adding new tests, not addressing problems.', { size: 9, color: [40, 80, 60], italic: true, gap: 3 });
  }

  // ── How to open the conversation ─────────────────────────────────────
  sectionHeader('How to open the conversation');
  para(
    isHealthyMode ? "Hand over your Doctor Prep PDF first. Then say something like:" : "Hand over your Doctor Prep PDF first. Then say something like:",
    { size: 8.5, color: [80, 80, 80], gap: 3 }
  );
  para(
    isHealthyMode
      ? "\"My labs look good — I'm using this visit to add a few advanced markers I haven't had before. I brought a summary with the specific tests and the ICD-10 codes that justify insurance coverage where applicable. Can we go through it together?\""
      : "\"I've been tracking my symptoms and I want a thorough workup so we can find the root causes, not just manage symptoms. I brought a summary with the tests I'm requesting and the ICD-10 codes that justify insurance coverage where applicable. Can we go through it together?\"",
    { italic: true, size: 9.5, color: [19, 19, 19], indent: 4, gap: 5 }
  );
  para(
    isHealthyMode
      ? "This signals you're not chasing symptoms — you're being proactive. Most doctors respect that framing."
      : "This positions you as informed and collaborative. Most doctors respond well when you arrive prepared.",
    { size: 8.5, color: [80, 80, 80] }
  );

  // ── Tests to ask for + why ───────────────────────────────────────────
  sectionHeader(isHealthyMode ? 'Advanced markers to add this visit' : 'Tests to ask for - and why each one matters');
  para(
    isHealthyMode
      ? "These aren't on a routine annual panel. They give you a complete baseline and catch trajectory drift years before disease shows up. Pick the ones your doctor will agree to today, save the rest for next visit."
      : "Each test below is tied to a specific symptom or lab finding of yours. This isn't a generic checklist - we picked these because they could explain what you're feeling.",
    { size: 8.5, color: [80, 80, 80], italic: true, gap: 5 }
  );

  // Tests grouped by specialist (PCP / GI / Imaging / etc.) — patient
  // copy is intentionally lighter than the doctor copy: short "why" only,
  // no insurance note, no ICD-10. The full clinical-justification text
  // and insurance note live in the doctor's clinical PDF.
  if (doc.tests_to_request?.length) {
    const groups = groupTestsBySpecialist(doc.tests_to_request);
    let counter = 1;
    for (const group of groups) {
      checkPage(20);
      para(group.title, { bold: true, size: 9.5, color: [27, 67, 50], gap: 2 });
      for (const t of group.items) {
        checkPage(18);
        pdf.setFontSize(9.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(19, 19, 19);
        pdf.text(stripUnsupportedChars(`${counter}. ${t.test_name}`), margin, y); y += 5;
        counter++;
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(60, 60, 60); pdf.setFontSize(8.5);
        // Patient copy: keep just the why-this-matters explanation in
        // plain language. Drop "Insurance / cost note" detail and
        // trigger-letter prefixes — those belong to the doctor's copy.
        const why = stripUnsupportedChars(String(t.clinical_justification ?? '').replace(/^\([a-z]\)\s*/i, ''));
        const whyLines = pdf.splitTextToSize(why, contentW - 6);
        pdf.text(whyLines, margin + 3, y); y += whyLines.length * 3.6 + 4;
      }
      y += 2;
    }
  }

  // Panel-gap baseline section permanently removed. The AI's tests_to_request
  // (rendered above) is the single source of truth, already filtered by the
  // strict triage rule.

  // ── Patterns to discuss with your doctor — INTENTIONALLY OMITTED ──────
  // Clinical-grade differential belongs in the doctor PDF only. The
  // patient already has each pattern surfaced in the wellness-plan UI
  // and in the "Patterns to discuss with your doctor" tab; reproducing it
  // on the visit-prep PDF was redundant and made the patient guide read
  // like a clinical letter. See exportDoctorPrepPDF for the differential.

  // ── Medication alternatives — patient-side framing ───────────────────
  // Only renders if AI populated. Plain language: "ask your doctor if X
  // would be better than Y". No clinical jargon. Patient is the messenger,
  // doctor is the decider.
  if (Array.isArray(doc.medication_alternatives) && doc.medication_alternatives.length > 0) {
    sectionHeader('Ask about better-tolerated alternatives');
    pdf.setFontSize(8.5); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(80, 80, 80);
    const intro = "Some of your current medications may have alternatives that don't have the same side effects or nutrient depletions. These are conversation starters — only your doctor can decide what's right.";
    const introLines = pdf.splitTextToSize(stripUnsupportedChars(intro), contentW);
    pdf.text(introLines, margin, y); y += introLines.length * 3.6 + 5;
    doc.medication_alternatives.forEach((m, i) => {
      checkPage(24);
      pdf.setFontSize(9.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(19, 19, 19);
      pdf.text(stripUnsupportedChars(`${i + 1}. ${m.current_medication}`), margin, y); y += 5;
      const reason = (m as any).reason_to_consider;
      if (reason) {
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(60, 60, 60); pdf.setFontSize(8.5);
        const rl = pdf.splitTextToSize(stripUnsupportedChars(reason), contentW - 6);
        pdf.text(rl, margin + 3, y); y += rl.length * 3.6 + 2;
      }
      const phrm = m.pharmaceutical_alternatives ?? [];
      if (phrm.length > 0) {
        pdf.setFont('helvetica', 'bold'); pdf.setTextColor(212, 165, 116); pdf.setFontSize(8);
        pdf.text('Drugs to ask your doctor about:', margin + 3, y); y += 4;
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 40, 40);
        phrm.forEach(a => {
          const txt = `• ${a.name}: ${a.reason}`;
          const lines = pdf.splitTextToSize(stripUnsupportedChars(txt), contentW - 9);
          pdf.text(lines, margin + 6, y); y += lines.length * 3.5 + 1;
        });
        y += 1;
      }
      const nat = m.natural_alternatives ?? [];
      if (nat.length > 0) {
        pdf.setFont('helvetica', 'bold'); pdf.setTextColor(212, 165, 116); pdf.setFontSize(8);
        pdf.text('Lifestyle changes that can help:', margin + 3, y); y += 4;
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 40, 40);
        nat.forEach(a => {
          const txt = `• ${a.name}: ${a.reason}`;
          const lines = pdf.splitTextToSize(stripUnsupportedChars(txt), contentW - 9);
          pdf.text(lines, margin + 6, y); y += lines.length * 3.5 + 1;
        });
      }
      y += 3;
    });
  }

  // ── Other points to bring up ─────────────────────────────────────────
  if (doc.discussion_points?.length) {
    sectionHeader('Other things to bring up');
    doc.discussion_points.forEach(point => {
      checkPage(10);
      const raw = typeof point === 'string' ? point : (typeof point === 'object' && point !== null ? Object.values(point as any).filter(v => typeof v === 'string').join(' - ') : String(point));
      const text = stripUnsupportedChars(raw);
      if (!text) return;
      pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 40, 40);
      const lines = pdf.splitTextToSize(`- ${text}`, contentW);
      pdf.text(lines, margin, y); y += lines.length * 3.6 + 2;
    });
  }

  // ── If your doctor pushes back ───────────────────────────────────────
  sectionHeader(isHealthyMode ? "If your doctor pushes back" : "If your doctor says no");
  const pushbackBlocks: { script: string; response: string }[] = isHealthyMode ? [
    {
      script: '"You don\'t need that, you\'re healthy."',
      response: 'Reply: "I\'m tracking trajectory, not chasing symptoms. Catching drift early is the whole point. Would you order it as a one-time baseline I can use for comparison later?"',
    },
    {
      script: '"Your insurance won\'t cover that."',
      response: 'Reply: "I have ICD-10 codes on the document I gave you that justify coverage. Can we use those?" Most denials come from coding, not the test itself.',
    },
    {
      script: '"That\'s not on the standard annual panel."',
      response: 'Reply: "I understand. I\'m asking because [ApoB / Lp(a) / DEXA / etc.] is recommended in current cardiology / preventive guidelines. If you\'re not comfortable ordering it, can you refer me to someone who is?"',
    },
    {
      script: '"Why do you want all these tests?"',
      response: 'Reply: "I want a complete baseline now while I\'m healthy so we can track what changes. It\'s much cheaper to catch drift early than to react to disease."',
    },
    {
      script: '"This is hypochondria."',
      response: 'Reply: "I\'m being proactive, not anxious. I have specific markers I want to track over time. If you\'d rather I see a longevity-focused PCP or preventive cardiologist, please make the referral."',
    },
  ] : [
    {
      script: '"Your insurance won\'t cover that."',
      response: 'Reply: "I have ICD-10 codes that justify coverage. They\'re on the document I gave you. Can we use those?" Most denials are about coding, not the test itself.',
    },
    {
      script: '"That\'s not a standard test."',
      response: 'Reply: "I understand it\'s not in the routine panel. I\'m asking specifically because of [your symptom or lab finding]. Can you order it as a one-time investigation?"',
    },
    {
      script: '"Your labs look normal, you don\'t need it."',
      response: 'Reply: "Standard ranges miss early dysfunction. I want to catch problems before they progress. If you\'re uncomfortable ordering it, can you refer me to a specialist who will?"',
    },
    {
      script: '"I don\'t have time today."',
      response: 'Reply: "Can I leave this list with you and you order what you can today, then we can revisit the rest at the next visit?" Or schedule a dedicated lab-review appointment.',
    },
    {
      script: '"Why do you need all this?"',
      response: 'Reply: "I want a complete picture of my health, not just disease management. Catching things early is cheaper for everyone."',
    },
  ];
  pushbackBlocks.forEach(b => {
    checkPage(14);
    pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(201, 79, 79);
    pdf.text(stripUnsupportedChars(`If they say: ${b.script}`), margin, y); y += 4;
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 40, 40);
    const lines = pdf.splitTextToSize(stripUnsupportedChars(b.response), contentW - 4);
    pdf.text(lines, margin + 4, y); y += lines.length * 3.6 + 3;
  });

  // ── Your rights ──────────────────────────────────────────────────────
  sectionHeader('Your rights as a patient');
  [
    "You have the right to ask for any test - and your doctor has to either order it, document why they declined, or refer you to someone who will.",
    "You have the right to a copy of your lab results. Always ask. Lab results belong to you.",
    "You have the right to a second opinion. If your PCP keeps refusing, ask for a referral to endocrinology, cardiology, or functional medicine.",
    "You have the right to switch doctors. A doctor who won't engage with your health questions is not the right doctor.",
  ].forEach(t => {
    checkPage(8);
    pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 40, 40);
    const lines = pdf.splitTextToSize(stripUnsupportedChars(`- ${t}`), contentW);
    pdf.text(lines, margin, y); y += lines.length * 3.6 + 2;
  });

  // ── After the visit ──────────────────────────────────────────────────
  sectionHeader('After the visit');
  [
    "Get your results sent to you (patient portal or email). You should always have a copy.",
    "Re-upload them to CauseHealth so we can update your analysis and Doctor Prep.",
    "If a test came back abnormal, the next Doctor Prep will tell you what to ask for as a follow-up.",
  ].forEach(t => {
    checkPage(8);
    pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 40, 40);
    const lines = pdf.splitTextToSize(stripUnsupportedChars(`- ${t}`), contentW);
    pdf.text(lines, margin, y); y += lines.length * 3.6 + 2;
  });

  // ── Disclaimer ───────────────────────────────────────────────────────
  if (y + 20 > pageH - margin) { pdf.addPage(); y = margin; }
  y = pageH - 20;
  pdf.setFontSize(6.5); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(155, 155, 155);
  const disc = 'CauseHealth provides educational information based on your data. This is not a substitute for professional medical advice. Always consult a licensed clinician for diagnosis and treatment decisions.';
  pdf.text(pdf.splitTextToSize(disc, contentW), margin, y);

  pdf.save(`CauseHealth-PatientVisitGuide-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

// Doctor Prep PDF
export function exportDoctorPrepPDF(doc: DoctorPrepDocument, userName: string) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = margin;

  const checkPage = (needed = 20) => { if (y + needed > pageH - margin) { pdf.addPage(); y = margin; } };
  const addRule = () => { pdf.setDrawColor('#E8E3DB'); pdf.line(margin, y, pageW - margin, y); y += 5; };
  const addSectionHeader = (label: string) => {
    y += 3; checkPage(15);
    pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor('#6B6B6B');
    pdf.text(label.toUpperCase(), margin, y); y += 1; addRule();
  };

  // Header
  pdf.setFillColor(19, 19, 19);
  pdf.rect(0, 0, pageW, 38, 'F');
  pdf.setFontSize(20); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255, 255, 255);
  pdf.text('CauseHealth.', margin, 16);
  pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(165, 208, 185);
  pdf.text('CLINICAL VISIT PREPARATION DOCUMENT', margin, 23);
  pdf.setTextColor(107, 107, 107);
  pdf.text(`Patient: ${userName}   |   Prepared: ${format(new Date(doc.document_date), 'MMMM d, yyyy')}`, margin, 30);
  pdf.setTextColor(255, 255, 255); pdf.setFontSize(7);
  pdf.text('CONFIDENTIAL', pageW - margin - 25, 30);
  y = 48;

  // Chief Complaint
  addSectionHeader('Chief Complaint');
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(26, 26, 26);
  const ccLines = pdf.splitTextToSize(stripUnsupportedChars(doc.chief_complaint), contentW);
  pdf.text(ccLines, margin, y); y += ccLines.length * 4.5 + 2;

  // HPI
  addSectionHeader('History of Present Illness');
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(26, 26, 26);
  const hpiLines = pdf.splitTextToSize(stripUnsupportedChars(doc.hpi), contentW);
  pdf.text(hpiLines, margin, y); y += hpiLines.length * 4.5 + 2;

  // 2026-05-14: render doc.headline at the very top of the body when
  // present — gives the doctor a one-line framing of the whole visit
  // before diving into chief complaint / HPI / PMH.
  if ((doc as any).headline) {
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(19, 19, 19);
    const hLines = pdf.splitTextToSize(stripUnsupportedChars((doc as any).headline), contentW);
    pdf.text(hLines, margin, y); y += hLines.length * 5 + 3;
  }

  // PMH
  addSectionHeader('Past Medical History');
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(26, 26, 26);
  const pmhRaw = doc.pmh as unknown;
  const pmhText = typeof pmhRaw === 'string' ? pmhRaw : Array.isArray(pmhRaw) ? pmhRaw.join('; ') : '';
  const pmhLines = pdf.splitTextToSize(stripUnsupportedChars(pmhText), contentW);
  pdf.text(pmhLines, margin, y); y += pmhLines.length * 4.5 + 2;

  // BMI + BMI category (engine-computed from height/weight).
  if ((doc as any).bmi != null) {
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(107, 107, 107);
    const bmiTxt = `BMI: ${Number((doc as any).bmi).toFixed(1)}${(doc as any).bmi_category ? '  (' + (doc as any).bmi_category + ')' : ''}`;
    pdf.text(stripUnsupportedChars(bmiTxt), margin, y); y += 5;
  }

  // Emergency alerts — top-priority safety findings (critical lab
  // values). Render BEFORE meds / labs / tests so the doctor sees the
  // urgent stuff first.
  if (Array.isArray((doc as any).emergency_alerts) && (doc as any).emergency_alerts.length > 0) {
    addSectionHeader('Values to Discuss Promptly');
    (doc as any).emergency_alerts.forEach((a: any) => {
      checkPage(10);
      pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor('#B86E15');
      const direction = a.threshold === 'critical_low' ? 'well below range' : 'well above range';
      const head = stripUnsupportedChars(`${a.marker}: ${a.value} ${a.unit ?? ''} (${direction})`);
      pdf.text(head, margin, y); y += 4.5;
      if (a.message) {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(40, 40, 40);
        const lines = pdf.splitTextToSize(stripUnsupportedChars(a.message), contentW - 4);
        pdf.text(lines, margin + 4, y); y += lines.length * 3.5 + 2;
      }
    });
  }

  // Executive summary — short, scannable bullets the doctor should read
  // before anything else clinical.
  if (Array.isArray((doc as any).executive_summary) && (doc as any).executive_summary.length > 0) {
    addSectionHeader('Executive Summary');
    (doc as any).executive_summary.forEach((s: string) => {
      checkPage(6);
      pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(26, 26, 26);
      const lines = pdf.splitTextToSize(stripUnsupportedChars('- ' + s), contentW);
      pdf.text(lines, margin, y); y += lines.length * 4 + 1;
    });
  }

  // Functional medicine note — only present when AI added relevant
  // functional context. Small italic block.
  if ((doc as any).functional_medicine_note) {
    addSectionHeader('Functional Medicine Note');
    pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(60, 60, 60);
    const fnLines = pdf.splitTextToSize(stripUnsupportedChars((doc as any).functional_medicine_note), contentW);
    pdf.text(fnLines, margin, y); y += fnLines.length * 3.5 + 2;
  }

  // Review of systems — engine-derived positives from symptom list.
  const ros = (doc as any).review_of_systems;
  if (ros) {
    addSectionHeader('Review of Systems');
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(26, 26, 26);
    const rosText = typeof ros === 'string'
      ? ros
      : Array.isArray(ros)
        ? ros.join('; ')
        : Object.entries(ros).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('  |  ');
    const rosLines = pdf.splitTextToSize(stripUnsupportedChars(rosText), contentW);
    pdf.text(rosLines, margin, y); y += rosLines.length * 3.5 + 2;
  }

  // Medications
  addSectionHeader('Current Medications');
  doc.medications.forEach(med => {
    checkPage(8);
    // Strip leading verb forms from the AI's depletion field so the rendered
    // template doesn't double up. Handles three common patterns:
    //   "Depletes CoQ10" -> "CoQ10"  (avoid "depletes Depletes")
    //   "Mesalamine can deplete folate" -> "folate"  (avoid restating the med name)
    //   "May deplete B12" -> "B12"
    const cleanDepletion = (med.notable_depletion ?? '')
      // First, strip "[medication name] can/may deplete" if present
      .replace(new RegExp(`^\\s*${med.name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s+(can|may)\\s+deplete[sd]?\\s*[:.\\-]?\\s*`, 'i'), '')
      // Then strip plain leading "Depletes/Deplete/Deplete:/Depleted/may deplete"
      .replace(/^\s*(may\s+)?deplete[sd]?\s*[:.\-]?\s*/i, '')
      .trim();
    const line = stripUnsupportedChars(`- ${med.name}${med.dose ? ` - ${med.dose}` : ''}${cleanDepletion ? ` (depletes ${cleanDepletion})` : ''}`);
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(26, 26, 26);
    const lines = pdf.splitTextToSize(line, contentW);
    pdf.text(lines, margin, y); y += lines.length * 3.5 + 1;
  });

  // Lab Findings
  if (doc.lab_summary?.urgent_findings?.length) {
    addSectionHeader(`Lab Results - ${stripUnsupportedChars(doc.lab_summary.lab_name ?? '')} (${doc.lab_summary.draw_date ?? ''})`);
    pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor('#C94F4F');
    pdf.text('FINDINGS REQUIRING ATTENTION:', margin, y); y += 5;
    doc.lab_summary.urgent_findings.forEach(f => {
      checkPage(10);
      pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(26, 26, 26);
      pdf.text(stripUnsupportedChars(`${f.marker}: ${f.value} [${f.flag.toUpperCase()}]`), margin + 2, y); y += 4;
      pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7.5); pdf.setTextColor(107, 107, 107);
      const nLines = pdf.splitTextToSize(stripUnsupportedChars(f.clinical_note), contentW - 4);
      pdf.text(nLines, margin + 4, y); y += nLines.length * 3.5 + 2;
    });
  }

  // Tests to Request — grouped by specialist (PCP / GI / Imaging /
  // Functional / Mental Health). Doctor copy keeps full clinical detail:
  // ICD-10 codes, priority badge, full justification, insurance note.
  if (doc.tests_to_request?.length) {
    addSectionHeader('Tests to Request');
    const groups = groupTestsBySpecialist(doc.tests_to_request);
    let counter = 1;
    for (const group of groups) {
      checkPage(18);
      // Specialist subheader
      pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(27, 67, 50);
      pdf.text(stripUnsupportedChars(group.title.toUpperCase()), margin, y); y += 5;
      // Underline
      pdf.setDrawColor(212, 165, 116); pdf.setLineWidth(0.4);
      pdf.line(margin, y - 1, margin + 60, y - 1); y += 1;

      for (const test of group.items) {
        checkPage(22);
        pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(26, 26, 26);
        pdf.text(stripUnsupportedChars(`${counter}. ${test.test_name} [${test.priority.toUpperCase()}]`), margin, y); y += 5;
        counter++;
        pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(107, 107, 107);
        if (test.icd10_primary) {
          pdf.text(stripUnsupportedChars(`ICD-10: ${test.icd10_primary} - ${test.icd10_description ?? ''}`), margin + 3, y); y += 4;
        }
        if (test.icd10_secondary) {
          pdf.text(stripUnsupportedChars(`ICD-10: ${test.icd10_secondary} - ${test.icd10_secondary_description ?? ''}`), margin + 3, y); y += 4;
        }
        pdf.setTextColor(26, 26, 26);
        const jLines = pdf.splitTextToSize(stripUnsupportedChars(test.clinical_justification), contentW - 3);
        pdf.text(jLines, margin + 3, y); y += jLines.length * 3.5 + 5;
      }
      y += 2;
    }
  }

  // Comprehensive Health Screening / Tier 1-2-3 block permanently removed.
  // Test recommendations come exclusively from doc.tests_to_request, which
  // is filtered by the strict triage rule (symptom OR med depletion OR
  // out-of-range marker OR early-detection pattern). No more hardcoded
  // baseline-for-everyone lists in any PDF or page.

  // ── Patterns to discuss with your doctor (CLINICAL DIFFERENTIAL) ───────
  // Renders only on the doctor PDF — clinical-grade differential with
  // evidence + ICD-10 + confirmatory tests. Patient PDF intentionally
  // omits this section (it lives on the patient app UI but not in the
  // visit-prep printout — keeps the patient guide plain-language).
  if (Array.isArray(doc.possible_conditions) && doc.possible_conditions.length > 0) {
    addSectionHeader('Patterns to Discuss With Your Doctor');
    pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(107, 107, 107);
    pdf.text(stripUnsupportedChars('Pattern matches against patient data — not a diagnosis. Each entry includes ICD-10 + confirmatory workup.'), margin, y, { maxWidth: contentW });
    y += 7;
    doc.possible_conditions.forEach((c: any, i: number) => {
      checkPage(34);
      pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(19, 19, 19);
      const conf = String(c.confidence ?? 'low').toUpperCase();
      pdf.text(stripUnsupportedChars(`${i + 1}. ${c.name}  [${conf}]`), margin, y); y += 5;
      if (c.icd10) {
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(212, 165, 116);
        pdf.text(stripUnsupportedChars(`ICD-10: ${c.icd10}`), margin + 3, y); y += 4;
      }
      if (c.evidence) {
        pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(60, 60, 60);
        pdf.text('Evidence:', margin + 3, y); y += 4;
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 40, 40);
        const evLines = pdf.splitTextToSize(stripUnsupportedChars(c.evidence), contentW - 6);
        pdf.text(evLines, margin + 3, y); y += evLines.length * 3.8 + 2;
      }
      if (Array.isArray(c.confirmatory_tests) && c.confirmatory_tests.length > 0) {
        pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(60, 60, 60);
        pdf.text('Confirmatory workup:', margin + 3, y); y += 4;
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 40, 40);
        const testLines: string[] = c.confirmatory_tests
          .map((t: any) => (typeof t === 'string' ? t : t?.test ?? ''))
          .filter(Boolean);
        if (testLines.length > 0) {
          const tLines = pdf.splitTextToSize(stripUnsupportedChars('• ' + testLines.join('\n• ')), contentW - 6);
          pdf.text(tLines, margin + 3, y); y += tLines.length * 3.8 + 2;
        }
      }
      y += 2;
    });
    addRule();
  }

  // Medication alternatives — only renders when AI populated with strict-bar
  // entries (specific finding + genuinely better drug exists + guideline-
  // supported). Empty array = section skipped entirely.
  if (Array.isArray(doc.medication_alternatives) && doc.medication_alternatives.length > 0) {
    addSectionHeader('Medication Alternatives to Consider');
    pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(107, 107, 107);
    pdf.text(stripUnsupportedChars('Surfaced only when a specific finding in this patient suggests a meaningfully better-tolerated or more effective option exists. Discuss before changing anything.'), margin, y, { maxWidth: contentW });
    y += 8;
    doc.medication_alternatives.forEach((m, i) => {
      checkPage(30);
      pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(19, 19, 19);
      pdf.text(stripUnsupportedChars(`${i + 1}. ${m.current_medication}`), margin, y); y += 5;
      const reason = (m as any).reason_to_consider;
      if (reason) {
        pdf.setFont('helvetica', 'italic'); pdf.setTextColor(60, 60, 60); pdf.setFontSize(8);
        const rl = pdf.splitTextToSize(stripUnsupportedChars(`Why considering: ${reason}`), contentW - 6);
        pdf.text(rl, margin + 3, y); y += rl.length * 3.5 + 3;
      }
      const phrm = m.pharmaceutical_alternatives ?? [];
      if (phrm.length > 0) {
        pdf.setFont('helvetica', 'bold'); pdf.setTextColor(212, 165, 116); pdf.setFontSize(8);
        pdf.text('Pharmaceutical alternatives:', margin + 3, y); y += 4;
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 40, 40);
        phrm.forEach(a => {
          const txt = `• ${a.name} — ${a.reason}`;
          const lines = pdf.splitTextToSize(stripUnsupportedChars(txt), contentW - 9);
          pdf.text(lines, margin + 6, y); y += lines.length * 3.5 + 1;
        });
        y += 1;
      }
      const nat = m.natural_alternatives ?? [];
      if (nat.length > 0) {
        pdf.setFont('helvetica', 'bold'); pdf.setTextColor(212, 165, 116); pdf.setFontSize(8);
        pdf.text('Lifestyle / natural options:', margin + 3, y); y += 4;
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 40, 40);
        nat.forEach(a => {
          const txt = `• ${a.name} — ${a.reason}`;
          const lines = pdf.splitTextToSize(stripUnsupportedChars(txt), contentW - 9);
          pdf.text(lines, margin + 6, y); y += lines.length * 3.5 + 1;
        });
      }
      y += 4;
    });
  }

  // Medication depletions — drug-induced nutrient depletions the
  // engine surfaces (statin → CoQ10, metformin → B12, PPI → Mg etc).
  if (Array.isArray((doc as any).medication_depletions) && (doc as any).medication_depletions.length > 0) {
    addSectionHeader('Drug-Induced Nutrient Depletions');
    (doc as any).medication_depletions.forEach((d: any) => {
      checkPage(8);
      pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(19, 19, 19);
      pdf.text(stripUnsupportedChars(d.medication || d.drug || 'Medication'), margin, y); y += 4.5;
      const nutrients = Array.isArray(d.depleted_nutrients) ? d.depleted_nutrients.join(', ') : (d.depleted ?? d.nutrient ?? '');
      if (nutrients) {
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 40, 40);
        pdf.text(stripUnsupportedChars('Depletes: ' + nutrients), margin + 3, y); y += 4;
      }
      if (d.note || d.explanation) {
        pdf.setFont('helvetica', 'italic'); pdf.setTextColor(107, 107, 107);
        const lines = pdf.splitTextToSize(stripUnsupportedChars(d.note ?? d.explanation), contentW - 6);
        pdf.text(lines, margin + 3, y); y += lines.length * 3.5 + 2;
      }
    });
  }

  // Advanced screening — labs the engine recommends beyond the standard
  // baseline set (Lp(a), CAC, ApoB, etc.). Doctor-prep specific.
  if (Array.isArray((doc as any).advanced_screening) && (doc as any).advanced_screening.length > 0) {
    addSectionHeader('Advanced Screening to Consider');
    (doc as any).advanced_screening.forEach((s: any) => {
      checkPage(8);
      pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(19, 19, 19);
      pdf.text(stripUnsupportedChars(s.test_name ?? s.name ?? 'Advanced test'), margin, y); y += 4.5;
      if (s.why_short || s.rationale || s.clinical_justification) {
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 40, 40);
        const lines = pdf.splitTextToSize(stripUnsupportedChars(s.why_short ?? s.rationale ?? s.clinical_justification), contentW - 4);
        pdf.text(lines, margin + 3, y); y += lines.length * 3.5 + 2;
      }
    });
  }

  // Prep instructions — what the patient must do before the lab draw
  // (biotin hold, fasting, AM testosterone, etc).
  if (Array.isArray((doc as any).prep_instructions) && (doc as any).prep_instructions.length > 0) {
    addSectionHeader('Pre-Draw Prep Instructions');
    (doc as any).prep_instructions.forEach((p: any) => {
      checkPage(6);
      pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(19, 19, 19);
      const tag = `[${String(p.category ?? '').toUpperCase()}]${p.importance === 'critical' ? ' CRITICAL' : ''}`;
      pdf.text(stripUnsupportedChars(`${tag}  ${p.triggeredByTest ?? ''}`), margin, y); y += 4;
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 40, 40);
      const lines = pdf.splitTextToSize(stripUnsupportedChars(p.instruction ?? ''), contentW - 4);
      pdf.text(lines, margin + 3, y); y += lines.length * 3.5 + 1;
    });
  }

  // What to tell the doctor — patient-facing scripts the doctor sees so
  // they know the patient is prepared.
  if (Array.isArray((doc as any).tell_doctor) && (doc as any).tell_doctor.length > 0) {
    addSectionHeader('Patient Will Tell You');
    (doc as any).tell_doctor.forEach((t: any) => {
      checkPage(6);
      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(26, 26, 26);
      const text = typeof t === 'string' ? t : (t?.script ?? t?.text ?? t?.message ?? '');
      if (!text) return;
      const lines = pdf.splitTextToSize(stripUnsupportedChars('"' + text + '"'), contentW);
      pdf.text(lines, margin, y); y += lines.length * 3.5 + 1;
    });
  }

  // Patient questions — written for the patient to ask the doctor.
  if (Array.isArray((doc as any).patient_questions) && (doc as any).patient_questions.length > 0) {
    addSectionHeader('Questions the Patient Has');
    (doc as any).patient_questions.forEach((q: any) => {
      checkPage(6);
      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(26, 26, 26);
      const text = typeof q === 'string' ? q : (q?.question ?? q?.text ?? '');
      if (!text) return;
      const lines = pdf.splitTextToSize(stripUnsupportedChars('Q: ' + text), contentW);
      pdf.text(lines, margin, y); y += lines.length * 3.5 + 1;
    });
  }

  // Questions to ask — clinician-framed equivalents of patient_questions,
  // worded so the doctor can answer pointedly.
  if (Array.isArray((doc as any).questions_to_ask) && (doc as any).questions_to_ask.length > 0) {
    addSectionHeader('Clinical Questions');
    (doc as any).questions_to_ask.forEach((q: any) => {
      checkPage(6);
      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(26, 26, 26);
      const text = typeof q === 'string' ? q : (q?.question ?? q?.text ?? '');
      if (!text) return;
      const lines = pdf.splitTextToSize(stripUnsupportedChars('- ' + text), contentW);
      pdf.text(lines, margin, y); y += lines.length * 3.5 + 1;
    });
  }

  // Discussion Points
  addSectionHeader('Points to Raise');
  doc.discussion_points?.forEach(point => {
    checkPage(10);
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(26, 26, 26);
    // Handle both string and object discussion points
    const raw = typeof point === 'string' ? point : (typeof point === 'object' && point !== null ? Object.values(point).filter(v => typeof v === 'string').join(' - ') : String(point));
    const text = stripUnsupportedChars(raw);
    if (!text) return;
    const lines = pdf.splitTextToSize(`- ${text}`, contentW);
    pdf.text(lines, margin, y); y += lines.length * 3.5 + 2;
  });

  // Disclaimer
  if (y + 20 > pageH - margin) { pdf.addPage(); y = margin; }
  y = pageH - 20;
  pdf.setFontSize(6.5); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(155, 155, 155);
  const disc = 'This document was generated by CauseHealth for educational purposes only. It does not constitute medical advice. Values reflect functional medicine reference intervals.';
  pdf.text(pdf.splitTextToSize(disc, contentW), margin, y);

  pdf.save(`CauseHealth-DoctorPrep-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}
