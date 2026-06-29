import { useMemo, useState } from "react";
import { AlertTriangle, Eye, FileText, ChevronDown, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDocumentViewer } from "@/components/stepper/DocumentViewer";
import { cn } from "@/lib/utils";
import { getStepperFile, replaceRequirement } from "@/server/stepper/uploads";
import { useStepperStore } from "@/lib/stepper/store";
import type { StepperCase, StepperUploadedDocument } from "@/lib/stepper/types";
import type { RequirementItem } from "@/lib/stepper/requirements";

interface Props {
  caseData: StepperCase;
  /** Flat list of requirements for the active form — drives the slot picker. */
  requirements: RequirementItem[];
}

/**
 * Shows every upload the agent finished processing but couldn't slot, with
 * a specific reason and a one-click "Assign to slot" action.
 *
 * Three rejection modes are surfaced today:
 *   1. Classifier returned "other" (low confidence) — agent doesn't know the type.
 *   2. Classifier identified the type but no slot on the active form accepts it.
 *   3. A higher-confidence document already fills the slot the classifier
 *      wanted — the new doc was held back so it didn't kick the better match
 *      out (see uploads.ts confidence-aware acceptance).
 */
export function UnmatchedUploadsBanner({ caseData, requirements }: Props) {
  const unmatched = caseData.uploadedDocuments.filter(
    (d) =>
      d.status === "ready" &&
      d.processingPhase === "ready" &&
      d.matchedRequirementKeys.length === 0,
  );
  if (unmatched.length === 0) return null;

  // Quick lookup: for a given classifiedAs label, which already-matched doc
  // (if any) sits on a slot that accepts that label. Used to surface the
  // "Already filled by X" reason.
  const matchedByLabel = new Map<string, StepperUploadedDocument>();
  for (const d of caseData.uploadedDocuments) {
    if (d.matchedRequirementKeys.length === 0) continue;
    if (d.status !== "ready") continue;
    if (!matchedByLabel.has(d.classifiedAs)) {
      matchedByLabel.set(d.classifiedAs, d);
    }
  }

  return (
    <div
      data-testid="unmatched-uploads-banner"
      className="mt-4 rounded-xl border border-[color:var(--warn)]/40 bg-[color:var(--warn)]/[0.04]"
    >
      <header className="flex items-start gap-3 rounded-t-xl border-b border-[color:var(--warn)]/30 px-5 py-3.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[color:var(--warn)]/15 text-[color:var(--warn)]">
          <AlertTriangle className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-[color:var(--warn)]">
            {unmatched.length === 1
              ? "1 upload needs you to pick a slot"
              : `${unmatched.length} uploads need you to pick a slot`}
          </h3>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            The agent finished reading each file but couldn't auto-assign it. Pick the right slot below.
          </p>
        </div>
      </header>
      <ul className="divide-y">
        {unmatched.map((doc) => (
          <UnmatchedRow
            key={doc.id}
            caseData={caseData}
            doc={doc}
            requirements={requirements}
            blockerForLabel={matchedByLabel.get(doc.classifiedAs)}
          />
        ))}
      </ul>
    </div>
  );
}

