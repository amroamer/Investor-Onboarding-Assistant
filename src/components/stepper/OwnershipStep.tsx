import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { StepHeader } from "./StepHeader";
import { StepFooter } from "./StepFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveOwnership } from "@/server/stepper/cases";
import { useStepperStore } from "@/lib/stepper/store";
import type { StepperCase, RelatedParty } from "@/lib/stepper/types";

export function OwnershipStep({ caseData }: { caseData: StepperCase }) {
  const navigate = useNavigate();
  const { setCase } = useStepperStore();
  const isIndividual = caseData.profile?.legalForm === "Individual";

  // For Individual, pre-seed with the investor themselves.
  const initial: RelatedParty[] = isIndividual && caseData.relatedParties.length === 0
    ? [
        {
          id: `rp_${Math.random().toString(36).slice(2, 10)}`,
          name: caseData.profile?.investorName ?? "",
          role: "Investor (self)",
          partyType: "Individual",
          ownershipPct: 100,
        },
      ]
    : caseData.relatedParties.length > 0
    ? caseData.relatedParties
    : [];

  const [parties, setParties] = useState<RelatedParty[]>(initial);
  const [busy, setBusy] = useState(false);

  const addParty = () => {
    setParties((p) => [
      ...p,
      {
        id: `rp_${Math.random().toString(36).slice(2, 10)}`,
        name: "",
        role: isIndividual ? "Beneficial owner" : "Director",
        partyType: "Individual",
      },
    ]);
  };

  const removeParty = (id: string) => setParties((p) => p.filter((r) => r.id !== id));

  const updateParty = (id: string, patch: Partial<RelatedParty>) =>
    setParties((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const canContinue = parties.length > 0 && parties.every((r) => r.name.trim().length > 0 && r.role.trim().length > 0);

  const onNext = async () => {
    setBusy(true);
    try {
      const saved = await saveOwnership({ data: { caseId: caseData.caseId, relatedParties: parties } });
      setCase(saved);
      navigate({ to: "/v2/onboarding/$step", params: { step: "sow-sof" } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <StepHeader
        step={3}
        title="Ownership and related parties"
        description={isIndividual
          ? "As an individual investor, you are the sole party. Confirm your details below; you can add any related parties if relevant (e.g. a power of attorney holder)."
          : "List the people and entities who own or control the investing party. Each ≥ 25% beneficial owner and each authorised signatory should appear here."}
      />

      <div className="mt-8 space-y-4" data-testid="ownership-rows">
        {parties.map((p, idx) => (
          <div key={p.id} data-testid={`ownership-row-${idx}`} className="rounded-lg border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Party {idx + 1}</div>
              {parties.length > 1 && (
                <button onClick={() => removeParty(p.id)} className="text-xs text-muted-foreground hover:text-[color:var(--attention)]">
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor={`name-${p.id}`}>Full name</Label>
                <Input id={`name-${p.id}`} data-testid={`ownership-name-${idx}`} value={p.name} onChange={(e) => updateParty(p.id, { name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`role-${p.id}`}>Role</Label>
                <Input id={`role-${p.id}`} data-testid={`ownership-role-${idx}`} value={p.role} onChange={(e) => updateParty(p.id, { role: e.target.value })} placeholder="e.g. Beneficial owner, Director, Trustee" />
              </div>
              <div>
                <Label htmlFor={`pct-${p.id}`}>Ownership %</Label>
                <Input
                  id={`pct-${p.id}`}
                  data-testid={`ownership-pct-${idx}`}
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={p.ownershipPct ?? ""}
                  onChange={(e) => updateParty(p.id, { ownershipPct: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor={`nat-${p.id}`}>Nationality / Country</Label>
                <Input id={`nat-${p.id}`} data-testid={`ownership-nationality-${idx}`} value={p.nationality ?? ""} onChange={(e) => updateParty(p.id, { nationality: e.target.value })} placeholder="e.g. British" />
              </div>
            </div>
          </div>
        ))}
        <Button data-testid="ownership-add" variant="outline" onClick={addParty}>
          <Plus className="size-4" /> Add a related party
        </Button>
      </div>

      <StepFooter
        onBack={() => navigate({ to: "/v2/onboarding/$step", params: { step: "documents" } })}
        onNext={onNext}
        busy={busy}
        disableNext={!canContinue}
        nextTestId="ownership-next"
      />
    </div>
  );
}
