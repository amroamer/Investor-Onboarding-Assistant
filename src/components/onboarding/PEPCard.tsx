import { useState } from "react";
import type { PepStatus, RelatedParty } from "@/lib/onboarding/types";
import { Button } from "@/components/ui/button";
import { User2 } from "lucide-react";

export function PEPCard({
  parties,
  onConfirm,
  resolved = false,
}: {
  parties: RelatedParty[];
  onConfirm: (marks: Record<string, PepStatus>) => void;
  resolved?: boolean;
}) {
  const [marks, setMarks] = useState<Record<string, PepStatus>>(() => {
    const initial: Record<string, PepStatus> = {};
    for (const p of parties) {
      if (p.pepStatus) initial[p.id] = p.pepStatus;
    }
    return initial;
  });
  const [done, setDone] = useState(resolved);

  const allMarked = parties.length > 0 && parties.every((p) => !!marks[p.id]);

  return (
    <div className="overflow-hidden rounded-lg border bg-surface" data-testid="pep-card">
      <div className="border-b bg-surface-muted px-4 py-2.5">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          PEP declaration
        </div>
      </div>
      <div className="p-4">
        <p className="text-sm text-foreground">
          These individuals are included in the declaration based on the ownership and control
          information provided. Please confirm whether any currently hold, or have previously held,
          a prominent public function, or are a close family member or known close associate of such
          a person.
        </p>
        {parties.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed bg-background px-3 py-3 text-xs text-muted-foreground">
            No individuals on file to declare against. Add related parties on the Ownership card
            first.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {parties.map((p) => (
              <li
                key={p.id}
                data-testid="pep-row"
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <User2 className="size-4 text-primary" />
                  <div>
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.role}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(["no", "local", "foreign", "connected"] as const).map((k) => (
                    <button
                      key={k}
                      disabled={done}
                      data-testid={`pep-mark-${k}`}
                      onClick={() => setMarks((m) => ({ ...m, [p.id]: k }))}
                      className={`rounded-md border px-2.5 py-1 text-xs ${
                        marks[p.id] === k
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background hover:bg-secondary"
                      }`}
                    >
                      {k === "no"
                        ? "Not a PEP"
                        : k === "local"
                          ? "Local PEP"
                          : k === "foreign"
                            ? "Foreign PEP"
                            : "Connected Party"}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            data-testid="pep-submit"
            disabled={done || (parties.length > 0 && !allMarked)}
            onClick={() => {
              setDone(true);
              onConfirm(marks);
            }}
          >
            {done ? "Submitted" : "Submit declaration"}
          </Button>
        </div>
      </div>
    </div>
  );
}