function UnmatchedRow({
  caseData,
  doc,
  requirements,
  blockerForLabel,
}: {
  caseData: StepperCase;
  doc: StepperUploadedDocument;
  requirements: RequirementItem[];
  blockerForLabel: StepperUploadedDocument | undefined;
}) {
  const { openDocument } = useDocumentViewer();
  const { setCase, beginUpload, endUpload, isUploading } = useStepperStore();
  const [assigning, setAssigning] = useState(false);
  const [open, setOpen] = useState(false);

  const isUncategorised = doc.classifiedAs === "Uncategorised document";

  // Build the explanation shown under the file name. Three priorities:
  //   1. Low-confidence "Uncategorised" → agent can't read the type
  //   2. A higher-confidence file already holds the slot the agent wanted
  //   3. Fallback — classified but no slot on this form accepts the type
  const reason = useMemo(() => {
    if (isUncategorised) {
      return "The agent couldn't confidently identify what type of document this is.";
    }
    if (blockerForLabel && confidenceRank(blockerForLabel.classificationConfidence) > confidenceRank(doc.classificationConfidence)) {
      return `Another file (${blockerForLabel.fileName}) already fills the ${blockerForLabel.classifiedAs} slot with higher confidence. Pick the slot this file really belongs in.`;
    }
    return `Read as ${doc.classifiedAs}, but no slot on this form accepts that type. Pick the slot this file should fill if you still want to use it.`;
  }, [isUncategorised, blockerForLabel, doc.classifiedAs, doc.classificationConfidence]);

  // Map every requirement → the doc currently filling it (if any). Used to
  // mark slots in the picker as Filled vs Open so the user can see the
  // consequence of their choice before clicking.
  const filledByReq = useMemo(() => {
    const m = new Map<string, StepperUploadedDocument>();
    for (const d of caseData.uploadedDocuments) {
      if (d.status !== "ready") continue;
      for (const k of d.matchedRequirementKeys) m.set(k, d);
    }
    return m;
  }, [caseData.uploadedDocuments]);

  const onPick = async (reqKey: string) => {
    if (assigning) return;
    setOpen(false);
    setAssigning(true);
    beginUpload();
    try {
      // The server-side replace expects fresh bytes — we re-fetch the original
      // file through the existing getStepperFile server fn (same path the PDF
      // viewer uses), then submit it against the chosen slot.
      const payload = await getStepperFile({ data: { id: doc.id } });
      const bin = Uint8Array.from(atob(payload.base64), (c) => c.charCodeAt(0));
      const file = new File([bin], payload.fileName, { type: payload.mimeType });
      const fd = new FormData();
      fd.append("caseId", caseData.caseId);
      fd.append("requirementKey", reqKey);
      fd.append("files", file);
      const saved = await replaceRequirement({ data: fd });
      setCase(saved);
      toast.success(`Assigned ${doc.fileName} to that slot.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      endUpload();
      setAssigning(false);
    }
  };

  return (
    <li className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <div className="truncate text-[13.5px] font-medium text-foreground">
            {doc.fileName}
          </div>
          <div className="text-[11.5px] text-muted-foreground">
            Read as {doc.classifiedAs}
            {doc.classificationConfidence
              ? ` · confidence ${doc.classificationConfidence}`
              : ""}
          </div>
          <div className="text-[12px] leading-snug text-foreground/75">
            {reason}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          data-testid={`unmatched-view-${doc.id}`}
          onClick={() =>
            openDocument({
              docId: doc.id,
              fileName: doc.fileName,
              defaultTab: "pdf",
            })
          }
          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-[11.5px] font-medium text-foreground/80 transition-colors hover:border-accent/50 hover:text-foreground"
        >
          <Eye className="size-3.5" /> View
        </button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-testid={`unmatched-assign-${doc.id}`}
              disabled={assigning || isUploading}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--warn)]/40 bg-[color:var(--warn)]/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-[color:var(--warn)] transition-colors hover:bg-[color:var(--warn)]/15",
                (assigning || isUploading) && "cursor-not-allowed opacity-60",
              )}
            >
              {assigning ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Assign to slot
              <ChevronDown className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={6}
            className="w-80 max-w-[90vw] p-0"
          >
            <div className="border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Where should this file go?
            </div>
            <ul className="max-h-72 overflow-y-auto py-1">
              {requirements.map((r) => {
                const filler = filledByReq.get(r.key);
                return (
                  <li key={r.key}>
                    <button
                      type="button"
                      data-testid={`assign-target-${r.key}`}
                      onClick={() => onPick(r.key)}
                      className="block w-full px-3 py-2 text-left text-[12.5px] hover:bg-secondary/60"
                    >
                      <div className="flex items-start gap-2">
                        {filler ? (
                          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-accent" />
                        ) : (
                          <span
                            aria-hidden
                            className="mt-1 size-3.5 shrink-0 rounded-full border border-muted-foreground/40"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-foreground">{r.name}</div>
                          {filler ? (
                            <div className="truncate text-[11px] text-muted-foreground">
                              Will replace {filler.fileName}
                            </div>
                          ) : r.note ? (
                            <div className="truncate text-[11px] text-muted-foreground">
                              {r.note}
                            </div>
                          ) : (
                            <div className="text-[11px] text-muted-foreground">Empty slot</div>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
    </li>
  );
}

function confidenceRank(conf: string | null | undefined): number {
  if (conf === "high") return 3;
  if (conf === "medium") return 2;
  if (conf === "low") return 1;
  return 0;
}
