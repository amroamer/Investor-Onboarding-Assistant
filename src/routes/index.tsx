import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCaseStore } from "@/lib/onboarding/store";
import { investorDisplayName } from "@/lib/onboarding/engine";
import { useStepperStore } from "@/lib/stepper/store";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  Building2,
  Users,
  ArrowRight,
  Lock,
  FileCheck2,
  Layers,
  RotateCcw,
  ListChecks,
} from "lucide-react";
import { MgxLogo } from "@/components/Brand";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Investor Onboarding — MGX" },
      {
        name: "description",
        content: "AI-assisted investor KYC onboarding for institutional investors.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { cases, setActiveKey, resetAll } = useCaseStore();
  const { startNewCase, setActiveCaseId } = useStepperStore();
  const navigate = useNavigate();

  const enter = (k: "new-corporate" | "returning-lp") => {
    setActiveKey(k);
    navigate({ to: "/onboarding" });
  };

  const enterStepper = async () => {
    const c = await startNewCase();
    setActiveCaseId(c.caseId);
    navigate({ to: "/v2/onboarding" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link
            to="/"
            aria-label="Go to MGX home"
            className="flex items-center gap-2 rounded text-primary outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MgxLogo className="h-5 w-auto" />
          </Link>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Lock className="size-3.5" /> Secure prototype environment
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl">
          <div className="text-xs font-medium uppercase tracking-wider text-accent">
            Investor Onboarding Agent
          </div>
          <h1 className="mt-3 text-4xl font-light leading-tight tracking-tight text-foreground sm:text-5xl">
            A guided, AI-assisted KYC onboarding journey for institutional investors.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            The agent collects the required information, organises uploaded documents, identifies
            investor-remediable issues, and prepares a complete case for review by our Compliance
            team. Internal assessments are not shown in the investor portal.
          </p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          <DemoCaseCard
            label="Onboarding A"
            title="Corporate investor"
            entity={investorDisplayName(cases["new-corporate"])}
            jurisdiction="—"
            progress={cases["new-corporate"].progressPct}
            icon={<Building2 className="size-5" />}
            description="Upload your documents. The agent extracts content, classifies each document, and runs the required validation checks."
            onEnter={() => enter("new-corporate")}
          />
          <DemoCaseCard
            label="Onboarding B"
            title="Limited partnership"
            entity={investorDisplayName(cases["returning-lp"])}
            jurisdiction="—"
            progress={cases["returning-lp"].progressPct}
            icon={<Users className="size-5" />}
            description="A second onboarding workspace for a different investor. Same end-to-end flow."
            onEnter={() => enter("returning-lp")}
          />
          <DemoCaseCard
            testId="landing-stepper-card"
            label="Onboarding C · Stepper"
            title="Stepper experience"
            entity="Start a new case"
            jurisdiction="14 legal forms supported"
            progress={0}
            icon={<ListChecks className="size-5" />}
            description="A guided, step-by-step onboarding journey. Pick your legal form, upload required documents, confirm ownership, and submit — one focused step at a time."
            onEnter={enterStepper}
          />
        </div>

        <div className="mt-12 grid gap-6 rounded-lg border bg-surface p-6 sm:grid-cols-3">
          <Feature
            icon={<Layers className="size-4" />}
            title="Conversational workflow"
            body="The agent controls the journey, asks only what is needed at the current stage, and embeds interactive cards in the conversation."
          />
          <Feature
            icon={<FileCheck2 className="size-4" />}
            title="Document intelligence"
            body="Uploaded files are classified, mapped to the dynamic checklist, and analysed for presence, validity and consistency."
          />
          <Feature
            icon={<ShieldCheck className="size-4" />}
            title="Compliance handoff"
            body="A separate workspace receives the confirmed case, evidence, names-to-screen and an AI-generated recommendation for human review."
          />
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
          <p className="text-xs text-muted-foreground">
            Prototype. Uploaded documents are extracted + classified using Claude vision; validation
            checks run against the resulting structured fields. Sanctions / PEP screening uses the
            OpenSanctions dataset.
          </p>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/compliance">Demo view: Compliance workspace</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={resetAll}>
              <RotateCcw className="size-3.5" /> Reset all demo data
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function DemoCaseCard({
  label,
  title,
  entity,
  jurisdiction,
  progress,
  icon,
  description,
  onEnter,
  testId,
}: {
  label: string;
  title: string;
  entity: string;
  jurisdiction: string;
  progress: number;
  icon: React.ReactNode;
  description: string;
  onEnter: () => void;
  testId?: string;
}) {
  return (
    <button
      onClick={onEnter}
      data-testid={testId}
      className="group relative overflow-hidden rounded-lg border bg-surface p-6 text-left transition-all hover:border-accent hover:shadow-sm"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <span className="grid size-7 place-items-center rounded-md bg-secondary text-primary">
            {icon}
          </span>
          {label}
        </div>
        <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
      </div>
      <div className="mt-4 text-xl font-medium text-foreground">{title}</div>
      <div className="mt-1 text-sm font-medium">{entity}</div>
      <div className="text-xs text-muted-foreground">{jurisdiction}</div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Saved progress</span>
          <span className="tabular-nums text-foreground">{progress}%</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </button>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="grid size-7 place-items-center rounded-md bg-secondary text-primary">
          {icon}
        </span>
        {title}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
