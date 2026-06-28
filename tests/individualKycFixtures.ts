import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Helpers for synthesising the six demo Individual KYC PDFs that the product
 * team supplied. Each builder reproduces the text content of the corresponding
 * MGX demo PDF closely enough that Claude classifies it correctly without
 * requiring the original binaries to be checked into the repo.
 */

interface PageCtx {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
}

async function newPage(): Promise<{ pdf: PDFDocument; ctx: PageCtx }> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  return { pdf, ctx: { page, font, bold, y: 750 } };
}

function title(ctx: PageCtx, text: string) {
  ctx.page.drawText(text, { x: 50, y: ctx.y, size: 18, font: ctx.bold });
  ctx.y -= 28;
}

function subtitle(ctx: PageCtx, text: string) {
  ctx.page.drawText(text, { x: 50, y: ctx.y, size: 11, font: ctx.font });
  ctx.y -= 22;
}

function row(ctx: PageCtx, label: string, value: string) {
  ctx.page.drawText(label, { x: 50, y: ctx.y, size: 10, font: ctx.bold });
  ctx.page.drawText(value, { x: 240, y: ctx.y, size: 10, font: ctx.font });
  ctx.y -= 18;
}

function para(ctx: PageCtx, text: string) {
  ctx.page.drawText(text, { x: 50, y: ctx.y, size: 10, font: ctx.font });
  ctx.y -= 16;
}

function gap(ctx: PageCtx, h = 12) {
  ctx.y -= h;
}

// --- 01: Government-issued photo ID ----------------------------------------

