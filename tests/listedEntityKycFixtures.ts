import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Seven demo Regulated / Listed Entity KYC PDFs for Nova Capital Markets PJSC.
 * Mirrors the user-supplied demo bundle (titles, key fields and signatures)
 * so the Claude classifier picks the same document type without needing to
 * commit any binary fixtures.
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

function heading(ctx: PageCtx, text: string) {
  ctx.page.drawText(text, { x: 50, y: ctx.y, size: 13, font: ctx.bold });
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

// ─── 01 — Evidence of Regulated Status ────────────────────────────────────────
export async function makeRegulatedStatus(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Illustrative Regulatory Licence Extract");
  subtitle(ctx, "Nova Capital Markets PJSC");
  gap(ctx, 4);
  row(ctx, "Document reference", "REG-LIC-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  row(ctx, "Prepared for", "MGX Investor Onboarding Agent demo");
  gap(ctx);
  row(ctx, "Regulated entity", "Nova Capital Markets PJSC");
  row(ctx, "Jurisdiction", "Dubai International Financial Centre");
  row(ctx, "Regulator", "Dubai Financial Services Authority - demo");
  row(ctx, "Licence number", "F009812-DEMO");
  row(ctx, "Licence status", "Active");
  row(
    ctx,
    "Licence scope",
    "Arranging Deals in Investments; Advising on Financial Products; Managing Assets",
  );
  row(ctx, "Effective date", "01 October 2023");
  row(ctx, "Next review date", "30 September 2026");
  gap(ctx);
  para(ctx, "This is a fictional licence extract and must not be interpreted as a real");
  para(ctx, "regulatory record.");
  gap(ctx);
  row(
    ctx,
    "Regulatory Registry Demo Officer",
    "/s/ Regulatory Registry Demo Officer   02 June 2026",
  );
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ─── 02 — Condensed Audited Financial Statements ─────────────────────────────
export async function makeAuditedFinancialStatements(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Condensed Audited Financial Statements");
  subtitle(ctx, "Nova Capital Markets PJSC - year ended 31 December 2025");
  gap(ctx, 4);
  row(ctx, "Document reference", "REG-FS-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  row(ctx, "Prepared for", "MGX Investor Onboarding Agent demo");
  gap(ctx);
  heading(ctx, "Independent auditor statement");
  para(ctx, "In our fictional opinion, the accompanying condensed statements present");
  para(ctx, "fairly, in all material respects, the financial position of the entity for");
  para(ctx, "demonstration purposes only.");
  gap(ctx);
  heading(ctx, "Statement of financial position (USD millions)");
  row(ctx, "Cash and cash equivalents", "2025: 42.8   2024: 35.4");
  row(ctx, "Financial investments", "2025: 118.6   2024: 103.2");
  row(ctx, "Total assets", "2025: 172.5   2024: 148.4");
  row(ctx, "Total liabilities", "2025: 48.9    2024: 43.5");
  row(ctx, "Shareholders equity", "2025: 123.6   2024: 104.9");
  gap(ctx);
  heading(ctx, "Income statement (USD millions)");
  row(ctx, "Revenue", "2025: 31.4   2024: 28.1");
  row(ctx, "Profit before tax", "2025: 13.2   2024: 11.4");
  row(ctx, "Net profit", "2025: 12.1   2024: 10.5");
  gap(ctx);
  row(ctx, "Demo Assurance LLP", "Fictional auditor   /s/ Demo Assurance LLP   15 March 2026");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ─── 03 — Authorised Signatory List and Board Resolution ─────────────────────
export async function makeAuthorisedSignatoryList(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Authorised Signatory List and Board Resolution");
  subtitle(ctx, "Nova Capital Markets PJSC");
  gap(ctx, 4);
  row(ctx, "Document reference", "REG-SIGN-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  row(ctx, "Prepared for", "MGX Investor Onboarding Agent demo");
  gap(ctx);
  para(ctx, "The board of Nova Capital Markets PJSC authorises the following persons to");
  para(ctx, "execute the USD 5,000,000 subscription.");
  gap(ctx);
  heading(ctx, "Authorised signatories");
  row(
    ctx,
    "Nadia Samira Rahman",
    "Chief Executive Officer   Sole signatory up to USD 5,000,000",
  );
  row(
    ctx,
    "Omar Khalid Haddad",
    "Chief Financial Officer   Joint signatory above USD 5,000,000",
  );
  gap(ctx);
  row(ctx, "Nadia Samira Rahman", "CEO   /s/ Nadia Samira Rahman   04 June 2026");
  row(ctx, "Omar Khalid Haddad", "CFO   /s/ Omar Khalid Haddad   04 June 2026");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ─── 04 — Entity Tax Residency Self-Certification ─────────────────────────────
export async function makeTaxResidency(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Entity Tax Residency Self-Certification");
  subtitle(ctx, "Nova Capital Markets PJSC - CRS / FATCA");
  gap(ctx, 4);
  row(ctx, "Document reference", "REG-TAX-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  row(ctx, "Prepared for", "MGX Investor Onboarding Agent demo");
  gap(ctx);
  row(ctx, "Entity legal name", "Nova Capital Markets PJSC");
  row(ctx, "Tax residence", "United Arab Emirates");
  row(ctx, "UAE TIN", "100004982100003 - fictional");
  row(ctx, "CRS classification", "Financial Institution - Investment Entity");
  row(ctx, "FATCA classification", "Participating Foreign Financial Institution - demo");
  row(ctx, "GIIN", "NCMP.DM.00000.ME.784 - fictional");
  gap(ctx);
  row(ctx, "Nadia Samira Rahman", "Authorised signatory   /s/ Nadia Samira Rahman   05 June 2026");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ─── 05 — Source of Funds (Corporate Bank Statement) ─────────────────────────
export async function makeSourceOfFunds(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Illustrative Corporate Bank Statement");
  subtitle(ctx, "Nova Capital Markets PJSC - subscription funding");
  gap(ctx, 4);
  row(ctx, "Document reference", "REG-SOF-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  row(ctx, "Prepared for", "MGX Investor Onboarding Agent demo");
  gap(ctx);
  row(ctx, "Bank", "Gulf Institutional Bank - fictional");
  row(ctx, "Account holder", "Nova Capital Markets PJSC");
  row(ctx, "Account reference", "GIB-USD-XXXX9810");
  row(ctx, "Available balance", "USD 9,844,610.00");
  row(ctx, "Proposed subscription", "USD 5,000,000");
  row(ctx, "Funding source", "Operating cash and matured investment proceeds");
  gap(ctx);
  heading(ctx, "Transaction history");
  row(ctx, "01 Jun 2026", "Opening balance                              8,944,610.00");
  row(ctx, "06 Jun 2026", "Maturity proceeds                +1,200,000  10,144,610.00");
  row(ctx, "14 Jun 2026", "Custody fees                       -300,000   9,844,610.00");
  gap(ctx);
  row(ctx, "Nadia Samira Rahman", "Authorised signatory   /s/ Nadia Samira Rahman   18 June 2026");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ─── 06 — Photo IDs for Authorised Signatories ───────────────────────────────
export async function makePhotoIds(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Illustrative Photo ID Records");
  subtitle(ctx, "Authorised signatories acting on the subscription");
  gap(ctx, 4);
  row(ctx, "Document reference", "REG-ID-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  row(ctx, "Prepared for", "MGX Investor Onboarding Agent demo");
  gap(ctx);
  heading(ctx, "Holder records");
  row(ctx, "Nadia Samira Rahman", "CEO / authorised signatory   DOB 12 Dec 1980");
  row(ctx, "  Nationality", "Emirati");
  row(ctx, "  Demo ID reference", "DME-NSR-801212");
  row(ctx, "  Expiry", "10 Oct 2031");
  gap(ctx, 6);
  row(ctx, "Omar Khalid Haddad", "CFO / authorised signatory   DOB 05 May 1977");
  row(ctx, "  Nationality", "Jordanian");
  row(ctx, "  Demo ID reference", "DME-OKH-770505");
  row(ctx, "  Expiry", "18 Feb 2030");
  gap(ctx);
  para(ctx, "These are fictional identity-data records and do not reproduce any");
  para(ctx, "government document.");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ─── 07 — Proofs of Residential Address ──────────────────────────────────────
export async function makeProofsOfAddress(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Illustrative Proofs of Residential Address");
  subtitle(ctx, "Authorised signatories acting on the subscription");
  gap(ctx, 4);
  row(ctx, "Document reference", "REG-POA-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  row(ctx, "Prepared for", "MGX Investor Onboarding Agent demo");
  gap(ctx);
  heading(ctx, "Address records");
  row(ctx, "Nadia Samira Rahman", "Villa 18, Jumeirah 2, Dubai, UAE");
  row(ctx, "  Document type", "Utility bill");
  row(ctx, "  Issue date", "08 May 2026 (Recent)");
  gap(ctx, 6);
  row(ctx, "Omar Khalid Haddad", "Apartment 2904, Downtown Views, Dubai, UAE");
  row(ctx, "  Document type", "Bank statement");
  row(ctx, "  Issue date", "02 Aug 2025 (Older than 6 months)");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

export const LISTED_ENTITY_KYC_BUILDERS: { name: string; build: () => Promise<Buffer> }[] = [
  { name: "01_Evidence_of_Regulated_Status.pdf", build: makeRegulatedStatus },
  { name: "02_Audited_Financial_Statements.pdf", build: makeAuditedFinancialStatements },
  { name: "03_Authorised_Signatory_List_and_Board_Resolution.pdf", build: makeAuthorisedSignatoryList },
  { name: "04_Tax_Residency_Self_Certification.pdf", build: makeTaxResidency },
  { name: "05_Source_of_Funds_Subscription.pdf", build: makeSourceOfFunds },
  { name: "06_Photo_IDs_Authorised_Signatories.pdf", build: makePhotoIds },
  { name: "07_Proofs_of_Residential_Address.pdf", build: makeProofsOfAddress },
];
