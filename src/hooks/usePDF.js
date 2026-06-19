import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export function usePDF() {
  const extractPDF = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = Math.min(pdf.numPages, 8);

    const pageParts = [];
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => item.str).join(' ');
      pageParts.push(pageText);
    }

    const text = pageParts.join('\n\n');
    if (text.trim().length < 200) {
      throw new Error(
        'Could not extract enough text from this PDF. Please use a text-based (non-scanned) PDF.'
      );
    }

    return { text, pages: numPages };
  };

  return { extractPDF };
}
