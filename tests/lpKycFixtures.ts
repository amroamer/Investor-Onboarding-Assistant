import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Eleven demo Limited-Partnership KYC PDFs supplied by the product team for
 * the Atlas Growth Opportunities LP onboarding demo. Each builder mirrors the
 * original PDF's structure (title, form fields and signatures) closely enough
 * that the Claude classifier picks the same document type without us having to
 * check the binary fixtures into the repo.
 *
 * The content is intentionally text-only, single-page Helvetica — the classifier
 * keys on titles ("Certificate of Limited Partnership", "Register of Partners",
 * etc.) plus a handful of structural fields, all of which we reproduce here.
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

// ─── 01 — Certificate of Limited Partnership ──────────────────────────────────
export async function makeLpCertificate(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Certificate of Limited Partnership");
  subtitle(ctx, "Atlas Growth Opportunities LP");
  gap(ctx, 4);
  row(ctx, "Document reference", "LP-CERT-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  row(ctx, "Prepared for", "MGX Investor Onboarding Agent demo");
  gap(ctx);
  row(ctx, "Registered name", "Atlas Growth Opportunities LP");
  row(ctx, "Jurisdiction", "Cayman Islands");
  row(ctx, "Registration number", "LP-2022-00418");
  row(ctx, "Registration date", "07 March 2022");
  row(ctx, "Registered office", "89 Harbour Centre, George Town, Grand Cayman");
  row(ctx, "General partner", "Atlas Growth GP Ltd.");
  row(ctx, "Status", "Active - fictional registry extract");
  gap(ctx);
  row(ctx, "Registrar Demo Officer", "/s/ Registrar Demo Officer   08 March 2022");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ─── 02 — Executed Limited Partnership Agreement ──────────────────────────────
export async function makeLpAgreement(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Executed Limited Partnership Agreement");
  subtitle(ctx, "Atlas Growth Opportunities LP - consolidated with Amendment No. 1");
  gap(ctx, 4);
  row(ctx, "Document reference", "LP-LPA-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  row(ctx, "Prepared for", "MGX Investor Onboarding Agent demo");
  gap(ctx);
  heading(ctx, "Parties");
  para(ctx, "Atlas Growth GP Ltd. as General Partner and the persons admitted from time to time");
  para(ctx, "as Limited Partners.");
  gap(ctx);
  heading(ctx, "Key terms");
  row(ctx, "2.1", "Purpose: private growth-equity investments");
  row(ctx, "4.1", "Commitment period: five years from final close");
  row(ctx, "6.3", "General Partner contribution: 1% of aggregate commitments");
  row(ctx, "9.2", "Authorised signatories may execute subscription and banking documents");
  row(ctx, "15.1", "Governing law: Cayman Islands");
  gap(ctx);
  heading(ctx, "Amendment No. 1");
  para(ctx, "Effective 14 February 2025, the investment period was extended by twelve months.");
  gap(ctx);
  row(ctx, "Mira Patel", "Director, Atlas Growth GP Ltd.   /s/ Mira Patel   14 February 2025");
  row(ctx, "Noah Walker", "Limited Partner representative   /s/ Noah Walker   14 February 2025");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ─── 03 — Register of Partners ────────────────────────────────────────────────
export async function makeLpRegisterOfPartners(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Register of Partners");
  subtitle(ctx, "Atlas Growth Opportunities LP");
  gap(ctx, 4);
  row(ctx, "Document reference", "LP-REG-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  row(ctx, "Prepared for", "MGX Investor Onboarding Agent demo");
  gap(ctx);
  heading(ctx, "Partner roster");
  row(ctx, "Atlas Growth GP Ltd.", "General Partner   Cayman Islands   1%");
  row(ctx, "Cedar Pension Trust", "Limited Partner   Jersey   53%");
  row(ctx, "Noah Walker", "Limited Partner   United Kingdom   45%");
  row(ctx, "Total commitments", "99%");
  gap(ctx);
  para(ctx, "Effective date: 31 May 2026. Prepared by the General Partner.");
  gap(ctx);
  row(ctx, "Mira Patel", "Director, General Partner   /s/ Mira Patel   31 May 2026");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ─── 04 — Authorised Signatory List ───────────────────────────────────────────
export async function makeLpAuthorisedSignatories(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Authorised Signatory List");
  subtitle(ctx, "Atlas Growth Opportunities LP");
  gap(ctx, 4);
  row(ctx, "Document reference", "LP-SIGN-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  row(ctx, "Prepared for", "MGX Investor Onboarding Agent demo");
  gap(ctx);
  heading(ctx, "Authorised signatories");
  row(ctx, "Mira Patel", "Director of General Partner   Sole signatory up to USD 2,000,000");
  row(ctx, "Noah Walker", "Investment Committee Chair   Joint signatory above USD 2,000,000");
  gap(ctx);
  para(ctx, "The above authorities apply to subscription documents, capital calls and related");
  para(ctx, "banking instructions.");
  gap(ctx);
  row(ctx, "Noah Walker", "Chair, Investment Committee   /s/ Noah Walker   02 June 2026");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ─── 05 — Entity Tax Residency Self-Certification (CRS / FATCA) ───────────────
export async function makeLpTaxResidency(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Entity Tax Residency Self-Certification");
  subtitle(ctx, "Atlas Growth Opportunities LP - CRS / FATCA");
  gap(ctx, 4);
  row(ctx, "Document reference", "LP-TAX-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  row(ctx, "Prepared for", "MGX Investor Onboarding Agent demo");
  gap(ctx);
  row(ctx, "Entity legal name", "Atlas Growth Opportunities LP");
  row(ctx, "Jurisdiction of tax residence", "Cayman Islands");
  row(ctx, "Entity classification", "Passive Non-Financial Entity - investor confirmation");
  row(ctx, "US specified person", "No");
  row(ctx, "GIIN", "Not applicable");
  row(ctx, "Controlling persons disclosed", "Noah Walker; Mira Patel");
  row(ctx, "TIN", "Not issued in jurisdiction");
  gap(ctx);
  row(ctx, "Mira Patel", "Authorised signatory   /s/ Mira Patel   05 June 2026");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ─── 06 — Constitutional Documents of the General Partner ─────────────────────
export async function makeLpGpConstitutional(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Constitutional Documents of the General Partner");
  subtitle(ctx, "Atlas Growth GP Ltd.");
  gap(ctx, 4);
  row(ctx, "Document reference", "LP-GP-CONST-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  row(ctx, "Prepared for", "MGX Investor Onboarding Agent demo");
  gap(ctx);
  row(ctx, "Company name", "Atlas Growth GP Ltd.");
  row(ctx, "Company number", "CI-2021-77192");
  row(ctx, "Incorporation date", "09 November 2021");
  row(ctx, "Registered office", "89 Harbour Centre, George Town, Grand Cayman");
  row(ctx, "Share capital", "USD 50,000 divided into 50,000 ordinary shares");
  gap(ctx);
  heading(ctx, "Selected constitutional provisions");
  row(ctx, "Article 18", "The company may act as general partner of investment partnerships.");
  row(ctx, "Article 24", "The board may authorise any director to execute partnership documents.");
  row(ctx, "Article 31", "Board decisions may be made by written resolution.");
  gap(ctx);
  row(ctx, "Corporate Services Demo Ltd.", "Fictional company secretary   /s/ Corporate Services Demo Ltd.   10 November 2021");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ─── 07 — Register of Directors / Managers ────────────────────────────────────
export async function makeLpGpRegisterOfDirectors(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Register of Directors / Managers");
  subtitle(ctx, "Atlas Growth GP Ltd.");
  gap(ctx, 4);
  row(ctx, "Document reference", "LP-GP-DIR-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  row(ctx, "Prepared for", "MGX Investor Onboarding Agent demo");
  gap(ctx);
  heading(ctx, "Directors");
  row(ctx, "Mira Patel", "Director   Indian   Appointed 09 Nov 2021   Current");
  row(ctx, "Noah Walker", "Director   British   Appointed 09 Nov 2021   Current");
  gap(ctx);
  row(ctx, "Corporate Services Demo Ltd.", "Fictional company secretary   /s/ Corporate Services Demo Ltd.   31 May 2026");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ─── 08 — Written Resolution / Authority to Act ───────────────────────────────
export async function makeLpAuthorityToAct(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Written Resolution of the General Partner");
  subtitle(ctx, "Authority to act for Atlas Growth Opportunities LP");
  gap(ctx, 4);
  row(ctx, "Document reference", "LP-AUTH-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  row(ctx, "Prepared for", "MGX Investor Onboarding Agent demo");
  gap(ctx);
  para(ctx, "The directors of Atlas Growth GP Ltd. resolve that the partnership may subscribe up to");
  para(ctx, "USD 1,500,000 to the target fund and that Mira Patel is authorised to execute all related");
  para(ctx, "documents on behalf of the partnership.");
  gap(ctx);
  heading(ctx, "Resolutions");
  row(ctx, "Resolution 1", "Approve the proposed subscription of USD 1,500,000");
  row(ctx, "Resolution 2", "Authorise Mira Patel to execute subscription and KYC documents");
  row(ctx, "Resolution 3", "Authorise payment from the partnership account ending 8831");
  gap(ctx);
  row(ctx, "Mira Patel", "Director   /s/ Mira Patel   06 June 2026");
  row(ctx, "Noah Walker", "Director   /s/ Noah Walker   06 June 2026");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ─── 09 — Illustrative Photo ID Records ───────────────────────────────────────
export async function makeLpPhotoIds(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Illustrative Photo ID Records");
  subtitle(ctx, "Beneficial owner and authorised signatory");
  gap(ctx, 4);
  row(ctx, "Document reference", "LP-ID-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  row(ctx, "Prepared for", "MGX Investor Onboarding Agent demo");
  gap(ctx);
  heading(ctx, "Holder records");
  row(ctx, "Noah James Walker", "Beneficial owner / LP   DOB 21 Feb 1979");
  row(ctx, "  Nationality", "British");
  row(ctx, "  Demo ID reference", "DME-NJW-790221");
  row(ctx, "  Expiry", "30 Apr 2030");
  gap(ctx, 6);
  row(ctx, "Mira Anjali Patel", "Authorised signatory / GP director   DOB 09 Sep 1985");
  row(ctx, "  Nationality", "Indian");
  row(ctx, "  Demo ID reference", "DME-MAP-850909");
  row(ctx, "  Expiry", "12 Jan 2032");
  gap(ctx);
  para(ctx, "These are fictional identity-data records and do not reproduce any government document.");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ─── 10 — Proofs of Residential Address ───────────────────────────────────────
export async function makeLpProofsOfAddress(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "Illustrative Proofs of Residential Address");
  subtitle(ctx, "Relevant beneficial owner and authorised signatory");
  gap(ctx, 4);
  row(ctx, "Document reference", "LP-POA-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  row(ctx, "Prepared for", "MGX Investor Onboarding Agent demo");
  gap(ctx);
  heading(ctx, "Address records");
  row(ctx, "Noah James Walker", "18 Southbank Crescent, London, UK");
  row(ctx, "  Document type", "Bank statement");
  row(ctx, "  Issue date", "18 Apr 2026 (Recent)");
  gap(ctx, 6);
  row(ctx, "Mira Anjali Patel", "Villa 27, Al Barsha South, Dubai, UAE");
  row(ctx, "  Document type", "Utility bill");
  row(ctx, "  Issue date", "01 Jul 2025 (Older document)");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ─── 11 — PEP Declarations ────────────────────────────────────────────────────
export async function makeLpPepDeclarations(): Promise<Buffer> {
  const { pdf, ctx } = await newPage();
  title(ctx, "PEP Declarations");
  subtitle(ctx, "Beneficial owner and authorised signatory");
  gap(ctx, 4);
  row(ctx, "Document reference", "LP-PEP-001");
  row(ctx, "Status", "Illustrative / fictional / not valid");
  row(ctx, "Prepared for", "MGX Investor Onboarding Agent demo");
  gap(ctx);
  heading(ctx, "PEP self-declaration");
  row(ctx, "Noah James Walker", "Prominent public function: No");
  row(ctx, "  Family / close associate", "No");
  row(ctx, "  Explanation", "None");
  row(ctx, "  Signed", "Yes - 06 Jun 2026");
  gap(ctx, 6);
  row(ctx, "Mira Anjali Patel", "Prominent public function: No");
  row(ctx, "  Family / close associate", "No");
  row(ctx, "  Explanation", "None");
  row(ctx, "  Signed", "Yes - 06 Jun 2026");
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

export const LP_KYC_BUILDERS: { name: string; build: () => Promise<Buffer> }[] = [
  { name: "01_Certificate_of_Limited_Partnership.pdf", build: makeLpCertificate },
  { name: "02_Limited_Partnership_Agreement.pdf", build: makeLpAgreement },
  { name: "03_Register_of_Partners.pdf", build: makeLpRegisterOfPartners },
  { name: "04_Authorised_Signatory_List.pdf", build: makeLpAuthorisedSignatories },
  { name: "05_Tax_Residency_Self_Certification.pdf", build: makeLpTaxResidency },
  { name: "06_GP_Constitutional_Documents.pdf", build: makeLpGpConstitutional },
  { name: "07_GP_Register_of_Directors.pdf", build: makeLpGpRegisterOfDirectors },
  { name: "08_Evidence_of_Authority_to_Act.pdf", build: makeLpAuthorityToAct },
  { name: "09_Photo_IDs_Beneficial_Owner_and_Signatory.pdf", build: makeLpPhotoIds },
  { name: "10_Proofs_of_Residential_Address.pdf", build: makeLpProofsOfAddress },
  { name: "11_PEP_Declarations.pdf", build: makeLpPepDeclarations },
];
