import { useEffect, useRef, useState } from "react";
import { useActiveCase } from "@/lib/onboarding/store";
import { useDispatch, type Dispatch } from "@/lib/onboarding/dispatch";
import type { ConversationMessage, EmbeddedComponent } from "@/lib/onboarding/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ShieldCheck,
  Send,
  CheckCircle2,
  AlertTriangle,
  Circle,
  Building2,
  User2,
  Briefcase,
  Network,
  ChevronRight,
  Mic,
  MicOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoice } from "@/lib/onboarding/voice";
import { ChecklistCard } from "./ChecklistCard";
import { IdentityCard } from "./IdentityCard";
import { OwnershipCard } from "./OwnershipCard";
import { SoWCard, SoFCard } from "./SoWSoFCards";
import { PEPCard } from "./PEPCard";
import { FatcaCard } from "./FatcaCard";
import { ReviewCard } from "./ReviewCard";
import { ReceiptCard } from "./ReceiptCard";
import { ExtractedCard } from "./ExtractedCard";
import { RequirementsCard } from "./RequirementsCard";
import { RfiCard } from "./RfiCard";
import { BulkUploadCard } from "./BulkUploadCard";

/**
 * Merge persisted + in-flight messages, deduping by id. Persisted wins so we don't
 * lose any agent-applied state during the final cache splice.
 */
function mergedConversation(
  persisted: ConversationMessage[],
  inFlight: ConversationMessage[],
): ConversationMessage[] {
  if (inFlight.length === 0) return persisted;
  const seen = new Set(persisted.map((m) => m.id));
  const extra = inFlight.filter((m) => !seen.has(m.id));
  return extra.length === 0 ? persisted : [...persisted, ...extra];
}

export function ConversationFeed() {
  const { caseData } = useActiveCase();
  const { dispatch, isBusy, inFlight } = useDispatch();
  const allMessages = mergedConversation(caseData.conversation, inFlight);
  // Once the requirements card is in the conversation it becomes the canonical
  // upload surface (it has its own bulk dropzone in "Upload all" mode). Hide
  // any earlier free-standing upload prompts to avoid two competing dropzones.
  const hasRequirementsCard = allMessages.some((m) => m.component?.kind === "requirements");
  const merged = hasRequirementsCard
    ? allMessages.filter((m) => m.component?.kind !== "upload")
    : allMessages;
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { speak, ttsEnabled, sttSupported, listening, startListening, stopListening } = useVoice();
  const lastSpokenIdRef = useRef<string | null>(null);
  const sessionStartedRef = useRef<string | null>(null);

  // Hydrate the welcome messages by sending session_start when a case has none.
  useEffect(() => {
    if (caseData.conversation.length === 0 && sessionStartedRef.current !== caseData.caseId) {
      sessionStartedRef.current = caseData.caseId;
      void dispatch({ kind: "session_start" });
    }
  }, [caseData.caseId, caseData.conversation.length, dispatch]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    if (!ttsEnabled) return;
    for (let i = merged.length - 1; i >= 0; i--) {
      const m = merged[i];
      if (m.author === "agent" && m.text) {
        if (lastSpokenIdRef.current !== m.id) {
          lastSpokenIdRef.current = m.id;
          speak(m.text);
        }
        break;
      }
    }
  }, [merged, ttsEnabled, speak]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [caseData.caseId, caseData.conversation.length]);

  const sendFreeText = () => {
    const t = input.trim();
    if (!t) return;
    setInput("");
    void dispatch({ kind: "user_text", text: t });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="scroll-elegant flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
          {merged.map((m) => (
            <MessageRow key={m.id} message={m} dispatch={dispatch} />
          ))}
          {isBusy && <TypingIndicator />}
          <div ref={endRef} />
        </div>
      </div>
      <div className="border-t bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendFreeText();
                }
              }}
              placeholder={
                listening
                  ? "Listening…"
                  : "Ask about your onboarding, or describe what you'd like to do…"
              }
              className="h-11"
            />
            {sttSupported && (
              <Button
                type="button"
                variant={listening ? "secondary" : "outline"}
                className={cn(
                  "h-11 w-11 p-0",
                  listening && "border-accent text-accent animate-pulse",
                )}
                onClick={() => {
                  if (listening) {
                    stopListening();
                    return;
                  }
                  startListening((text, final) => {
                    setInput(text);
                    if (final) {
                      stopListening();
                      const t = text.trim();
                      if (t) {
                        setInput("");
                        void dispatch({ kind: "user_text", text: t });
                      }
                    }
                  });
                }}
                title={listening ? "Stop listening" : "Speak your message"}
              >
                {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </Button>
            )}
            <Button onClick={sendFreeText} className="h-11">
              <Send className="size-4" /> Send
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            This assistant supports your investor onboarding only. Internal compliance assessments
            are not shown here.
          </p>
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3" data-testid="typing-indicator">
      <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border bg-surface text-primary">
        <ShieldCheck className="size-4" />
      </div>
      <div className="flex items-center gap-1.5 rounded-lg border bg-surface px-3 py-2.5">
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
      </div>
    </div>
  );
}

