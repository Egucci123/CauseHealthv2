// src/lib/pdfParser.ts
// PDF text extraction using PDF.js
// Worker configured at module level before any PDF operations

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Set worker — the ?url import gives us the bundled asset path in both dev and production
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export async function extractPDFText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

  let pdf: pdfjsLib.PDFDocumentProxy;
  try {
    pdf = await loadingTask.promise;
  } catch (err) {
    throw new Error(`Failed to load PDF: ${String(err)}`);
  }

  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const items = textContent.items as Array<{ str: string; transform: number[] }>;

    const sorted = [...items].sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) > 3) return yDiff;
      return a.transform[4] - b.transform[4];
    });

    const lines: string[][] = [];
    let currentLine: string[] = [];
    let lastY: number | null = null;

    sorted.forEach(item => {
      const y = item.transform[5];
      if (lastY === null || Math.abs(y - lastY) > 3) {
        if (currentLine.length > 0) lines.push(currentLine);
        currentLine = [item.str];
        lastY = y;
      } else {
        currentLine.push(item.str);
      }
    });
    if (currentLine.length > 0) lines.push(currentLine);

    const pageText = lines
      .map(line => line.join(' ').trim())
      .filter(line => line.length > 0)
      .join('\n');

    pageTexts.push(pageText);
  }

  return pageTexts.join('\n---PAGE BREAK---\n');
}

export function looksLikeLabReport(text: string): boolean {
  const labPatterns = [
    /\d+\.?\d*\s*(mg\/dL|IU\/L|mmol\/L|ng\/mL|pg\/mL|uIU\/mL|%|g\/dL|K\/uL|M\/uL|mEq\/L|U\/L|fL|cells\/uL|thou\/uL|mill\/uL|mcg\/dL|ug\/dL|mIU\/mL)/i,
    /(reference|normal|range|result|test|lab|panel|specimen|collected|ordered|physician|patient|clinical|pathology|diagnostic|accession|requisition)/i,
    /(glucose|cholesterol|creatinine|hemoglobin|TSH|ALT|AST|WBC|RBC|platelet|sodium|potassium|BUN|calcium|bilirubin|CBC|CMP|BMP|lipid|metabolic|hematology)/i,
  ];
  return labPatterns.filter(p => p.test(text)).length >= 2;
}
