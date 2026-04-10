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
  const ccLines = pdf.splitTextToSize(doc.chief_complaint, contentW);
  pdf.text(ccLines, margin, y); y += ccLines.length * 4.5 + 2;

  // HPI
  addSectionHeader('History of Present Illness');
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(26, 26, 26);
  const hpiLines = pdf.splitTextToSize(doc.hpi, contentW);
  pdf.text(hpiLines, margin, y); y += hpiLines.length * 4.5 + 2;

  // PMH
  addSectionHeader('Past Medical History');
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(26, 26, 26);
  const pmhLines = pdf.splitTextToSize(doc.pmh, contentW);
  pdf.text(pmhLines, margin, y); y += pmhLines.length * 4.5 + 2;

  // Medications
  addSectionHeader('Current Medications');
  doc.medications.forEach(med => {
    checkPage(8);
    const line = `• ${med.name}${med.dose ? ` — ${med.dose}` : ''}${med.notable_depletion ? ` (depletes ${med.notable_depletion})` : ''}`;
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(26, 26, 26);
    const lines = pdf.splitTextToSize(line, contentW);
    pdf.text(lines, margin, y); y += lines.length * 3.5 + 1;
  });

  // Lab Findings
  if (doc.lab_summary?.urgent_findings?.length) {
    addSectionHeader(`Lab Results — ${doc.lab_summary.lab_name ?? ''} (${doc.lab_summary.draw_date ?? ''})`);
    pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor('#C94F4F');
    pdf.text('FINDINGS REQUIRING ATTENTION:', margin, y); y += 5;
    doc.lab_summary.urgent_findings.forEach(f => {
      checkPage(10);
      pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(26, 26, 26);
      pdf.text(`${f.marker}: ${f.value} [${f.flag.toUpperCase()}]`, margin + 2, y); y += 4;
      pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7.5); pdf.setTextColor(107, 107, 107);
      const nLines = pdf.splitTextToSize(f.clinical_note, contentW - 4);
      pdf.text(nLines, margin + 4, y); y += nLines.length * 3.5 + 2;
    });
  }

  // Tests to Request
  addSectionHeader('Tests to Request');
  doc.tests_to_request?.forEach((test, i) => {
    checkPage(22);
    pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(26, 26, 26);
    pdf.text(`${i + 1}. ${test.test_name} [${test.priority.toUpperCase()}]`, margin, y); y += 5;
    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(107, 107, 107);
    pdf.text(`ICD-10: ${test.icd10_primary} — ${test.icd10_description}`, margin + 3, y); y += 4;
    if (test.icd10_secondary) { pdf.text(`ICD-10: ${test.icd10_secondary} — ${test.icd10_secondary_description}`, margin + 3, y); y += 4; }
    pdf.setTextColor(26, 26, 26);
    const jLines = pdf.splitTextToSize(test.clinical_justification, contentW - 3);
    pdf.text(jLines, margin + 3, y); y += jLines.length * 3.5 + 5;
  });

  // Discussion Points
  addSectionHeader('Points to Raise');
  doc.discussion_points?.forEach(point => {
    checkPage(10);
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(26, 26, 26);
    // Handle both string and object discussion points
    const text = typeof point === 'string' ? point : (typeof point === 'object' && point !== null ? Object.values(point).filter(v => typeof v === 'string').join(' — ') : String(point));
    const lines = pdf.splitTextToSize(`• ${text}`, contentW);
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
