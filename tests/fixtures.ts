import { PDFDocument, StandardFonts } from "pdf-lib";

/** Synthetic passport PDF — used to test the PASSPORT-EXPIRED validation rule. */
export async function makePassportPdf(opts: {
  holder: string;
  nationality: string;
  passportNumber: string;
  issueDate: string;
  expiryDate: string;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 740;
  page.drawText("PASSPORT", { x: 50, y, size: 20, font: bold });
  y -= 24;
  page.drawText("United Kingdom of Great Britain and Northern Ireland", { x: 50, y, size: 11, font });

  y -= 40;
  const row = (label: string, value: string) => {
    page.drawText(label, { x: 50, y, size: 10, font: bold });
    page.drawText(value, { x: 220, y, size: 11, font });
    y -= 22;
  };
  row("Surname / Nom", opts.holder.split(" ").slice(-1)[0].toUpperCase());
  row("Given names / Prénoms", opts.holder.split(" ").slice(0, -1).join(" "));
  row("Nationality", opts.nationality);
  row("Passport No. / N° du passeport", opts.passportNumber);
  row("Date of issue", opts.issueDate);
  row("Date of expiry", opts.expiryDate);
  row("Authority / Autorité", "HMPO");

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

/**
 * Generates a synthetic "proof of address" PDF (utility bill) with a real table.
 * The table is what we want extraction to preserve as a Markdown table.
 */
export async function makeUtilityBillPdf(opts?: {
  holder?: string;
  address?: string;
  statementDate?: string;
}): Promise<Buffer> {
  const holder = opts?.holder ?? "Jane Doe";
  const address = opts?.address ?? "123 Maple Street, Springfield, IL 62704";
  const statementDate = opts?.statementDate ?? "15 May 2026";

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 740;
  page.drawText("CITY POWER & LIGHT CO.", { x: 50, y, size: 18, font: bold });
  y -= 22;
  page.drawText("Customer Utility Statement", { x: 50, y, size: 12, font });

  y -= 40;
  page.drawText(`Statement Date: ${statementDate}`, { x: 50, y, size: 11, font });
  y -= 18;
  page.drawText(`Account Holder: ${holder}`, { x: 50, y, size: 11, font });
  y -= 18;
  page.drawText(`Service Address: ${address}`, { x: 50, y, size: 11, font });

  y -= 30;
  page.drawText("Billing Period: 15 Apr 2026 to 14 May 2026", { x: 50, y, size: 11, font: bold });

  y -= 28;
  page.drawText("Description", { x: 50, y, size: 10, font: bold });
  page.drawText("Units", { x: 300, y, size: 10, font: bold });
  page.drawText("Rate", { x: 380, y, size: 10, font: bold });
  page.drawText("Amount", { x: 460, y, size: 10, font: bold });
  page.drawLine({ start: { x: 50, y: y - 5 }, end: { x: 560, y: y - 5 }, thickness: 1 });

  const rows = [
    ["Electricity consumption", "412 kWh", "$0.12", "$49.44"],
    ["Service fee", "1", "$8.50", "$8.50"],
    ["Sales tax", "-", "-", "$4.78"],
  ];
  y -= 22;
  for (const r of rows) {
    page.drawText(r[0], { x: 50, y, size: 10, font });
    page.drawText(r[1], { x: 300, y, size: 10, font });
    page.drawText(r[2], { x: 380, y, size: 10, font });
    page.drawText(r[3], { x: 460, y, size: 10, font });
    y -= 18;
  }
  page.drawLine({ start: { x: 50, y: y + 4 }, end: { x: 560, y: y + 4 }, thickness: 1 });
  y -= 8;
  page.drawText("Total Amount Due", { x: 50, y, size: 11, font: bold });
  page.drawText("$62.72", { x: 460, y, size: 11, font: bold });

  y -= 40;
  page.drawText(
    "This statement is provided as proof of residence for the named account holder.",
    { x: 50, y, size: 10, font },
  );

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
