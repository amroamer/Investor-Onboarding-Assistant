import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useActiveCase, useCaseStore, type CaseKey } from "@/lib/onboarding/store";
import { Lock, HelpCircle, RotateCcw, ChevronDown, Volume2, VolumeX } from "lucide-react";
import { MgxLogo } from "@/components/Brand";
import { useVoice } from "@/lib/onboarding/voice";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function TopBar({ showCaseSwitcher = true }: { showCaseSwitcher?: boolean }) {
  const { caseData } = useActiveCase();
  const { activeKey, setActiveKey, reset } = useCaseStore();
  const [resetOpen, setResetOpen] = useState(false);

  const { ttsEnabled, toggleTts, ttsSupported, cancelSpeech } = useVoice();

  const labelFor = (k: CaseKey) => k === "new-corporate" ? "New corporate investor" : "Returning limited partnership";

  const handleReset = () => {
    cancelSpeech();
    reset(activeKey);
    setResetOpen(false);
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-surface px-6">
      <div className="flex items-center gap-6">
        <Link
          to="/"
          aria-label="Go to MGX home"
          className="flex items-center gap-2 rounded text-primary outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MgxLogo className="h-5 w-auto" />
        </Link>
        <div className="hidden h-5 w-px bg-border md:block" />
        <div className="hidden text-sm text-muted-foreground md:block">Investor Onboarding</div>
        <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
          <span>·</span>
          <span>Case</span>
          <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-foreground">{caseData.caseId}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <Lock className="size-3.5" /> Secure session
        </div>
        {showCaseSwitcher && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs">
                Demo: {labelFor(activeKey)} <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="text-xs">Prototype-only case switcher</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setActiveKey("new-corporate")}>
                New corporate investor
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveKey("returning-lp")}>
                Returning limited partnership
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/compliance">Open Compliance workspace</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => reset(activeKey)}>
                <RotateCcw className="size-3.5" /> Reset this demo case
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {ttsSupported && (
          <Button
            variant={ttsEnabled ? "secondary" : "ghost"}
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => { if (ttsEnabled) cancelSpeech(); toggleTts(); }}
            title={ttsEnabled ? "Mute agent voice" : "Enable agent voice"}
          >
            {ttsEnabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            Voice {ttsEnabled ? "on" : "off"}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setResetOpen(true)}
          title="Clear conversation and start the case over"
        >
          <RotateCcw className="size-3.5" />
          <span className="hidden sm:inline">Reset</span>
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground"><HelpCircle className="size-4" /></Button>
      </div>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset this demo case?</AlertDialogTitle>
            <AlertDialogDescription>
              Your conversation, uploaded documents, extracted fields, and progress will all be cleared. The case will start fresh from the welcome message.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>Reset case</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
