import { useCallback, useRef, useState, type DragEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Upload, Loader2, Sparkles } from "lucide-react";
import { StepHeader } from "./StepHeader";
import { StepFooter } from "./StepFooter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { uploadStepperDocuments } from "@/server/stepper/uploads";
import { completeDocumentsStep } from "@/server/stepper/cases";
import { useStepperStore, useForcePollCase } from "@/lib/stepper/store";
import { flatRequirements, requirementsFor } from "@/lib/stepper/requirements";
import type { StepperCase, ChecklistItem, StepperUploadedDocument } from "@/lib/stepper/types";
import { DocumentsAgentChip } from "./documents/DocumentsAgentChip";
import { RequirementSlot } from "./documents/RequirementSlot";
import { CrossDocCheckBanner } from "./documents/CrossDocCheckBanner";
import { ContinueLaterDialog } from "./documents/ContinueLaterDialog";
import { DocumentsCompleteBanner } from "./documents/DocumentsCompleteBanner";
import { DocumentsRightPanel } from "./documents/DocumentsRightPanel";
import { DocStatGrid } from "./documents/DocStatGrid";
import { UnmatchedUploadsBanner } from "./documents/UnmatchedUploadsBanner";
import "./documents/agentStyles.css";

export function DocumentsStep({ caseData }: { caseData: StepperCase }) {
  const navigate = useNavigate();
  const { setCase, beginUpload, endUpload, isUploading } = useStepperStore();
  useForcePollCase(caseData.caseId, isUploading);

  const uploadOne = useCallback(
    async (file: File, requirementKey?: string) => {
      beginUpload();
      try {
        const fd = new FormData();
        fd.append("caseId", caseData.caseId);
        if (requirementKey) fd.append("requirementKey", requirementKey);
        fd.append("files", file);
        const saved = await uploadStepperDocuments({ data: fd });
        setCase(saved);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      } finally {
        endUpload();
      }
    },
    [beginUpload, endUpload, caseData.caseId, setCase],
  );

  if (!caseData.profile) return <div>Complete the Profile step first.</div>;
  const requirementGroups = requirementsFor(caseData.profile.legalForm);
  const requirements = flatRequirements(caseData.profile.legalForm);

  const checklistByReq = new Map<string, ChecklistItem>();
  for (const item of caseData.checklist) checklistByReq.set(item.requirementKey, item);

  const docsByReq = new Map<string, StepperUploadedDocument>();
  for (const d of caseData.uploadedDocuments) {
    for (const k of d.matchedRequirementKeys) docsByReq.set(k, d);
  }

  const satisfied = requirements.filter((r) => checklistByReq.has(r.key)).length;
  const allReceived = satisfied === requirements.length;
  const receivedDocs = requirements
    .map((r) => docsByReq.get(r.key))
    .filter((d): d is StepperUploadedDocument => !!d);

  const inFlightDoc = caseData.uploadedDocuments.find((d) => {
    const p = d.processingPhase;
    return p === "reading" || p === "classifying" || p === "matching" || p === "pending";
  });
  const inFlightReqKeys = new Set<string>();
  if (inFlightDoc) {
    for (const k of inFlightDoc.matchedRequirementKeys) inFlightReqKeys.add(k);
  }

  const goToOwnership = async () => {
    try {
      const saved = await completeDocumentsStep({ data: { caseId: caseData.caseId } });
      setCase(saved);
      navigate({ to: "/v2/onboarding/$step", params: { step: "ownership" } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  // Document-confidence breakdown for the stat grid.
  const readyDocs = caseData.uploadedDocuments.filter(
    (d) => d.processingPhase === "ready",
  );
  const highConfidence = readyDocs.filter((d) => d.classificationConfidence === "high").length;
  const mediumConfidence = readyDocs.filter(
    (d) => d.classificationConfidence === "medium" || d.classificationConfidence === "low",
  ).length;
  const missing = Math.max(0, requirements.length - satisfied);

  return (
    <div className="doc-step-v2 step-page-in">
      <StepHeader
        step={2}
        title="Documents"
        description={`Upload the documents required for a ${caseData.profile.legalForm.toLowerCase()}. We'll read, map, extract and validate each one.`}
        meta={[
          { label: "For", value: caseData.profile.legalForm },
          {
            label: "Required",
            value: `${requirements.length} document${requirements.length === 1 ? "" : "s"}`,
          },
        ]}
        rightSlot={
          <ContinueLaterDialog
            caseId={caseData.caseId}
            defaultEmail={caseData.profile.primaryContactEmail}
          />
        }
      />

      <DocumentsAgentChip caseData={caseData} satisfied={satisfied} total={requirements.length} />

      {/* Headline banner once everything's in — mirrors the mock's "All 6 documents
          have been received, processed and validated" announcement. Inline so it
          sits above the slots regardless of layout column. */}
      {allReceived && (
        <DocsHeadlineBanner
          total={requirements.length}
          highConfidence={highConfidence}
          mediumConfidence={mediumConfidence}
        />
      )}

      {/* Five-stat grid — always visible; values count up as docs land. */}
      <DocStatGrid
        received={satisfied}
        mapped={satisfied}
        highConfidence={highConfidence}
        mediumConfidence={mediumConfidence}
        missing={missing}
      />

      {/* Two-column workspace on lg+: slot list on the left, sticky agent panel on the right. */}
      <div className="mt-6 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {!allReceived && (
            <BulkUploadStrip
              caseId={caseData.caseId}
              uploadOne={uploadOne}
              isUploading={isUploading}
            />
          )}

          <UnmatchedUploadsBanner caseData={caseData} requirements={requirements} />

          <CrossDocCheckBanner flags={caseData.crossDocFlags} caseData={caseData} />

          <div data-testid="documents-slots" className="mt-6 space-y-6">
            {requirementGroups.map((group, gIdx) => (
              <section
                key={group.party}
                data-testid={`documents-group-${gIdx}`}
                className="step-item-in"
                style={{ animationDelay: `${gIdx * 0.05}s` }}
              >
                <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <span className="inline-block h-px w-4 bg-border" aria-hidden />
                  {group.party}
                  <span className="inline-block h-px flex-1 bg-border" aria-hidden />
                </h3>
                <ul
                  className={cn(
                    "grid grid-cols-1 gap-3",
                    allReceived && "sm:grid-cols-2",
                  )}
                >
                  {group.items.map((r) => {
                    const item = checklistByReq.get(r.key);
                    const doc = docsByReq.get(r.key);
                    const slotInFlight =
                      !!inFlightDoc &&
                      (inFlightDoc.matchedRequirementKeys.includes(r.key) ||
                        doc?.id === inFlightDoc.id);
                    return (
                      <RequirementSlot
                        key={r.key}
                        caseId={caseData.caseId}
                        requirement={r}
                        item={item}
                        doc={doc}
                        inFlight={slotInFlight}
                        onFile={(file) => uploadOne(file, r.key)}
                      />
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          <StepFooter
            onBack={() => navigate({ to: "/v2/onboarding/$step", params: { step: "profile" } })}
            onNext={goToOwnership}
            disableNext={!allReceived}
            nextLabel={
              allReceived
                ? "Continue"
                : `${requirements.length - satisfied} item${requirements.length - satisfied === 1 ? "" : "s"} remaining`
            }
            nextTestId="documents-next"
          />
        </div>

        <DocumentsRightPanel
          caseData={caseData}
          requirements={requirements}
          checklistByReq={checklistByReq}
          satisfied={satisfied}
          inFlightReqKeys={inFlightReqKeys}
          inFlightDoc={inFlightDoc}
          isUploading={isUploading}
        />
      </div>
    </div>
  );
}

/**
 * "All 6 documents have been received, processed and validated" headline.
 * Renders inline above the slots once every requirement is satisfied.
 */
function DocsHeadlineBanner({
  total,
  highConfidence,
  mediumConfidence,
}: {
  total: number;
  highConfidence: number;
  mediumConfidence: number;
}) {
  return (
    <div
      data-testid="docs-headline-banner"
      className="step-item-in mt-6 flex items-center gap-4 rounded-2xl border border-[#bde6eb] bg-gradient-to-b from-[#f8feff] to-surface px-5 py-4"
    >
      <div className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-primary text-white">
        <Sparkles className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Onboarding agent
        </div>
        <h3 className="mt-1 text-[15px] font-semibold text-primary">
          All {total} documents have been received, processed, and validated
        </h3>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          {highConfidence} high-confidence match{highConfidence === 1 ? "" : "es"}
          {mediumConfidence > 0 && (
            <>
              {" · "}
              <span className="text-[color:var(--warn)]">
                {mediumConfidence} item{mediumConfidence === 1 ? "" : "s"} to double-check before
                continuing
              </span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * Bulk strip at the top of the list. Splits the user's multi-file selection
 * into sequential per-file requests so the agent activity feed + slot phases
 * progress visibly file-by-file instead of landing as one bulk thump at the end.
 */
function BulkUploadStrip({
  caseId,
  uploadOne,
  isUploading,
}: {
  caseId: string;
  uploadOne: (file: File, requirementKey?: string) => Promise<void>;
  isUploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<{ total: number; done: number; current?: string }>({
    total: 0,
    done: 0,
  });

  const onFiles = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files) return;
      const arr = Array.from(files as FileList);
      if (arr.length === 0) return;
      setQueue({ total: arr.length, done: 0, current: arr[0]?.name });
      for (let i = 0; i < arr.length; i++) {
        const f = arr[i];
        setQueue({ total: arr.length, done: i, current: f.name });
        // Sequential — server is sequential anyway (loadCase/persistCase races), but
        // doing it sequentially client-side means each Promise resolves as that file
        // is fully processed, so the agent feed + slot updates land one at a time.

        await uploadOne(f);
      }
      setQueue({ total: 0, done: 0 });
    },
    [uploadOne],
  );

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    onFiles(e.dataTransfer.files);
  };

  const queuePct = queue.total > 0 ? Math.round((queue.done / queue.total) * 100) : 0;
  const showQueue = queue.total > 0;

  return (
    <div
      data-testid="documents-bulk-strip"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        "mt-6 overflow-hidden rounded-xl border-2 border-dashed transition-colors",
        dragOver
          ? "border-accent bg-accent/5"
          : "border-border bg-gradient-to-br from-primary/[0.04] via-transparent to-accent/[0.04] hover:border-accent/40",
      )}
    >
      <div className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary",
              isUploading && "doc-pulse",
            )}
          >
            {isUploading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Upload className="size-5" />
            )}
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              {showQueue
                ? `Uploading ${queue.done + 1} of ${queue.total}`
                : "Drop all your documents here"}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {showQueue && queue.current ? (
                <>
                  Processing <span className="font-medium text-foreground">{queue.current}</span>{" "}
                  through the agent…
                </>
              ) : (
                "The agent will sort each file into the right slot — or upload one at a time below. PDF, PNG, JPEG up to 32 MB each."
              )}
            </div>
          </div>
        </div>
        <Button
          data-testid="documents-bulk-choose"
          variant="outline"
          disabled={isUploading || showQueue}
          onClick={() => inputRef.current?.click()}
          className="shrink-0"
        >
          {isUploading || showQueue ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          {showQueue ? "Uploading…" : "Choose files"}
        </Button>
        <input
          ref={inputRef}
          data-testid="documents-bulk-input"
          type="file"
          multiple
          accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {showQueue && (
        <div className="h-1 bg-secondary">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${queuePct}%` }}
            data-testid="documents-bulk-progress"
          />
        </div>
      )}
    </div>
  );
}
