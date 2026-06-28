import type { OnboardingCase } from "@/lib/onboarding/types";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileText } from "lucide-react";

export function ReviewCard({
  caseData,
  onSubmit,
  resolved = false,
}: {
  caseData: OnboardingCase;
  onSubmit: () => void;
  resolved?: boolean;
}) {
  const sections: { title: string; rows: { label: string; value: string; source?: string }[] }[] = [
    {
      title: "Investor identity",
      rows: [
        {
          label: "Legal name",
          value: caseData.investorName,
          source: "From Certificate of Incorporation",
        },
        { label: "Legal form", value: caseData.legalForm ?? "—", source: "Provided by you" },
        {
          label: "Jurisdiction",
          value: caseData.jurisdiction ?? "—",
          source: "From Certificate of Incorporation",
        },
      ],
    },
    {
      title: "Ownership and control",
      rows: caseData.relatedParties.map((p) => ({
        label: p.role,
        value: `${p.name}${p.ownershipPct ? ` · ${p.ownershipPct}%` : ""}`,
        source: p.role.includes("Underlying")
          ? "Inferred from corporate registers"
          : "From Register of Shareholders",
      })),
    },
    {
      title: "Source of Wealth and Source of Funds",
      rows: [
        {
          label: "Source of Wealth",
          value: caseData.sourceOfWealth
            ? `${caseData.sourceOfWealth.category} — ${caseData.sourceOfWealth.detail || "—"}`
            : "—",
          source: caseData.sourceOfWealth?.source,
        },
        {
          label: "Source of Funds",
          value: caseData.sourceOfFunds
            ? `${caseData.sourceOfFunds.category} — ${caseData.sourceOfFunds.detail || "—"}`
            : "—",
          source: caseData.sourceOfFunds?.source,
        },
      ],
    },
    {
      title: "Declarations",
      rows: [
        { label: "PEP declaration", value: caseData.pepConfirmed ? "Submitted" : "Outstanding" },
        { label: "FATCA / CRS", value: caseData.fatcaConfirmed ? "Confirmed" : "Outstanding" },
      ],
    },
    {
      title: "Uploaded documents",
      rows: caseData.uploadedDocuments.map((d) => ({ label: d.classifiedAs, value: d.fileName })),
    },
  ];

  return (
    <div className="overflow-hidden rounded-lg border bg-surface">
      <div className="border-b bg-surface-muted px-4 py-2.5">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Final review
        </div>
      </div>
      <div className="divide-y">
        {sections.map((s) => (
          <div key={s.title} className="px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {s.title}
            </div>
            <ul className="mt-2 space-y-1.5">
              {s.rows.map((r, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <div className="text-muted-foreground">{r.label}</div>
                  <div className="text-right">
                    <div className="text-foreground">{r.value}</div>
                    {r.source && <div className="text-xs text-muted-foreground">{r.source}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t bg-surface-muted px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="size-3.5" /> {caseData.uploadedDocuments.length} documents included
        </div>
        <Button size="sm" onClick={onSubmit} disabled={resolved} data-testid="review-submit">
          <CheckCircle2 className="size-3.5" />{" "}
          {resolved ? "Submitted" : "Confirm all and submit to Compliance"}
        </Button>
      </div>
    </div>
  );
}
