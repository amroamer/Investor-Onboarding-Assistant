import { useState } from "react";
import type { LegalForm } from "@/lib/onboarding/types";
import { Button } from "@/components/ui/button";
import { Building2, User2 } from "lucide-react";

interface Props {
  legalForm: LegalForm;
  initialLegalName?: string;
  initialPrimaryContact?: string;
  initialJurisdiction?: string;
  initialDob?: string;
  initialNationality?: string;
  /** When true the card renders in a disabled "Confirmed" state (e.g. after a page refresh). */
  resolved?: boolean;
  onSubmit: (data: {
    legalName: string;
    primaryContact: string;
    jurisdiction: string;
    dob?: string;
    nationality?: string;
  }) => void;
}

export function IdentityCard({
  legalForm,
  initialLegalName = "",
  initialPrimaryContact = "",
  initialJurisdiction = "",
  initialDob = "",
  initialNationality = "",
  resolved = false,
  onSubmit,
}: Props) {
  const isIndividual = legalForm === "Individual";
  const [legalName, setLegalName] = useState(initialLegalName);
  const [primaryContact, setPrimaryContact] = useState(initialPrimaryContact);
  const [jurisdiction, setJurisdiction] = useState(initialJurisdiction);
  const [dob, setDob] = useState(initialDob);
  const [nationality, setNationality] = useState(initialNationality);
  const [done, setDone] = useState(resolved);

  const canSubmit =
    legalName.trim().length > 1 &&
    primaryContact.trim().length > 1 &&
    jurisdiction.trim().length > 1 &&
    (!isIndividual || dob.trim().length >= 4);

  return (
    <div className="overflow-hidden rounded-lg border bg-surface" data-testid="identity-card">
      <div className="flex items-center gap-2 border-b bg-surface-muted px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {isIndividual ? <User2 className="size-3.5" /> : <Building2 className="size-3.5" />}
        {isIndividual ? "Investor identity" : "Entity identity"}
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <Field
          label={isIndividual ? "Full legal name" : "Registered legal name"}
          value={legalName}
          onChange={setLegalName}
          disabled={done}
          testId="identity-legal-name"
          placeholder={
            isIndividual ? "e.g. Amelia Rose Brooks" : "e.g. Horizon Capital Holdings Ltd."
          }
        />
        <Field
          label={isIndividual ? "Country of residence" : "Jurisdiction of formation"}
          value={jurisdiction}
          onChange={setJurisdiction}
          disabled={done}
          testId="identity-jurisdiction"
          placeholder={isIndividual ? "e.g. United Arab Emirates" : "e.g. Cayman Islands"}
        />
        <Field
          label={isIndividual ? "Email address" : "Primary contact name"}
          value={primaryContact}
          onChange={setPrimaryContact}
          disabled={done}
          testId="identity-primary-contact"
          placeholder={isIndividual ? "you@example.com" : "e.g. Olivia Bennett"}
        />
        {isIndividual && (
          <>
            <Field
              label="Date of birth"
              value={dob}
              onChange={setDob}
              disabled={done}
              testId="identity-dob"
              placeholder="YYYY-MM-DD"
              type="date"
            />
            <Field
              label="Nationality"
              value={nationality}
              onChange={setNationality}
              disabled={done}
              testId="identity-nationality"
              placeholder="e.g. British"
            />
          </>
        )}
      </div>
      <div className="flex items-center justify-end border-t bg-surface-muted px-4 py-3">
        <Button
          size="sm"
          disabled={!canSubmit || done}
          data-testid="identity-submit"
          onClick={() => {
            setDone(true);
            onSubmit({
              legalName: legalName.trim(),
              primaryContact: primaryContact.trim(),
              jurisdiction: jurisdiction.trim(),
              dob: dob.trim() || undefined,
              nationality: nationality.trim() || undefined,
            });
          }}
        >
          {done ? "Confirmed" : "Confirm identity"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  type = "text",
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
  testId?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />
    </label>
  );
}
