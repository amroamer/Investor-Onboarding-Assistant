import { useState } from "react";
import { Button } from "@/components/ui/button";

const SOW_CATEGORIES = [
  "Employment income",
  "Business ownership",
  "Sale of a business",
  "Investment income",
  "Inheritance",
  "Property income or sale",
  "Family wealth",
  "Other",
];
const SOF_CATEGORIES = [
  "Personal bank account",
  "Corporate bank account",
  "Investment redemption",
  "Sale proceeds",
  "Dividend distribution",
  "Loan",
  "Other",
];

interface CardProps {
  onSubmit: (category: string, detail: string) => void;
  resolved?: boolean;
}

export function SoWCard({ onSubmit, resolved }: CardProps) {
  return (
    <CategoryCard
      title="Source of Wealth"
      subtitle="How the investing party accumulated its overall wealth."
      categories={SOW_CATEGORIES}
      placeholder="Brief description (e.g. proceeds from sale of operating business in 2021)."
      onSubmit={onSubmit}
      resolved={resolved}
    />
  );
}

export function SoFCard({ onSubmit, resolved }: CardProps) {
  return (
    <CategoryCard
      title="Source of Funds"
      subtitle="Where the specific subscription monies for this investment will come from."
      categories={SOF_CATEGORIES}
      placeholder="Brief description (e.g. corporate operating account at our primary bank)."
      onSubmit={onSubmit}
      resolved={resolved}
    />
  );
}

function CategoryCard({
  title,
  subtitle,
  categories,
  placeholder,
  onSubmit,
  resolved = false,
}: {
  title: string;
  subtitle: string;
  categories: string[];
  placeholder: string;
  onSubmit: (c: string, d: string) => void;
  resolved?: boolean;
}) {
  const [cat, setCat] = useState<string | undefined>();
  const [detail, setDetail] = useState("");
  const [done, setDone] = useState(resolved);
  return (
    <div className="overflow-hidden rounded-lg border bg-surface">
      <div className="border-b bg-surface-muted px-4 py-2.5">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
      </div>
      <div className="p-4">
        <p className="text-sm text-foreground">{subtitle}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              disabled={done}
              onClick={() => setCat(c)}
              className={`rounded-full border px-3 py-1 text-xs ${cat === c ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-secondary"}`}
            >
              {c}
            </button>
          ))}
        </div>
        <textarea
          value={detail}
          disabled={done}
          onChange={(e) => setDetail(e.target.value)}
          placeholder={placeholder}
          className="mt-3 min-h-[72px] w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            disabled={!cat || done}
            onClick={() => {
              setDone(true);
              onSubmit(cat!, detail);
            }}
          >
            {done ? "Confirmed" : "Confirm and continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
