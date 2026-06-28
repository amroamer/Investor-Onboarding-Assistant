import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveCase, type CaseKey } from "@/lib/onboarding/store";
import { respondToRfi } from "@/server/rfi";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  OnboardingCase,
  RfiStatus,
} from "@/lib/onboarding/types";

interface RfiItem {
  id: string;
  text: string;
  status: RfiStatus;
  investorResponseText?: string;
}

export function RfiCard({ items }: { items: RfiItem[] }) {
  const { caseData } = useActiveCase();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (rfiId: string) => {
    if (!draft.trim()) {
      setError("Please write a short response.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = (await respondToRfi({
        data: { caseId: caseData.caseId, rfiId, responseText: draft.trim() },
      })) as OnboardingCase;
      queryClient.setQueryData<Record<CaseKey, OnboardingCase>>(["cases"], (prev) => {
        if (!prev) return prev;
        const k = (Object.keys(prev) as CaseKey[]).find((kk) => prev[kk].caseId === caseData.caseId);
        if (!k) return prev;
        return { ...prev, [k]: updated };
      });
      setDraft("");
      setOpenId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send response.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2" data-testid="rfi-card">
      {items.map((item) => {
        const isOpen = openId === item.id;
        const isResolved = item.status === "resolved";
        const isResponded = item.status === "responded";
        return (
          <div
            key={item.id}
            data-testid="rfi-item"
            className={cn(
              "rounded-md border bg-surface p-3",
              isResolved && "opacity-70",
            )}
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
                  <div className="mt-2 rounded border bg-background px-2 py-1.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Your response:</span>{" "}
                    {item.investorResponseText}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span data-testid="rfi-status">
                    {isResolved ? "Resolved" : isResponded ? "Awaiting compliance review" : "Awaiting your response"}
                  </span>
                </div>
                {item.status === "sent" && !isOpen && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => {
                      setOpenId(item.id);
                      setDraft("");
                      setError(null);
                    }}
                  >
                    Respond
                  </Button>
                )}
                {isOpen && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Type your response here…"
                      rows={3}
                      data-testid="rfi-response-input"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {error && <p className="text-xs text-destructive">{error}</p>}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        disabled={submitting || draft.trim().length === 0}
                        onClick={() => submit(item.id)}
                        data-testid="rfi-send"
                      >
                        <Send className="size-3.5" />
                        {submitting ? "Sending…" : "Send response"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={submitting}
                        onClick={() => {
                          setOpenId(null);
                          setError(null);
                        }}
                      >
                        <X className="size-3.5" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
