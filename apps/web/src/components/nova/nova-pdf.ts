// Nova PDF blocks — parse [[PDF:filename]] … [[/PDF]] fences out of a reply and
// render them as a real downloadable PDF (jsPDF, dynamically imported so it only
// loads when Nova actually produces a report). Ported from the legacy app's
// [[PDF:…]] protocol.

export interface NovaPdfBlock {
  filename: string;
  markdown: string;
}

const PDF_RE = /\[\[PDF:([^\]]+)\]\]([\s\S]*?)\[\[\/PDF\]\]/g;

/** Extract PDF blocks and return the reply text with the fences removed. */
export function extractPdfBlocks(text: string): {
  clean: string;
  blocks: NovaPdfBlock[];
} {
  const blocks: NovaPdfBlock[] = [];
  const clean = (text || '')
    .replace(PDF_RE, (_m, name: string, body: string) => {
      const filename = name.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
      blocks.push({
        filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
        markdown: body.trim(),
      });
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { clean, blocks };
}

/** Render a Nova PDF block to a downloaded file using jsPDF. */
export async function downloadNovaPdf(block: NovaPdfBlock): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (lineHeight: number) => {
    if (y + lineHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const writeWrapped = (
    text: string,
    fontSize: number,
    style: 'normal' | 'bold',
    gapAfter: number,
  ) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(fontSize);
    const lineHeight = fontSize * 1.35;
    // Render **bold** inline by splitting; jsPDF has no rich text, so we bold
    // the whole line if it is fully wrapped in ** or strip the markers otherwise.
    const plain = text.replace(/\*\*(.+?)\*\*/g, '$1');
    const lines = doc.splitTextToSize(plain, maxWidth);
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += gapAfter;
  };

  for (const rawLine of block.markdown.split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim()) {
      y += 6;
      continue;
    }
    if (line.startsWith('### ')) writeWrapped(line.slice(4), 12, 'bold', 4);
    else if (line.startsWith('## ')) writeWrapped(line.slice(3), 14, 'bold', 6);
    else if (line.startsWith('# ')) writeWrapped(line.slice(2), 18, 'bold', 8);
    else if (/^\s*[-*]\s+/.test(line))
      writeWrapped('•  ' + line.replace(/^\s*[-*]\s+/, ''), 11, 'normal', 2);
    else if (/^\s*\d+\.\s+/.test(line)) writeWrapped(line, 11, 'normal', 2);
    else writeWrapped(line, 11, 'normal', 4);
  }

  doc.save(block.filename);
}
