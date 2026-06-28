import type { ExtractedField } from "@/lib/onboarding/types";

export function ExtractedCard({ title, fields }: { title: string; fields: ExtractedField[] }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-surface">
      <div className="border-b bg-surface-muted px-4 py-2.5">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</div>
      </div>
      <ul className="divide-y">
        {fields.map((f) => (
          <li key={f.key} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
            <div className="text-muted-foreground">{f.label}</div>
            <div className="text-right">
              <div className="text-foreground">{f.value}</div>
              <div className="text-xs text-muted-foreground">{f.source}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
