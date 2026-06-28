import type { OnboardingCase, EmbeddedComponent } from "@/lib/onboarding/types";
import type { AgentEvent } from "@/lib/agent/types";

/** Card kinds that carry a boolean `resolved` flag set when the investor submits them. */
const RESOLVABLE_BOOL_KINDS: ReadonlyArray<EmbeddedComponent["kind"]> = [
  "upload",
  "identity",
  "ownership",
  "sourceOfWealth",
  "sourceOfFunds",
  "pep",
  "fatca",
  "review",
];

/**
 * Mark the source interactive card as resolved before the agent runs. Shared by
 * sendAgentEvent and streamAgentEvent so the resolution semantics stay consistent.
 *
 * - `choices` cards store the chosen choice id (so multiple choices can be replayed).
 * - All other interactive cards store a boolean — once true, the card renders in a
 *   disabled "done" state even after a page refresh.
 */
export function applyResolution(
  c: OnboardingCase,
  sourceMessageId: string,
  event: AgentEvent,
): OnboardingCase {
  return {
    ...c,
    conversation: c.conversation.map((m) => {
      if (m.id !== sourceMessageId || !m.component) return m;
      if (m.component.kind === "choices") {
        const choiceId = event.kind === "user_choice" ? event.choiceId : "true";
        return { ...m, component: { ...m.component, resolved: choiceId } };
      }
      if (RESOLVABLE_BOOL_KINDS.includes(m.component.kind)) {
        return {
          ...m,
          component: { ...m.component, resolved: true } as EmbeddedComponent,
        };
      }
      return m;
    }),
  };
}