export async function makeIndividualPhotoIdPdf(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Illustrative Government-Issued Photo ID Record");
  subtitle(ctx, "Investor: Amelia Rose Brooks");
  gap(ctx, 6);
  row(ctx, "Document reference", "IND-ID-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  gap(ctx, 4);
  row(ctx, "Full legal name", "Amelia Rose Brooks");
  row(ctx, "Date of birth", "14 May 1987");
  row(ctx, "Nationality", "British");
  row(ctx, "Place of birth", "Leeds, United Kingdom");
  row(ctx, "Document number", "DME-ABR-870514");
  row(ctx, "Issue date", "22 September 2021");
  row(ctx, "Expiry date", "21 September 2031");
  row(ctx, "Bearer signature", "Present");
  row(ctx, "Residential country", "United Arab Emirates");
  gap(ctx);
  para(ctx, "Visual identity placeholder: AB | Neutral demo portrait block | No biometric image included.");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// --- 02: Proof of residential address (utility statement) -------------------

export async function makeIndividualPoaPdf(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Illustrative Residential Utility Statement");
  subtitle(ctx, "Account holder: Amelia Rose Brooks");
  gap(ctx, 4);
  row(ctx, "Document reference", "IND-POA-001");
  row(ctx, "Service provider", "Harbour District Utilities - fictional");
  row(ctx, "Account number", "HDU-440192");
  row(ctx, "Statement date", "15 August 2025");
  row(ctx, "Service address", "Apartment 1408, Marina Vista Tower, Dubai Marina, Dubai, UAE");
  row(ctx, "Billing period", "01 July 2025 - 31 July 2025");
  row(ctx, "Amount due", "AED 612.40");
  gap(ctx);
  para(ctx, "Statement summary");
  row(ctx, "Electricity usage", "AED 322.10");
  row(ctx, "Water usage", "AED 128.55");
  row(ctx, "Cooling services", "AED 142.75");
  row(ctx, "Municipality fee", "AED 19.00");
  row(ctx, "Total", "AED 612.40");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// --- 03: Tax residency self-certification (CRS/FATCA) ----------------------

export async function makeIndividualTaxResidencyPdf(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Individual Tax Residency Self-Certification");
  subtitle(ctx, "CRS / FATCA declaration - fictional");
  gap(ctx, 4);
  row(ctx, "Document reference", "IND-TAX-001");
  row(ctx, "Individual", "Amelia Rose Brooks");
  row(ctx, "Primary tax residence", "United Arab Emirates");
  row(ctx, "Additional tax residences", "None declared");
  row(ctx, "US citizen or US tax resident", "No");
  row(ctx, "US TIN", "Not applicable");
  row(ctx, "UAE TIN", "Not issued for this individual");
  row(ctx, "Permanent residence address", "Apartment 1408, Marina Vista Tower, Dubai, UAE");
  gap(ctx);
  para(ctx, "Certification: I certify that the information provided in this fictional demo form");
  para(ctx, "is complete and accurate for demonstration purposes.");
  gap(ctx);
  row(ctx, "Amelia Rose Brooks (Investor)", "/s/ Amelia Rose Brooks   18 June 2026");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// --- 04: Source of Wealth confirmation -------------------------------------

export async function makeIndividualSourceOfWealthPdf(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Source of Wealth Confirmation");
  subtitle(ctx, "Investor: Amelia Rose Brooks");
  gap(ctx, 4);
  row(ctx, "Document reference", "IND-SOW-001");
  row(ctx, "Primary source", "Employment income and accumulated savings");
  row(ctx, "Secondary source", "Proceeds from sale of minority shares in Brightlake Consulting Ltd.");
  row(ctx, "Estimated total net worth range", "USD 1.5 million - USD 2.0 million");
  row(ctx, "Wealth accumulation period", "2012 - 2026");
  gap(ctx);
  para(ctx, "Narrative: wealth accumulated through senior technology consulting employment between");
  para(ctx, "2012 and 2025, plus proceeds received in December 2024 from the sale of a 12% interest in");
  para(ctx, "Brightlake Consulting Ltd.");
  gap(ctx);
  para(ctx, "Supporting evidence summary:");
  row(ctx, "Employer compensation letter", "BLC-HR-2025-88   10 Jan 2026   AED 1,080,000");
  row(ctx, "Share sale completion statement", "BLC-SALE-2024-12   19 Dec 2024   USD 640,000");
  gap(ctx);
  row(ctx, "Amelia Rose Brooks (Investor)", "/s/ Amelia Rose Brooks   18 June 2026");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// --- 05: Source of Funds — bank statement + subscription evidence ---------

export async function makeIndividualSourceOfFundsPdf(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Illustrative Bank Statement and Subscription Funding Evidence");
  subtitle(ctx, "Account holder: Amelia Rose Brooks");
  gap(ctx, 4);
  row(ctx, "Document reference", "IND-SOF-001");
  row(ctx, "Bank", "Emirates Crescent Bank - fictional");
  row(ctx, "Account holder", "Amelia Rose Brooks");
  row(ctx, "Account reference", "ECB-USD-XXXX4412");
  row(ctx, "Statement period", "01 June 2026 - 18 June 2026");
  row(ctx, "Currency", "USD");
  row(ctx, "Closing available balance", "USD 382,745.18");
  row(ctx, "Proposed subscription", "USD 250,000");
  gap(ctx);
  para(ctx, "Transactions");
  row(ctx, "03 Jun 2026  Opening balance", "401,210.18");
  row(ctx, "06 Jun 2026  Investment dividend", "Cr 28,500.00   429,710.18");
  row(ctx, "09 Jun 2026  Property maintenance", "Dr 6,965.00    422,745.18");
  row(ctx, "15 Jun 2026  Transfer to savings", "Dr 40,000.00   382,745.18");
  gap(ctx);
  para(ctx, "The investor confirms that the subscription will be remitted from the account shown");
  para(ctx, "above and that no third-party funding will be used.");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// --- 06: PEP declaration ---------------------------------------------------

export async function makeIndividualPepDeclarationPdf(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Politically Exposed Person Declaration");
  subtitle(ctx, "Investor and related-person declaration - fictional");
  gap(ctx, 4);
  row(ctx, "Document reference", "IND-PEP-001");
  row(ctx, "Declarant", "Amelia Rose Brooks");
  row(ctx, "Current prominent public function", "No");
  row(ctx, "Former prominent public function", "No");
  row(ctx, "Immediate family member of a PEP", "No");
  row(ctx, "Known close associate of a PEP", "No");
  row(ctx, "Additional explanation", "None");
  gap(ctx);
  para(ctx, "The declarant confirms that the responses above cover the declarant, immediate family");
  para(ctx, "members and known close associates.");
  gap(ctx);
  row(ctx, "Amelia Rose Brooks (Investor)", "/s/ Amelia Rose Brooks   18 June 2026");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

export const INDIVIDUAL_KYC_BUILDERS: { name: string; build: () => Promise<Buffer> }[] = [
  { name: "01_Government_Issued_Photo_ID.pdf", build: makeIndividualPhotoIdPdf },
  { name: "02_Proof_of_Residential_Address.pdf", build: makeIndividualPoaPdf },
  { name: "03_Tax_Residency_Self_Certification.pdf", build: makeIndividualTaxResidencyPdf },
  { name: "04_Source_of_Wealth_Confirmation.pdf", build: makeIndividualSourceOfWealthPdf },
  { name: "05_Source_of_Funds_Subscription.pdf", build: makeIndividualSourceOfFundsPdf },
  { name: "06_PEP_Declaration.pdf", build: makeIndividualPepDeclarationPdf },
];
