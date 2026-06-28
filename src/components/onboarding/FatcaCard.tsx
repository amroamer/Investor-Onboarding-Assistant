import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  initialTin?: string;
  initialSection?: string;
  resolved?: boolean;
  onConfirm: (tin: string, section: string) => void;
}

const SECTIONS = [
  "Section 1 — Financial Institution",
  "Section 2 — Passive NFFE",
  "Section 3 — Active NFFE",
  "Section 4 — Direct reporting NFFE",
];

export function FatcaCard({
  initialTin = "",
  initialSection = "Section 3 — Active NFFE",
  resolved = false,
  onConfirm,
}: Props) {
  const [tin, setTin] = useState(initialTin);
  const [section, setSection] = useState<string>(initialSection);
  const [done, setDone] = useState(resolved);

  return (
    <div className="overflow-hidden rounded-lg border bg-surface" data-testid="fatca-card">
      <div className="border-b bg-surface-muted px-4 py-2.5">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          FATCA / CRS — assisted completion
        </div>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-sm text-foreground">
          Based on the entity information provided, Section 3 may be relevant. Please review the
          available categories or consult your tax adviser if you are uncertain. I will not
          determine the classification on your behalf.
        </p>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Suggested section</label>
          <select
            value={section}
            disabled={done}
            data-testid="fatca-section"
            onChange={(e) => setSection(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {SECTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Tax Identification Number (TIN)
          </label>
          <input
            value={tin}
            disabled={done}
            data-testid="fatca-tin"
            onChange={(e) => setTin(e.target.value)}
            placeholder="e.g. 98-7654321"
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            data-testid="fatca-submit"
            disabled={done || tin.trim().length < 4}
            onClick={() => {
              setDone(true);
              onConfirm(tin.trim(), section);
            }}
          >
            {done ? "Confirmed" : "Confirm classification"}
          </Button>
        </div>
      </div>
    </div>
  );
}
