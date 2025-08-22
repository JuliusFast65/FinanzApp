import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ');
  }
  return text;
}

export function analyzeStatementText(text) {
  // Simplificado: busca montos, fechas y categorías
  const transactions = [];
  const lines = text.split('\n');
  lines.forEach(line => {
    const match = line.match(/(\d{2}\/\d{2}\/\d{4}).*?(\d+\.\d{2})/); // Ejemplo: fecha y monto
    if (match) {
      transactions.push({
        date: match[1],
        amount: parseFloat(match[2]),
        description: line.trim(),
      });
    }
  });
  return transactions;
}