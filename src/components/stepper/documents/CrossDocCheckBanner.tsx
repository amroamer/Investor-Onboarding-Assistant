import { useRef, useState } from "react";
import { AlertTriangle, Eye, RotateCcw, FileText, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDocumentViewer } from "@/components/stepper/DocumentViewer";
import { useStepperStore } from "@/lib/stepper/store";
import { replaceRequirement } from "@/server/stepper/uploads";
import { cn } from "@/lib/utils";
import type {
  CrossDocFlag,
  StepperCase,
  StepperUploadedDocument,
} from "@/lib/stepper/types";

interface Props {
  flags: CrossDocFlag[];
  /** Full case so we can resolve doc IDs into filenames + extracted names. */
  caseData: StepperCase;
}

/**
 * Inline hidden file input + Replace button used by the name-mismatch table.
 * Mirrors ReplaceInline but is anchored next to a specific upload so the
 * file picker → upload → success-toast loop happens right in the banner.
 * Previously this button only scrolled to the slot, which silently dead-ended
 * users who couldn't find the slot or didn't realise scrolling was the action.
 */
function CrossDocReplace({
  caseId,
  doc,
}: {
  caseId: string;
  doc: StepperUploadedDocument;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { setCase } = useStepperStore();
  const [busy, setBusy] = useState(false);
  const reqKey = doc.matchedRequirementKeys[0];

  const onPick = async (file: File) => {
    if (!reqKey) {
      toast.error("This upload isn't assigned to a slot yet — assign it first.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("caseId", caseId);
      fd.append("requirementKey", reqKey);
      fd.append("files", file);
      const saved = await replaceRequirement({ data: fd });
      setCase(saved);
      toast.success(`Replaced ${doc.fileName}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid={`mismatch-replace-${doc.id}`}
        disabled={busy || !reqKey}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--attention)]/40 bg-[color:var(--attention)]/10 px-2.5 py-1 text-[11.5px] font-semibold text-[color:var(--attention)] transition-colors hover:bg-[color:var(--attention)]/15",
          busy && "cursor-wait opacity-70",
        )}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
        Replace
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        data-testid={`mismatch-replace-input-${doc.id}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

/**
 * Cross-document consistency banner. Today the only flag kind is
 * `name_mismatch` — different holder names across documents that should
 * describe the same person. We render that as a tight comparison table:
 * one row per document, showing the name the agent read and an action
 * to either view or replace the file.
 *
 * If new flag kinds are added later, extend the `renderFlag()` switch.
 */
export function CrossDocCheckBanner({ flags, caseData }: Props) {
  if (flags.length === 0) return null;
  return (
    <div
      data-testid="cross-doc-banner"
      className="mt-4 overflow-hidden rounded-xl border border-[color:var(--attention)]/40 bg-[color:var(--attention)]/[0.04]"
    >
      <header className="flex items-start gap-3 border-b border-[color:var(--attention)]/30 px-5 py-3.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[color:var(--attention)]/15 text-[color:var(--attention)]">
          <AlertTriangle className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-[color:var(--attention)]">
            Information across your documents doesn't match
          </h3>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Compliance needs every document to describe the same person.
            Compare the names below and replace whichever document is wrong.
          </p>
        </div>
      </header>
      <div className="space-y-4 p-5">
        {flags.map((flag, i) => (
          <FlagBlock key={i} flag={flag} caseData={caseData} />
        ))}
      </div>
    </div>
  );
}

function FlagBlock({ flag, caseData }: { flag: CrossDocFlag; caseData: StepperCase }) {
  switch (flag.kind) {
    case "name_mismatch":
      return <NameMismatchTable flag={flag} caseData={caseData} />;
    default:
      // Unknown flag kind — fall back to the original prose so we never silently
      // drop a warning the validator generated.
      return (
        <div className="text-[13px] text-foreground/85">
          <FileText className="mr-1 inline size-3.5" /> {flag.detail}
        </div>
      );
  }
}

interface MismatchRow {
  doc: StepperUploadedDocument;
  name: string;
  /** The "group" this name belongs to — same number = same person. */
  groupIndex: number;
}

function NameMismatchTable({
  flag,
  caseData,
}: {
  flag: CrossDocFlag;
  caseData: StepperCase;
}) {
  const { openDocument } = useDocumentViewer();

  // Resolve each doc id → full upload, and pull the holder_name from
  // extractedFields. Group by normalised name so the table can colour-code
  // which docs disagree.
  const docs: MismatchRow[] = [];
  const groups = new Map<string, number>();
  for (const docId of flag.docIds) {
    const doc = caseData.uploadedDocuments.find((d) => d.id === docId);
    if (!doc) continue;
    const raw = doc.extractedFields["holder_name"] ?? "";
    const norm = raw.trim().toLowerCase().replace(/\s+/g, " ");
    let gi = groups.get(norm);
    if (gi === undefined) {
      gi = groups.size;
      groups.set(norm, gi);
    }
    docs.push({ doc, name: raw, groupIndex: gi });
  }

  // Dedupe — when several docs share the same id (unlikely) keep the first.
  const seen = new Set<string>();
  const rows = docs.filter((r) => {
    if (seen.has(r.doc.id)) return false;
    seen.add(r.doc.id);
    return true;
  });

  const groupCount = groups.size;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--attention)]/30 bg-surface px-2 py-1 font-medium text-[color:var(--attention)]">
          {groupCount} different name{groupCount === 1 ? "" : "s"} found
        </span>
        <span className="text-muted-foreground">
          across {rows.length} document{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border bg-surface">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-surface-muted/60">
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="px-4 py-2.5">Document</th>
              <th scope="col" className="px-4 py-2.5">Name on document</th>
              <th scope="col" className="px-4 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.doc.id} data-testid={`mismatch-row-${r.doc.id}`}>
                <td className="px-4 py-3 align-top">
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {r.doc.fileName}
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                        {r.doc.classifiedAs}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <GroupChip
                    name={r.name || "(name not extracted)"}
                    groupIndex={r.groupIndex}
                  />
                </td>
                <td className="px-4 py-3 align-top text-right">
                  <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                    <button
                      type="button"
                      data-testid={`mismatch-view-${r.doc.id}`}
                      onClick={() =>
                        openDocument({
                          docId: r.doc.id,
                          fileName: r.doc.fileName,
                          defaultTab: "pdf",
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-[11.5px] font-medium text-foreground/80 transition-colors hover:border-accent/50 hover:text-foreground"
                    >
                      <Eye className="size-3.5" /> View
                    </button>
                    <CrossDocReplace caseId={caseData.caseId} doc={r.doc} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Call-to-action steps */}
      <div className="mt-4 rounded-lg border bg-surface px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          What to do
        </div>
        <ol className="mt-2 space-y-1.5 text-[13px] text-foreground/85">
          <Step n={1}>
            Click <strong>View</strong> next to each document to confirm which
            name is correct.
          </Step>
          <Step n={2}>
            Click <strong>Replace</strong> next to the document(s) with the
            wrong name — it'll scroll to the matching slot so you can upload
            the right file.
          </Step>
          <Step n={3}>
            Once every row shows the same name, this warning disappears and
            you can continue.
          </Step>
        </ol>
      </div>
    </div>
  );
}

function GroupChip({ name, groupIndex }: { name: string; groupIndex: number }) {
  // Two stable colours: teal for "group A" (first distinct name we saw) and
  // amber for everything that disagrees with it. We don't try to figure out
  // which one is "correct" — the user makes that call.
  const isA = groupIndex === 0;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-[12px] font-medium",
        isA
          ? "border-accent/30 bg-accent/10 text-accent"
          : "border-[color:var(--warn)]/40 bg-[color:var(--warn)]/10 text-[color:var(--warn)]",
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", isA ? "bg-accent" : "bg-[color:var(--warn)]")}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold tabular-nums text-muted-foreground">
        {n}
      </span>
      <span className="min-w-0 flex-1">
        {children}
      </span>
      {n === 2 && (
        <ArrowRight aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      )}
    </li>
  );
}
