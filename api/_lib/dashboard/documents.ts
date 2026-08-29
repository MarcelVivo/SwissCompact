import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

type LineItem = { description?: unknown; quantity?: unknown; unit?: unknown; unitPriceChf?: unknown; totalChf?: unknown };
type Client = { company_name?: string; contact_name?: string; address_line?: string; postal_code?: string; city?: string; email?: string };

const money = (value: unknown) => `CHF ${Number(value || 0).toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: unknown) => value ? new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Zurich" }).format(new Date(String(value))) : "-";
const safe = (value: unknown) => String(value ?? "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
  .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = safe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
    else { if (line) lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function text(page: PDFPage, font: PDFFont, value: unknown, x: number, y: number, size = 10, color = rgb(.12, .12, .14)) {
  page.drawText(safe(value), { x, y, size, font, color });
}

function basePage(pdf: PDFDocument, regular: PDFFont, bold: PDFFont, title: string, number: string) {
  const page = pdf.addPage([595.28, 841.89]);
  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: rgb(.985, .982, .976) });
  text(page, bold, "Swiss", 42, 790, 18); text(page, bold, "Compact", 88, 790, 18, rgb(.79, .04, .15));
  text(page, regular, "Digitale Raum- und Displayloesungen", 42, 770, 8, rgb(.4, .4, .42));
  text(page, bold, title, 370, 790, 18); text(page, regular, number, 370, 770, 9, rgb(.4, .4, .42));
  page.drawLine({ start: { x: 42, y: 750 }, end: { x: 553, y: 750 }, thickness: 1, color: rgb(.79, .04, .15) });
  return page;
}

function customerBlock(page: PDFPage, regular: PDFFont, bold: PDFFont, client: Client, meta: Array<[string, string]>) {
  text(page, bold, "Empfaenger", 42, 713, 8, rgb(.79, .04, .15));
  text(page, bold, client.company_name, 42, 691, 12);
  let y = 675;
  for (const line of [client.contact_name, client.address_line, [client.postal_code, client.city].filter(Boolean).join(" "), client.email].filter(Boolean)) {
    text(page, regular, line, 42, y, 9); y -= 14;
  }
  meta.forEach(([label, value], index) => {
    text(page, regular, label, 370, 703 - index * 18, 8, rgb(.4, .4, .42));
    text(page, bold, value, 450, 703 - index * 18, 8);
  });
}

export async function createQuotePdf(quote: Record<string, any>, client: Client): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Offerte ${safe(quote.quote_number)}`); pdf.setAuthor("SwissCompact · Marcel Spahr");
  const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = basePage(pdf, regular, bold, "OFFERTE", quote.quote_number);
  customerBlock(page, regular, bold, client, [["Datum", date(quote.updated_at)], ["Gueltig bis", date(quote.valid_until)], ["Waehrung", "CHF"]]);
  let y = 590;
  const header = () => {
    page.drawRectangle({ x: 42, y: y - 7, width: 511, height: 25, color: rgb(.08, .08, .09) });
    text(page, bold, "Leistung", 50, y, 8, rgb(1,1,1)); text(page, bold, "Menge", 355, y, 8, rgb(1,1,1)); text(page, bold, "Preis", 427, y, 8, rgb(1,1,1)); text(page, bold, "Total", 505, y, 8, rgb(1,1,1)); y -= 31;
  };
  header();
  for (const raw of (Array.isArray(quote.items) ? quote.items : []) as LineItem[]) {
    const descriptionLines = wrap(regular, String(raw.description || ""), 9, 280);
    const height = Math.max(30, descriptionLines.length * 12 + 10);
    if (y - height < 145) { page = basePage(pdf, regular, bold, "OFFERTE", quote.quote_number); y = 700; header(); }
    descriptionLines.forEach((line, index) => text(page, regular, line, 50, y - index * 12, 9));
    text(page, regular, `${raw.quantity} ${safe(raw.unit)}`, 355, y, 9);
    text(page, regular, money(raw.unitPriceChf), 427, y, 9);
    text(page, bold, money(raw.totalChf), 505, y, 9);
    page.drawLine({ start: { x: 42, y: y - height + 9 }, end: { x: 553, y: y - height + 9 }, thickness: .5, color: rgb(.82,.82,.82) });
    y -= height;
  }
  text(page, regular, "Total exkl. MWST", 390, y - 8, 9, rgb(.35,.35,.37)); text(page, bold, money(quote.total), 485, y - 8, 12);
  y -= 48; text(page, bold, "Konditionen", 42, y, 9, rgb(.79,.04,.15)); y -= 18;
  for (const line of wrap(regular, quote.terms || "", 8, 511).slice(0, 10)) { text(page, regular, line, 42, y, 8); y -= 11; }
  text(page, regular, "SwissCompact · Rechnungssteller: Marcel Spahr · Schwarzenburgstrasse 65 · 3008 Bern", 42, 35, 7, rgb(.4,.4,.42));
  return pdf.save({ useObjectStreams: false });
}

export async function createDepositInvoicePdf(invoice: Record<string, any>, quote: Record<string, any>, client: Client): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Rechnung ${safe(invoice.invoice_number)}`); pdf.setAuthor("SwissCompact · Marcel Spahr");
  const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = basePage(pdf, regular, bold, "RECHNUNG", invoice.invoice_number);
  customerBlock(page, regular, bold, client, [["Rechnungsdatum", date(invoice.issued_on)], ["Zahlbar bis", date(invoice.due_on)], ["Referenz", quote.quote_number]]);
  text(page, bold, "50-%-Anzahlung gemaess angenommener Offerte", 42, 580, 13);
  text(page, regular, `Projektauftrag gemaess Offerte ${quote.quote_number}`, 42, 550, 10);
  page.drawLine({ start: { x: 42, y: 525 }, end: { x: 553, y: 525 }, thickness: 1, color: rgb(.8,.8,.8) });
  text(page, regular, "Anzahlung 50 %", 42, 495, 10); text(page, bold, money(invoice.amount), 470, 495, 12);
  text(page, bold, "Rechnungsbetrag", 350, 450, 10); text(page, bold, money(invoice.amount), 470, 450, 15, rgb(.79,.04,.15));
  text(page, regular, "Nicht MWST-pflichtig. Zahlungsziel 14 Tage.", 42, 395, 9, rgb(.35,.35,.37));
  text(page, regular, "Die Zahlungsverbindung wird separat mitgeteilt, bis das gemeinsame Geschaeftskonto eingerichtet ist.", 42, 375, 8, rgb(.35,.35,.37));
  text(page, regular, "SwissCompact · Rechnungssteller: Marcel Spahr · Schwarzenburgstrasse 65 · 3008 Bern", 42, 35, 7, rgb(.4,.4,.42));
  return pdf.save({ useObjectStreams: false });
}
