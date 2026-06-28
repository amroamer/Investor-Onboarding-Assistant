import { useRef, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { StepHeader } from "./StepHeader";
import { StepFooter } from "./StepFooter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { uploadStepperDocuments } from "@/server/stepper/uploads";
import { completeDocumentsStep } from "@/server/stepper/cases";
import { useStepperStore } from "@/lib/stepper/store";
import { flatRequirements } from "@/lib/stepper/requirements";
import type { StepperCase, ChecklistItem, StepperUploadedDocument } from "@/lib/stepper/types";

export function DocumentsStep({ caseData }: { caseData: StepperCase }) {
  const navigate = useNavigate();
  const { setCase } = useStepperStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [continuing, setContinuing] = useState(false);

  if (!caseData.profile) return <div>Complete the Profile step first.</div>;
  const requirements = flatRequirements(caseData.profile.legalForm);
  const checklistByReq = new Map<string, ChecklistItem>();
  for (const item of caseData.checklist) checklistByReq.set(item.requirementKey, item);

  const satisfied = requirements.filter((r) => checklistByReq.has(r.key)).length;
  const allReceived = satisfied === requirements.length;
  const attentionCount = caseData.checklist.filter((i) => i.status === "attention").length;

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setPending((p) => [...p, ...Array.from(files)]);
  };

  const removePending = (idx: number) => setPending((p) => p.filter((_, i) => i !== idx));

  const onUpload = async () => {
    if (pending.length === 0) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("caseId", caseData.caseId);
      for (const f of pending) fd.append("files", f);
      const saved = await uploadStepperDocuments({ data: fd });
      setCase(saved);
      setPending([]);
      toast.success("Documents processed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onNext = useCallback(async () => {
    setContinuing(true);
    try {
      const saved = await completeDocumentsStep({ data: { caseId: caseData.caseId } });
      setCase(saved);
      navigate({ to: "/v2/onboarding/$step", params: { step: "ownership" } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setContinuing(false);
    }
  }, [caseData.caseId, navigate, setCase]);

  return (
    <div>
      <StepHeader
        step={2}
        title="Documents"
        description={`Upload the documents required for a ${caseData.profile.legalForm} onboarding. We extract and classify each file, then map it to the checklist below.`}
        rightSlot={
          <div className="text-right">
            <div data-testid="documents-counter" className="text-3xl font-semibold tabular-nums text-primary">
              {satisfied} / {requirements.length}
            </div>
            <div className="text-xs text-muted-foreground">required items received</div>
          </div>
        }
      />

      <section className="mt-8 rounded-lg border bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Upload documents</div>
            <p className="mt-1 text-xs text-muted-foreground">PDF, PNG, JPEG or WebP up to 32 MB each. Up to 10 files per upload.</p>
          </div>
          <input
            ref={inputRef}
            data-testid="documents-file-input"
            type="file"
            multiple
            accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <Button data-testid="documents-choose-files" variant="outline" onClick={() => inputRef.current?.click()}>
            <Upload className="size-4" /> Choose files
          </Button>
        </div>

        {pending.length > 0 && (
          <ul className="mt-4 divide-y rounded-md border bg-background">
            {pending.map((f, idx) => (
              <li key={`${f.name}-${idx}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 truncate"><FileText className="size-4 text-muted-foreground" /> {f.name}</span>
                <button onClick={() => removePending(idx)} className="text-xs text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {pending.length > 0 && (
          <div className="mt-3 flex justify-end">
            <Button data-testid="documents-submit-upload" onClick={onUpload} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Submit upload
            </Button>
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="text-sm font-medium">Required items</div>
        <p className="mt-1 text-xs text-muted-foreground">Each checklist item below must have a matching document before you can continue.</p>
        <ul data-testid="documents-checklist" className="mt-3 divide-y rounded-lg border bg-surface">
          {requirements.map((r) => {
            const item = checklistByReq.get(r.key);
            return (
              <li key={r.key} data-testid={`checklist-item-${r.key}`} data-status={item?.status ?? "required"} className="flex items-start gap-3 px-4 py-3">
                <StatusBadge status={item?.status ?? "required"} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{r.name}</div>
                  {r.note && <div className="mt-0.5 text-xs text-muted-foreground">{r.note}</div>}
                  {item?.issue && (
                    <div className="mt-1 text-xs text-[color:var(--attention)]">
                      {item.issue} {item.remedy ? `— ${item.remedy}` : null}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8">
        <div className="text-sm font-medium">Uploaded files</div>
        <ul data-testid="documents-uploaded" className="mt-3 divide-y rounded-lg border bg-surface">
          {caseData.uploadedDocuments.length === 0 && (
            <li className="px-4 py-3 text-xs text-muted-foreground">No documents uploaded yet.</li>
          )}
          {caseData.uploadedDocuments.map((d) => (
            <UploadedRow key={d.id} doc={d} />
          ))}
        </ul>
      </section>

      {attentionCount > 0 && (
        <div data-testid="documents-attention-banner" className="mt-6 rounded-md border border-[color:var(--attention)]/40 bg-[color:var(--attention)]/5 px-4 py-3 text-xs text-[color:var(--attention)]">
          {attentionCount} document{attentionCount === 1 ? "" : "s"} need{attentionCount === 1 ? "s" : ""} your attention before we can submit the case.
        </div>
      )}

      <StepFooter
        onBack={() => navigate({ to: "/v2/onboarding/$step", params: { step: "profile" } })}
        onNext={onNext}
        busy={continuing}
        disableNext={!allReceived}
        nextLabel={allReceived ? "Continue" : `${requirements.length - satisfied} item${requirements.length - satisfied === 1 ? "" : "s"} remaining`}
        nextTestId="documents-next"
      />
    </div>
  );
}

function StatusBadge({ status }: { status: ChecklistItem["status"] | "required" }) {
  if (status === "received" || status === "accepted")
    return <CheckCircle2 className="mt-0.5 size-4 text-accent" />;
  if (status === "attention")
    return <AlertCircle className="mt-0.5 size-4 text-[color:var(--attention)]" />;
  return <span className="mt-1 size-3 rounded-full border-2 border-muted-foreground/40" />;
}

function UploadedRow({ doc }: { doc: StepperUploadedDocument }) {
  return (
    <li data-testid={`uploaded-file-${doc.id}`} className="flex items-center gap-3 px-4 py-3 text-sm">
      <FileText className="size-4 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{doc.fileName}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span data-testid="uploaded-classification">{doc.classifiedAs}</span>
          {doc.classificationConfidence && <span>· confidence {doc.classificationConfidence}</span>}
        </div>
      </div>
      <StatusPill status={doc.status} />
    </li>
  );
}

function StatusPill({ status }: { status: StepperUploadedDocument["status"] }) {
  const className = cn(
    "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
    status === "ready" && "bg-accent/15 text-accent",
    status === "failed" && "bg-[color:var(--attention)]/15 text-[color:var(--attention)]",
    (status === "extracting" || status === "uploading") && "bg-secondary text-muted-foreground",
  );
  return <span className={className}>{status}</span>;
}
