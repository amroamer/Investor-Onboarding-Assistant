import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRightLeft, FileX, Trash2 } from "lucide-react";
import { useActiveCase, type CaseKey } from "@/lib/onboarding/store";
import { removeDocument, switchLegalForm } from "@/server/uploads";
import type { LegalForm, OnboardingCase, UploadedDocument } from "@/lib/onboarding/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Lists every uploaded document whose `matchOutcome` is not `matched`. Each
 * row exposes the same set of rescue actions regardless of legal form, so the
 * same tray works on Individual, Corporation, LP, Trust, and Regulated cases.
 *
 * If everything's matched, the tray renders nothing (it's an empty-state-
 * driven affordance, not a permanent UI surface).
 */
export function UnmatchedUploadsTray() {
  const { caseData } = useActiveCase();
  const unmatched = caseData.uploadedDocuments.filter(
    (d) => d.matchOutcome && d.matchOutcome !== "matched",
  );

  if (unmatched.length === 0) return null;

  return (
    <div
      data-testid="unmatched-uploads-tray"
      className="rounded-md border border-[color:var(--attention)]/40 bg-[color:var(--attention)]/5"
    >
      <div className="flex items-center gap-2 border-b border-[color:var(--attention)]/30 px-3 py-2">
        <AlertTriangle className="size-3.5 text-[color:var(--attention)]" />
        <div className="text-xs font-medium uppercase tracking-wider text-[color:var(--attention)]">
          {unmatched.length} file{unmatched.length === 1 ? "" : "s"} need
          {unmatched.length === 1 ? "s" : ""} your attention
        </div>
      </div>
      <ul className="divide-y divide-[color:var(--attention)]/20">
        {unmatched.map((d) => (
          <UnmatchedRow key={d.id} doc={d} caseData={caseData} />
        ))}
      </ul>
    </div>
  );
}

function UnmatchedRow({
  doc,
  caseData,
}: {
  doc: UploadedDocument;
  caseData: OnboardingCase;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"switch" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const spliceCase = (updated: OnboardingCase) => {
    queryClient.setQueryData<Record<CaseKey, OnboardingCase>>(["cases"], (prev) => {
      if (!prev) return prev;
      const k = (Object.keys(prev) as CaseKey[]).find(
        (kk) => prev[kk].caseId === updated.caseId,
      );
      if (!k) return prev;
      return { ...prev, [k]: updated };
    });
  };

  const onSwitch = async (form: LegalForm) => {
    if (busy) return;
    setBusy("switch");
    setError(null);
    try {
      const updated = (await switchLegalForm({
        data: { caseId: caseData.caseId, legalForm: form },
      })) as OnboardingCase;
      spliceCase(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't switch onboarding type.");
    } finally {
      setBusy(null);
    }
  };

  const onRemove = async () => {
    if (busy) return;
    setBusy("remove");
    setError(null);
    try {
      const updated = (await removeDocument({
        data: { caseId: caseData.caseId, docId: doc.id },
      })) as OnboardingCase;
      spliceCase(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove the file.");
    } finally {
      setBusy(null);
    }
  };

  const heading =
    doc.matchOutcome === "unmatched_wrong_form"
      ? "Wrong onboarding type"
      : doc.matchOutcome === "unmatched_unknown_type"
        ? "Couldn't identify this document"
        : doc.matchOutcome === "duplicate"
          ? "Duplicate of another upload"
          : "Needs review";

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start gap-2">
        <FileX className="mt-0.5 size-3.5 shrink-0 text-[color:var(--attention)]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <div className="truncate text-xs font-medium text-foreground" data-testid="unmatched-filename">
              {doc.fileName}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {doc.classifiedAs}
              {doc.classificationConfidence && (
                <span className="ml-1">· {doc.classificationConfidence} confidence</span>
              )}
            </div>
          </div>
          <div className="mt-0.5 text-[11px] font-medium text-[color:var(--attention)]">
            {heading}
          </div>
          {doc.matchReason && (
            <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {doc.matchReason}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {doc.matchOutcome === "unmatched_wrong_form" &&
              doc.suggestedLegalForm &&
              doc.suggestedLegalForm !== caseData.legalForm && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => onSwitch(doc.suggestedLegalForm!)}
                  className="h-6 px-2 text-[11px]"
                  data-testid="unmatched-switch-form"
                >
                  <ArrowRightLeft className="size-3" />
                  {busy === "switch"
                    ? "Switching…"
                    : `Switch to ${doc.suggestedLegalForm}`}
                </Button>
              )}
            <Button
              size="sm"
              variant="ghost"
              disabled={!!busy}
              onClick={onRemove}
              className={cn(
                "h-6 px-2 text-[11px] text-[color:var(--attention)] hover:bg-[color:var(--attention)]/10",
              )}
              data-testid="unmatched-remove"
            >
              <Trash2 className="size-3" />
              {busy === "remove" ? "Removing…" : "Remove"}
            </Button>
          </div>
          {error && (
            <div className="mt-1 text-[11px] text-destructive">{error}</div>
          )}
        </div>
      </div>
    </li>
  );
}
