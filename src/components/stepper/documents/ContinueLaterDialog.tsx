import { useState } from "react";
import { Mail, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestResumeLink } from "@/server/stepper/cases";

export function ContinueLaterDialog({
  caseId,
  defaultEmail,
}: {
  caseId: string;
  defaultEmail?: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const onSend = async () => {
    setBusy(true);
    try {
      const r = await requestResumeLink({ data: { caseId, email: email.trim() } });
      setResult({ url: r.url });
      toast.success("Resume link prepared.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="documents-continue-later" variant="ghost" size="sm" className="text-xs">
          <Mail className="size-3.5" /> Continue later
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="continue-later-dialog">
        <DialogHeader>
          <DialogTitle>Pick up where you left off</DialogTitle>
          <DialogDescription>
            We'll email you a link that takes you back to this exact case. Your progress is already saved.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="continue-later-email">Email</Label>
            <Input
              id="continue-later-email"
              data-testid="continue-later-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>
          {result && (
            <div className="rounded-md border bg-secondary px-3 py-2 text-xs" data-testid="continue-later-url">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Resume link</div>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate text-foreground">{result.url}</code>
                <button type="button" onClick={onCopy} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground">
                  {copied ? <Check className="size-3.5 text-accent" /> : <Copy className="size-3.5" />}
                </button>
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <Button data-testid="continue-later-send" onClick={onSend} disabled={busy || !email}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
              {result ? "Send again" : "Send link"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
