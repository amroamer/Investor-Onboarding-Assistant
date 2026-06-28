import { useState } from "react";
import type { RelatedParty } from "@/lib/onboarding/types";
import { Button } from "@/components/ui/button";
import {
  Building2,
  User2,
  Network,
  Pencil,
  CheckCircle2,
  Plus,
  Trash2,
  X,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NewParty = Omit<RelatedParty, "id" | "pepProvisional" | "pepStatus">;

interface Props {
  parties: RelatedParty[];
  onConfirm: () => void;
  onAdd?: (party: NewParty) => void | Promise<void>;
  onUpdate?: (partyId: string, changes: Partial<Omit<RelatedParty, "id">>) => void | Promise<void>;
  onRemove?: (partyId: string) => void | Promise<void>;
  /** When true the card renders in a disabled "Confirmed" state (e.g. after a page refresh). */
  resolved?: boolean;
}

const ROLE_OPTIONS = [
  "Director",
  "Shareholder",
  "Beneficial Owner",
  "Authorised Signatory",
  "General Partner",
  "Limited Partner",
  "Trustee",
  "Settlor",
  "Beneficiary",
  "Underlying owner",
];

export function OwnershipCard({
  parties,
  onConfirm,
  onAdd,
  onUpdate,
  onRemove,
  resolved = false,
}: Props) {
  const [confirmed, setConfirmed] = useState(resolved);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const canConfirm = parties.length > 0;
  const direct = parties.filter((p) => !p.role.includes("Underlying"));
  const indirect = parties.filter((p) => p.role.includes("Underlying"));
  const directTotal = direct.reduce((acc, p) => acc + (p.ownershipPct ?? 0), 0);

  return (
    <div className="overflow-hidden rounded-lg border bg-surface" data-testid="ownership-card">
      <div className="flex items-center justify-between border-b bg-surface-muted px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Network className="size-3.5" /> Ownership and control structure
        </div>
        <div className="text-xs text-muted-foreground">Total direct ownership: {directTotal}%</div>
      </div>
      <div className="p-4">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Direct related parties
        </div>
        <ul className="mt-2 space-y-2">
          {direct.map((p) =>
            editingId === p.id ? (
              <PartyEditor
                key={p.id}
                initial={p}
                onCancel={() => setEditingId(null)}
                onSave={async (changes) => {
                  await onUpdate?.(p.id, changes);
                  setEditingId(null);
                }}
              />
            ) : (
              <PartyRow
                key={p.id}
                party={p}
                onEdit={onUpdate ? () => setEditingId(p.id) : undefined}
                onRemove={onRemove ? () => onRemove(p.id) : undefined}
              />
            ),
          )}
          {direct.length === 0 && (
            <li className="rounded-md border border-dashed bg-background px-3 py-3 text-xs text-muted-foreground">
              No direct related parties yet. Use <strong>Add party</strong> below to enter a
              beneficial owner, director or signatory.
            </li>
          )}
        </ul>

        {indirect.length > 0 && (
          <>
            <div className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Underlying / indirect ownership
            </div>
            <ul className="mt-2 space-y-2">
              {indirect.map((p) =>
                editingId === p.id ? (
                  <PartyEditor
                    key={p.id}
                    initial={p}
                    onCancel={() => setEditingId(null)}
                    onSave={async (changes) => {
                      await onUpdate?.(p.id, changes);
                      setEditingId(null);
                    }}
                  />
                ) : (
                  <PartyRow
                    key={p.id}
                    party={p}
                    indirect
                    onEdit={onUpdate ? () => setEditingId(p.id) : undefined}
                    onRemove={onRemove ? () => onRemove(p.id) : undefined}
                  />
                ),
              )}
            </ul>
          </>
        )}

        {showAddForm && onAdd && (
          <div className="mt-3">
            <PartyEditor
              addMode
              initial={{ partyType: "Individual", role: "Beneficial Owner", name: "" }}
              onCancel={() => setShowAddForm(false)}
              onSave={async (changes) => {
                if (!changes.name?.trim() || !changes.role?.trim()) return;
                await onAdd({
                  name: changes.name.trim(),
                  role: changes.role.trim(),
                  partyType: (changes.partyType as RelatedParty["partyType"]) ?? "Individual",
                  ownershipPct: changes.ownershipPct,
                  nationality: changes.nationality,
                  dob: changes.dob,
                });
                setShowAddForm(false);
              }}
            />
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2 border-t pt-3">
          {!canConfirm && !confirmed && (
            <div
              className="mr-auto text-xs text-muted-foreground"
              data-testid="ownership-empty-hint"
            >
              Add at least one related party before confirming.
            </div>
          )}
          {onAdd && !showAddForm && (
            <Button
              variant="outline"
              size="sm"
              data-testid="ownership-add-party"
              onClick={() => setShowAddForm(true)}
              disabled={confirmed}
            >
              <Plus className="size-3.5" /> Add party
            </Button>
          )}
          <Button
            size="sm"
            disabled={confirmed || !canConfirm}
            data-testid="ownership-confirm"
            title={!canConfirm ? "Add at least one related party first" : undefined}
            onClick={() => {
              setConfirmed(true);
              onConfirm();
            }}
          >
            {confirmed ? (
              <>
                <CheckCircle2 className="size-3.5" /> Confirmed
              </>
            ) : (
              "Confirm ownership structure"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PartyRow({
  party,
  indirect,
  onEdit,
  onRemove,
}: {
  party: RelatedParty;
  indirect?: boolean;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  return (
    <li
      data-testid="ownership-party-row"
      className={cn(
        "flex items-center justify-between rounded-md border bg-background px-3 py-2.5",
        indirect && "border-dashed",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {party.partyType === "Entity" ? (
          <Building2 className="size-4 text-primary" />
        ) : (
          <User2 className="size-4 text-primary" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{party.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {party.role}
            {party.nationality ? ` · ${party.nationality}` : ""}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {typeof party.ownershipPct === "number" && (
          <div
            className={cn(
              "text-sm tabular-nums",
              indirect ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {party.ownershipPct}%
          </div>
        )}
        {onEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            data-testid="ownership-edit-party"
            onClick={onEdit}
            title="Edit party"
          >
            <Pencil className="size-3.5" />
          </Button>
        )}
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            data-testid="ownership-remove-party"
            onClick={onRemove}
            title="Remove party"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </li>
  );
}

function PartyEditor({
  initial,
  onCancel,
  onSave,
  addMode,
}: {
  initial: Partial<RelatedParty> & Pick<RelatedParty, "name" | "role" | "partyType">;
  onCancel: () => void;
  onSave: (changes: Partial<Omit<RelatedParty, "id">>) => void | Promise<void>;
  addMode?: boolean;
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [role, setRole] = useState(initial.role ?? "Beneficial Owner");
  const [partyType, setPartyType] = useState<RelatedParty["partyType"]>(
    initial.partyType ?? "Individual",
  );
  const [ownershipPct, setOwnershipPct] = useState<string>(
    initial.ownershipPct != null ? String(initial.ownershipPct) : "",
  );
  const [nationality, setNationality] = useState(initial.nationality ?? "");
  const [dob, setDob] = useState(initial.dob ?? "");
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length > 1 && role.trim().length > 1;

  return (
    <li data-testid="ownership-party-editor" className="rounded-md border bg-background p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">
          <span className="font-medium text-muted-foreground">Name</span>
          <input
            value={name}
            data-testid="ownership-input-name"
            onChange={(e) => setName(e.target.value)}
            placeholder="Full legal name"
            className="mt-1 w-full rounded border border-input bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="font-medium text-muted-foreground">Role</span>
          <input
            value={role}
            data-testid="ownership-input-role"
            list="ownership-role-options"
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Director"
            className="mt-1 w-full rounded border border-input bg-background px-2 py-1.5 text-sm"
          />
          <datalist id="ownership-role-options">
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </label>
        <label className="text-xs">
          <span className="font-medium text-muted-foreground">Type</span>
          <select
            value={partyType}
            data-testid="ownership-input-type"
            onChange={(e) => setPartyType(e.target.value as RelatedParty["partyType"])}
            className="mt-1 w-full rounded border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="Individual">Individual</option>
            <option value="Entity">Entity</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="font-medium text-muted-foreground">Ownership %</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={ownershipPct}
            data-testid="ownership-input-pct"
            onChange={(e) => setOwnershipPct(e.target.value)}
            placeholder="e.g. 25"
            className="mt-1 w-full rounded border border-input bg-background px-2 py-1.5 text-sm"
          />
        </label>
        {partyType === "Individual" && (
          <>
            <label className="text-xs">
              <span className="font-medium text-muted-foreground">Nationality</span>
              <input
                value={nationality}
                data-testid="ownership-input-nationality"
                onChange={(e) => setNationality(e.target.value)}
                placeholder="e.g. British"
                className="mt-1 w-full rounded border border-input bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="font-medium text-muted-foreground">Date of birth</span>
              <input
                type="date"
                value={dob}
                data-testid="ownership-input-dob"
                onChange={(e) => setDob(e.target.value)}
                className="mt-1 w-full rounded border border-input bg-background px-2 py-1.5 text-sm"
              />
            </label>
          </>
        )}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          <X className="size-3.5" /> Cancel
        </Button>
        <Button
          size="sm"
          disabled={!valid || busy}
          data-testid="ownership-save-party"
          onClick={async () => {
            setBusy(true);
            try {
              const pct = ownershipPct.trim() === "" ? undefined : Number(ownershipPct);
              await onSave({
                name: name.trim(),
                role: role.trim(),
                partyType,
                ownershipPct: pct != null && !Number.isNaN(pct) ? pct : undefined,
                nationality: nationality.trim() || undefined,
                dob: dob.trim() || undefined,
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          <Check className="size-3.5" /> {addMode ? "Add" : "Save"}
        </Button>
      </div>
    </li>
  );
}
