/**
 * Investor-facing RFI inbox for the v2 stepper flow.
 *
 * After submission the investor lands on SubmittedStep — compliance may
 * later draft + send RFIs from the workspace. This component lets the
 * investor see those requests and reply, closing the loop without leaving
 * the stepper UI.
 *
 * Mirrors the legacy chat-flow RfiCard, but reads/writes through the
 * stepper compliance server fns instead of the legacy onboarding ones.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getStepperComplianceState,
  respondToStepperRfi,
} from "@/server/stepper/compliance";
import type {
  StepperComplianceState,
  StepperRfi,
} from "@/lib/stepper/compliance";

const stateQueryKey = (caseId: string) => ["stepper-compliance-state", caseId] as const;

export function InvestorRfiInbox({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: state } = useQuery({
    queryKey: stateQueryKey(caseId),
    queryFn: () => getStepperComplianceState({ data: { caseId } }),
    // The investor's view of compliance state needs to refresh when the
    // compliance officer sends new RFIs. Poll while the tab is in focus.
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  if (!state) return null;

  // Only show items the investor needs to see — drafts are internal to compliance.
  const visible = state.furtherInfoRequests.filter(
    (r) => r.status === "sent" || r.status === "responded" || r.status === "resolved",
  );
  if (visible.length === 0) return null;

  const submit = async (rfiId: string) => {
    if (!draft.trim()) {
      setError("Please write a short response.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = (await respondToStepperRfi({
        data: { caseId, rfiId, responseText: draft.trim() },
      })) as StepperComplianceState;
      queryClient.setQueryData<StepperComplianceState>(stateQueryKey(caseId), updated);
      setDraft("");
      setOpenId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send response.");
    } finally {
      setSubmitting(false);
    }
  };

  const outstanding = visible.filter((r) => r.status === "sent").length;
  const inReview = visible.filter((r) => r.status === "responded").length;

  return (
    <section
      data-testid="stepper-rfi-inbox"
      className="mt-8 overflow-hidden rounded-xl border border-[color:var(--attention)]/30 bg-[color:var(--attention)]/[0.04]"
    >
      <header className="flex items-baseline justify-between gap-4 border-b border-[color:var(--attention)]/20 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Compliance has follow-up questions
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {outstanding > 0
              ? `${outstanding} request${outstanding === 1 ? "" : "s"} need your response.`
              : inReview > 0
                ? "Your responses are with compliance for review."
                : "All requests resolved."}
          </p>
        </div>
        <span className="rounded-full bg-[color:var(--attention)]/15 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-[color:var(--attention)]">
          {visible.length} item{visible.length === 1 ? "" : "s"}
        </span>
      </header>

      <ul className="divide-y">
        {visible.map((item) => (
          <RfiRow
            key={item.id}
            item={item}
            isOpen={openId === item.id}
            draft={draft}
            error={openId === item.id ? error : null}
            submitting={openId === item.id && submitting}
            onOpen={() => {
              setOpenId(item.id);
              setDraft("");
              setError(null);
            }}
            onCancel={() => {
              setOpenId(null);
              setError(null);
            }}
            onChange={setDraft}
            onSend={() => submit(item.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function RfiRow({
  item,
  isOpen,
  draft,
  error,
  submitting,
  onOpen,
  onCancel,
  onChange,
  onSend,
}: {
  item: StepperRfi;
  isOpen: boolean;
  draft: string;
  error: string | null;
  submitting: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onChange: (v: string) => void;
  onSend: () => void;
}) {
  const isResolved = item.status === "resolved";
  const isResponded = item.status === "responded";
  return (
    <li
      data-testid="stepper-rfi-item"
      className={cn("px-5 py-4", isResolved && "opacity-70")}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {isResolved ? (
            <CheckCircle2 className="size-4 text-accent" />
          ) : isResponded ? (
            <CheckCircle2 className="size-4 text-[color:var(--attention)]" />
          ) : (
            <AlertCircle className="size-4 text-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-relaxed">{item.text}</div>
          {item.investorResponseText && (
            <div className="mt-2 rounded border bg-background px-2.5 py-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Your response:</span>{" "}
              {item.investorResponseText}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span data-testid="stepper-rfi-status">
              {isResolved
                ? "Resolved"
                : isResponded
                  ? "Awaiting compliance review"
                  : "Awaiting your response"}
            </span>
            {item.sentAt && (
              <span className="text-muted-foreground/70">
                · Sent {new Date(item.sentAt).toLocaleString()}
              </span>
            )}
          </div>
          {item.status === "sent" && !isOpen && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={onOpen}
              data-testid="stepper-rfi-respond"
            >
              Respond
            </Button>
          )}
          {isOpen && (
            <div className="mt-3 space-y-2">
              <textarea
                value={draft}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Type your response here…"
                rows={3}
                data-testid="stepper-rfi-response-input"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={submitting || draft.trim().length === 0}
                  onClick={onSend}
                  data-testid="stepper-rfi-send"
                >
                  <Send className="size-3.5" />
                  {submitting ? "Sending…" : "Send response"}
                </Button>
                <Button size="sm" variant="ghost" disabled={submitting} onClick={onCancel}>
                  <X className="size-3.5" /> Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
