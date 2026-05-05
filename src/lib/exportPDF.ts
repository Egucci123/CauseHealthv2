// src/lib/exportPDF.ts
import jsPDF from 'jspdf';
import type { WellnessPlanData } from '../hooks/useWellnessPlan';
import type { DoctorPrepDocument } from '../hooks/useDoctorPrep';
import { format } from 'date-fns';

export function exportWellnessPlanPDF(plan: WellnessPlanData, userName: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = margin;

  const checkPage = (needed = 20) => { if (y + needed > pageH - margin) { doc.addPage(); y = margin; } };

  const addSection = (title: string) => {
    y += 6; checkPage(15);
    doc.setFillColor(27, 67, 50); // #1B4332
    doc.rect(margin, y - 4, contentW, 8, 'F');
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), margin + 3, y + 1); y += 8;
  };

  // Header
  doc.setFillColor(19, 19, 19); // #131313
  doc.rect(0, 0, pageW, 35, 'F');
  doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('CauseHealth.', margin, 18);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(165, 208, 185);
  doc.text('PERSONALIZED WELLNESS PLAN', margin, 26);
  doc.setTextColor(107, 107, 107);
  doc.text(`Generated ${format(new Date(plan.generated_at), 'MMMM d, yyyy')} | ${userName}`, margin, 32);
  y = 45;

  // Summary
  addSection('Clinical Summary');
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(26, 26, 26);
  const summaryLines = doc.splitTextToSize(plan.summary, contentW);
  doc.text(summaryLines, margin, y); y += summaryLines.length * 4.5 + 4;

  // Supplements
  addSection('Supplement Protocol');
  plan.supplement_stack.forEach((sup, i) => {
    checkPage(20);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
    doc.text(`${i + 1}. ${sup.nutrient} — ${sup.form}`, margin, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(107, 107, 107);
    doc.text(`Dose: ${sup.dose}   Timing: ${sup.timing}   Priority: ${sup.priority.toUpperCase()}`, margin + 4, y); y += 4;
    const whyLines = doc.splitTextToSize(sup.why, contentW - 4);
    doc.text(whyLines, margin + 4, y); y += whyLines.length * 3.5 + 4;
  });

  // Lifestyle
  addSection('Lifestyle Interventions');
  (['diet', 'sleep', 'exercise', 'stress'] as const).forEach(cat => {
    const items = plan.lifestyle_interventions[cat];
    if (!items?.length) return;
    checkPage(12);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 67, 50);
    doc.text(cat.charAt(0).toUpperCase() + cat.slice(1), margin, y); y += 5;
    items.forEach(item => {
      checkPage(10);
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
      const tLines = doc.splitTextToSize(`• ${item.intervention}`, contentW - 4);
      doc.text(tLines, margin + 2, y); y += tLines.length * 3.5 + 1;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 107, 107);
      const rLines = doc.splitTextToSize(item.rationale, contentW - 8);
      doc.text(rLines, margin + 6, y); y += rLines.length * 3.5 + 3;
    });
  });

  // 90-Day Plan
  addSection('90-Day Action Plan');
  [plan.action_plan.phase_1, plan.action_plan.phase_2, plan.action_plan.phase_3].forEach(phase => {
    checkPage(18);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
    doc.text(phase.name, margin, y); y += 5;
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(107, 107, 107);
    const fLines = doc.splitTextToSize(phase.focus, contentW);
    doc.text(fLines, margin, y); y += fLines.length * 3.5 + 2;
    doc.setFont('helvetica', 'normal');
    phase.actions.forEach(action => { checkPage(6); const aLines = doc.splitTextToSize(`• ${action}`, contentW - 4); doc.text(aLines, margin + 2, y); y += aLines.length * 3.5 + 1; });
    y += 4;
  });

  // Disclaimer
  checkPage(25); y = pageH - 25;
  doc.setFillColor(245, 240, 232);
  doc.rect(margin, y - 3, contentW, 20, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(107, 107, 107);
  const dLines = doc.splitTextToSize(plan.disclaimer, contentW - 4);
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
      ? "\"My labs look good — I'm using this visit to add a few advanced markers I haven't had before. I brought a summary with the specific tests and the ICD-10 codes that justify insurance coverage. Can we go through it together?\""
      : "\"I've been tracking my symptoms and I want a thorough workup so we can find the root causes, not just manage symptoms. I brought a summary with the tests I'm requesting and the ICD-10 codes that justify insurance coverage. Can we go through it together?\"",
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

  // 1. AI-suggested reactive tests (responding to specific abnormalities)
  if (doc.tests_to_request?.length) {
    para(isHealthyMode ? 'Top requests:' : 'Tests based on your abnormal labs:', { bold: true, size: 9, color: [27, 67, 50], gap: 3 });
    doc.tests_to_request.forEach((t, i) => {
      checkPage(28);
      pdf.setFontSize(9.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(19, 19, 19);
      pdf.text(stripUnsupportedChars(`${i + 1}. ${t.test_name}`), margin, y); y += 5;

      pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(212, 165, 116);
      pdf.text('Why this test matters for you:', margin + 3, y); y += 4;
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 40, 40);
      const whyLines = pdf.splitTextToSize(stripUnsupportedChars(t.clinical_justification), contentW - 6);
      pdf.text(whyLines, margin + 3, y); y += whyLines.length * 3.8 + 2;

      if (t.insurance_note) {
        pdf.setFont('helvetica', 'bold'); pdf.setTextColor(212, 165, 116); pdf.setFontSize(8);
        pdf.text('Insurance / cost note:', margin + 3, y); y += 3.5;
        pdf.setFont('helvetica', 'italic'); pdf.setTextColor(80, 80, 80);
        const insLines = pdf.splitTextToSize(stripUnsupportedChars(t.insurance_note), contentW - 6);
        pdf.text(insLines, margin + 3, y); y += insLines.length * 3.5 + 4;
      } else {
        y += 2;
      }
    });
  }

  // Panel-gap baseline section permanently removed. The AI's tests_to_request
  // (rendered above) is the single source of truth, already filtered by the
  // strict triage rule.

  // ── Possible conditions to investigate (differential) ────────────────
  // Distinct from tests_to_request: those are the baseline tests the doctor
  // missed; this is the differential — patterns the data fits that the
  // patient hasn't been diagnosed with, each with its own confirmatory workup.
  if (Array.isArray(doc.possible_conditions) && doc.possible_conditions.length > 0) {
    sectionHeader('Possible conditions to investigate');
    para(
      'Patterns in the labs / symptoms that fit conditions not yet on the chart. These are differentials, not diagnoses. Each one lists the confirmatory workup to ask about.',
      { color: [80, 80, 80], italic: true, size: 9, gap: 4 },
    );
    doc.possible_conditions.forEach((c, i) => {
      checkPage(34);
      pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(19, 19, 19);
      const conf = String(c.confidence ?? 'low').toUpperCase();
      pdf.text(stripUnsupportedChars(`${i + 1}. ${c.name}  [${conf}]`), margin, y); y += 5;
      if (c.icd10) {
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(140, 130, 110);
        pdf.text(stripUnsupportedChars(`ICD-10  ${c.icd10}`), margin + 3, y); y += 4;
      }
      if (c.evidence) {
        pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(212, 165, 116);
        pdf.text('Why this is on the differential:', margin + 3, y); y += 4;
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 40, 40);
        const evLines = pdf.splitTextToSize(stripUnsupportedChars(c.evidence), contentW - 6);
        pdf.text(evLines, margin + 3, y); y += evLines.length * 3.8 + 2;
      }
      if (Array.isArray(c.confirmatory_tests) && c.confirmatory_tests.length > 0) {
        pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(212, 165, 116);
        pdf.text('Tests to confirm:', margin + 3, y); y += 4;
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 40, 40);
        const tLines = pdf.splitTextToSize(stripUnsupportedChars('• ' + c.confirmatory_tests.join('\n• ')), contentW - 6);
        pdf.text(tLines, margin + 3, y); y += tLines.length * 3.8 + 2;
      }
      if (c.what_to_ask_doctor) {
        pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(212, 165, 116);
        pdf.text('Script for the visit:', margin + 3, y); y += 4;
        pdf.setFont('helvetica', 'italic'); pdf.setTextColor(40, 40, 40);
        const sLines = pdf.splitTextToSize(stripUnsupportedChars(`"${c.what_to_ask_doctor}"`), contentW - 6);
        pdf.text(sLines, margin + 3, y); y += sLines.length * 3.8 + 4;
      } else {
        y += 2;
      }
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

  // PMH
  addSectionHeader('Past Medical History');
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(26, 26, 26);
  const pmhLines = pdf.splitTextToSize(stripUnsupportedChars(doc.pmh), contentW);
  pdf.text(pmhLines, margin, y); y += pmhLines.length * 4.5 + 2;

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

  // Tests to Request
  addSectionHeader('Tests to Request');
  doc.tests_to_request?.forEach((test, i) => {
    checkPage(22);
    pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(26, 26, 26);
    pdf.text(stripUnsupportedChars(`${i + 1}. ${test.test_name} [${test.priority.toUpperCase()}]`), margin, y); y += 5;
    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(107, 107, 107);
    pdf.text(stripUnsupportedChars(`ICD-10: ${test.icd10_primary} - ${test.icd10_description}`), margin + 3, y); y += 4;
    if (test.icd10_secondary) { pdf.text(stripUnsupportedChars(`ICD-10: ${test.icd10_secondary} - ${test.icd10_secondary_description}`), margin + 3, y); y += 4; }
    pdf.setTextColor(26, 26, 26);
    const jLines = pdf.splitTextToSize(stripUnsupportedChars(test.clinical_justification), contentW - 3);
    pdf.text(jLines, margin + 3, y); y += jLines.length * 3.5 + 5;
  });

  // Comprehensive Health Screening / Tier 1-2-3 block permanently removed.
  // Test recommendations come exclusively from doc.tests_to_request, which
  // is filtered by the strict triage rule (symptom OR med depletion OR
  // out-of-range marker OR early-detection pattern). No more hardcoded
  // baseline-for-everyone lists in any PDF or page.

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