function MessageRow({ message, dispatch }: { message: ConversationMessage; dispatch: Dispatch }) {
  if (message.author === "system") {
    return (
      <div className="text-center text-xs uppercase tracking-wider text-muted-foreground">
        {message.text}
      </div>
    );
  }

  if (message.author === "investor") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg rounded-tr-sm bg-investor px-4 py-2.5 text-sm text-investor-foreground shadow-sm">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border bg-surface text-primary">
        <ShieldCheck className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Onboarding Assistant</span>
          <span>·</span>
          <span>Investor Onboarding</span>
        </div>
        {message.text && (
          <div className="prose prose-sm max-w-none whitespace-pre-line text-[15px] leading-relaxed text-foreground">
            {message.text}
          </div>
        )}
        {message.component && (
          <div className="mt-3">
            <EmbeddedRender
              component={message.component}
              messageId={message.id}
              dispatch={dispatch}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function EmbeddedRender({
  component,
  messageId,
  dispatch,
}: {
  component: EmbeddedComponent;
  messageId: string;
  dispatch: Dispatch;
}) {
  const { caseData } = useActiveCase();

  if (component.kind === "choices") {
    return (
      <ChoicePanel
        choices={component.choices}
        resolved={component.resolved}
        onChoose={(id, label) => dispatch({ kind: "user_choice", choiceId: id, label }, messageId)}
      />
    );
  }

  if (component.kind === "upload") {
    return <UploadPanel resolved={!!component.resolved} sourceMessageId={messageId} />;
  }

  if (component.kind === "processing") {
    return <ProcessingPanel steps={component.steps} />;
  }

  if (component.kind === "checklist") {
    return (
      <ChecklistCard
        items={caseData.checklist}
        onProvide={(itemId) => dispatch({ kind: "checklist_provide", itemId })}
        onReplace={(itemId) => dispatch({ kind: "checklist_replace", itemId })}
      />
    );
  }

  if (component.kind === "identity") {
    // Only pre-fill the fields if the investor has previously confirmed identity (i.e.
    // this card is being re-rendered after a refresh). For a fresh case the fields
    // start blank — pre-filling with a preseeded demo name would be confusing.
    const alreadyConfirmed = !!caseData.sectionConfirmations?.identity;
    return (
      <IdentityCard
        legalForm={component.legalForm}
        initialLegalName={alreadyConfirmed ? caseData.investorName : ""}
        initialPrimaryContact={alreadyConfirmed ? caseData.primaryContact : ""}
        initialJurisdiction={alreadyConfirmed ? (caseData.jurisdiction ?? "") : ""}
        initialDob={alreadyConfirmed ? (caseData.dob ?? "") : ""}
        resolved={!!component.resolved}
        onSubmit={(data) =>
          dispatch(
            {
              kind: "card_submit_identity",
              legalName: data.legalName,
              primaryContact: data.primaryContact,
              jurisdiction: data.jurisdiction,
              dob: data.dob,
              nationality: data.nationality,
            },
            messageId,
          )
        }
      />
    );
  }

  if (component.kind === "ownership") {
    return (
      <OwnershipCard
        parties={caseData.relatedParties}
        resolved={!!component.resolved}
        onConfirm={() => dispatch({ kind: "card_submit_ownership" }, messageId)}
        onAdd={(party) => dispatch({ kind: "related_party_add", party })}
        onUpdate={(partyId, changes) =>
          dispatch({ kind: "related_party_update", partyId, changes })
        }
        onRemove={(partyId) => dispatch({ kind: "related_party_remove", partyId })}
      />
    );
  }

  if (component.kind === "sourceOfWealth") {
    return (
      <SoWCard
        resolved={!!component.resolved}
        onSubmit={(cat, detail) =>
          dispatch({ kind: "card_submit_sow", category: cat, detail }, messageId)
        }
      />
    );
  }

  if (component.kind === "sourceOfFunds") {
    return (
      <SoFCard
        resolved={!!component.resolved}
        onSubmit={(cat, detail) =>
          dispatch({ kind: "card_submit_sof", category: cat, detail }, messageId)
        }
      />
    );
  }

  if (component.kind === "pep") {
    return (
      <PEPCard
        parties={caseData.relatedParties.filter((p) => p.partyType === "Individual")}
        resolved={!!component.resolved}
        onConfirm={(marks) => dispatch({ kind: "card_submit_pep", marks }, messageId)}
      />
    );
  }

  if (component.kind === "fatca") {
    return (
      <FatcaCard
        initialTin={caseData.fatca?.tin}
        initialSection={caseData.fatca?.section}
        resolved={!!component.resolved}
        onConfirm={(tin, section) =>
          dispatch({ kind: "card_submit_fatca", tin, section }, messageId)
        }
      />
    );
  }

  if (component.kind === "review") {
    return (
      <ReviewCard
        caseData={caseData}
        resolved={!!component.resolved}
        onSubmit={() => dispatch({ kind: "card_submit_review" }, messageId)}
      />
    );
  }

  if (component.kind === "receipt") {
    return <ReceiptCard caseData={caseData} />;
  }

  if (component.kind === "extracted") {
    return <ExtractedCard title={component.title} fields={component.fields} />;
  }

  if (component.kind === "requirements") {
    return <RequirementsCard legalForm={component.legalForm} groups={component.groups} />;
  }

  if (component.kind === "rfi") {
    return <RfiCard items={component.items} />;
  }

  return null;
}

function ChoicePanel({
  choices,
  resolved,
  onChoose,
}: {
  choices: { id: string; label: string; hint?: string }[];
  resolved?: string;
  onChoose: (id: string, label: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {choices.map((ch) => {
        const isResolved = resolved === ch.id;
        const isDimmed = resolved && resolved !== ch.id;
        return (
          <button
            key={ch.id}
            disabled={!!resolved}
            onClick={() => onChoose(ch.id, ch.label)}
            className={cn(
              "group flex w-full items-start gap-3 rounded-lg border bg-surface p-4 text-left transition-colors",
              !resolved && "hover:border-accent hover:bg-surface-muted",
              isResolved && "border-primary bg-secondary",
              isDimmed && "opacity-40",
            )}
          >
            <div
              className={cn(
                "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-primary",
                isResolved && "border-primary bg-primary text-primary-foreground",
              )}
            >
              {isResolved ? <CheckCircle2 className="size-4" /> : <Circle className="size-3" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">{ch.label}</div>
              {ch.hint && <div className="mt-0.5 text-xs text-muted-foreground">{ch.hint}</div>}
            </div>
            {!resolved && (
              <ChevronRight className="mt-1 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function UploadPanel({
  resolved,
  sourceMessageId,
}: {
  resolved: boolean;
  sourceMessageId: string;
}) {
  return (
    <BulkUploadCard
      resolved={resolved}
      sourceMessageId={sourceMessageId}
      description="PDF or image (PNG, JPEG). The agent will extract content, classify each document, and run validation."
    />
  );
}

function ProcessingPanel({ steps }: { steps: string[] }) {
  const [completed, setCompleted] = useState(0);
  useEffect(() => {
    if (completed >= steps.length) return;
    const t = setTimeout(() => setCompleted((c) => c + 1), 450);
    return () => clearTimeout(t);
  }, [completed, steps.length]);
  return (
    <div className="rounded-lg border bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Reviewing documents
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            {i < completed ? (
              <CheckCircle2 className="size-4 text-accent" />
            ) : i === completed ? (
              <div className="size-4 animate-pulse rounded-full border-2 border-accent border-t-transparent" />
            ) : (
              <Circle className="size-4 text-muted-foreground/40" />
            )}
            <span className={cn("text-foreground", i >= completed && "text-muted-foreground")}>
              {s}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { Building2, User2, Briefcase, Network, AlertTriangle, CheckCircle2 };
