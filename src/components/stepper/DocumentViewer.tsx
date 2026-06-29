import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2, AlertCircle, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStepperFile, getStepperMarkdown } from "@/server/stepper/uploads";

interface ViewerState {
  docId: string;
  fileName?: string;
  /** Default tab the dialog opens on. */
  defaultTab?: "pdf" | "markdown";
}

interface DocumentViewerCtx {
  openDocument: (state: ViewerState) => void;
  closeDocument: () => void;
}

const Ctx = createContext<DocumentViewerCtx | null>(null);

/**
 * Provider that mounts a single shared viewer dialog. Any descendant can call
 * `useDocumentViewer().openDocument({ docId })` to pop it up over the page.
 */
export function DocumentViewerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ViewerState | null>(null);

  const openDocument = useCallback((s: ViewerState) => setState(s), []);
  const closeDocument = useCallback(() => setState(null), []);

  const value = useMemo(() => ({ openDocument, closeDocument }), [openDocument, closeDocument]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <DocumentViewerDialog
        state={state}
        onOpenChange={(open) => {
          if (!open) closeDocument();
        }}
      />
    </Ctx.Provider>
  );
}

export function useDocumentViewer(): DocumentViewerCtx {
  const v = useContext(Ctx);
  if (!v) {
    // Soft fallback — render-safe noop. Lets components reference the hook even
    // when no provider is mounted (e.g. in standalone unit tests).
    return {
      openDocument: () => undefined,
      closeDocument: () => undefined,
    };
  }
  return v;
}

interface DialogProps {
  state: ViewerState | null;
  onOpenChange: (open: boolean) => void;
}

function DocumentViewerDialog({ state, onOpenChange }: DialogProps) {
  const open = !!state;
  const docId = state?.docId;

  const [tab, setTab] = useState<"pdf" | "markdown">(state?.defaultTab ?? "pdf");
  useEffect(() => {
    if (open) setTab(state?.defaultTab ?? "pdf");
  }, [open, state?.defaultTab]);

  // PDF binary state.
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [fileName, setFileName] = useState<string | undefined>(state?.fileName);
  const [mimeType, setMimeType] = useState<string>("application/pdf");

  // Markdown state.
  const [md, setMd] = useState<string>("");
  const [mdMissing, setMdMissing] = useState(false);
  const [mdError, setMdError] = useState<string | null>(null);
  const [mdLoading, setMdLoading] = useState(false);

  // Track which docId we've loaded for so we don't re-fetch on tab change.
  const pdfLoadedFor = useRef<string | null>(null);
  const mdLoadedFor = useRef<string | null>(null);

  // Clean up the blob URL when the dialog closes or the doc changes.
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl]);

  // Reset state when dialog closes.
  useEffect(() => {
    if (open) return;
    setPdfUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    setPdfError(null);
    setMd("");
    setMdMissing(false);
    setMdError(null);
    pdfLoadedFor.current = null;
    mdLoadedFor.current = null;
  }, [open]);

  // Sync filename from state — backfilled if the fetch returns a different one.
  useEffect(() => {
    if (state?.fileName) setFileName(state.fileName);
  }, [state?.fileName]);

  // Fetch PDF lazily the first time the PDF tab is opened (and cached per docId).
  useEffect(() => {
    if (!open || !docId) return;
    if (tab !== "pdf") return;
    if (pdfLoadedFor.current === docId) return;
    pdfLoadedFor.current = docId;
    setPdfLoading(true);
    setPdfError(null);
    setPdfUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    getStepperFile({ data: { id: docId } })
      .then((payload) => {
        const bin = Uint8Array.from(atob(payload.base64), (c) => c.charCodeAt(0));
        const blob = new Blob([bin], { type: payload.mimeType });
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
        setMimeType(payload.mimeType);
        setFileName(payload.fileName);
      })
      .catch((err: unknown) => {
        setPdfError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setPdfLoading(false));
  }, [open, docId, tab]);

  // Fetch markdown lazily the first time the Markdown tab is opened.
  useEffect(() => {
    if (!open || !docId) return;
    if (tab !== "markdown") return;
    if (mdLoadedFor.current === docId) return;
    mdLoadedFor.current = docId;
    setMdLoading(true);
    setMdError(null);
    getStepperMarkdown({ data: { id: docId } })
      .then((payload) => {
        setMd(payload.markdown);
        setMdMissing(payload.missing);
        setFileName(payload.fileName);
      })
      .catch((err: unknown) => {
        setMdError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setMdLoading(false));
  }, [open, docId, tab]);

  const onDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = fileName ?? "document";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isImage = mimeType.startsWith("image/");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="document-viewer-dialog"
        className="max-h-[92vh] w-[min(96vw,1100px)] max-w-none gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="border-b px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">
              <FileText className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-[15px] font-semibold text-primary">
                {fileName ?? "Document"}
              </DialogTitle>
              <DialogDescription className="text-[12px] text-muted-foreground">
                View the original file or the agent's extracted markdown.
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onDownload}
              disabled={!pdfUrl || pdfLoading}
              data-testid="document-viewer-download"
              className="mr-9 shrink-0"
            >
              <Download className="size-4" /> Download
            </Button>
          </div>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "pdf" | "markdown")}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b bg-surface-muted/40 px-5 py-2">
            <TabsList className="bg-transparent">
              <TabsTrigger value="pdf" data-testid="document-viewer-tab-pdf">
                Original file
              </TabsTrigger>
              <TabsTrigger value="markdown" data-testid="document-viewer-tab-markdown">
                Markdown extraction
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="pdf"
            className="m-0 min-h-0 flex-1 overflow-hidden bg-secondary/30"
          >
            {pdfLoading && <CenteredSpinner label="Loading file…" />}
            {pdfError && (
              <CenteredError icon={<AlertCircle className="size-6" />} title="Couldn't load file" body={pdfError} />
            )}
            {!pdfLoading && !pdfError && pdfUrl && (
              isImage ? (
                <div className="flex h-[70vh] items-center justify-center overflow-auto">
                  <img
                    src={pdfUrl}
                    alt={fileName ?? "Document preview"}
                    className="max-h-full max-w-full object-contain"
                    data-testid="document-viewer-image"
                  />
                </div>
              ) : (
                <iframe
                  title={fileName ?? "Document"}
                  src={pdfUrl}
                  className="h-[70vh] w-full"
                  data-testid="document-viewer-iframe"
                />
              )
            )}
            {!pdfLoading && !pdfError && !pdfUrl && (
              <CenteredSpinner label="Preparing preview…" />
            )}
          </TabsContent>

          <TabsContent
            value="markdown"
            className="m-0 min-h-0 flex-1 overflow-hidden"
          >
            {mdLoading && <CenteredSpinner label="Loading extraction…" />}
            {mdError && (
              <CenteredError
                icon={<AlertCircle className="size-6" />}
                title="Couldn't load extraction"
                body={mdError}
              />
            )}
            {!mdLoading && !mdError && mdMissing && (
              <CenteredError
                icon={<FileWarning className="size-6" />}
                title="Extraction not yet available"
                body="The agent hasn't finished reading this document, or extraction failed. Try again once the slot shows as processed."
              />
            )}
            {!mdLoading && !mdError && !mdMissing && (
              <pre
                data-testid="document-viewer-markdown"
                className={cn(
                  "h-[70vh] overflow-auto whitespace-pre-wrap break-words p-6",
                  "font-mono text-[12.5px] leading-relaxed text-foreground/90",
                )}
              >
                {md}
              </pre>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex h-[70vh] items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

function CenteredError({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex h-[70vh] items-center justify-center px-6">
      <div className="max-w-md rounded-xl border bg-surface p-6 text-center">
        <div className="mx-auto grid size-10 place-items-center rounded-full bg-[color:var(--warn)]/10 text-[color:var(--warn)]">
          {icon}
        </div>
        <h3 className="mt-3 text-sm font-semibold text-primary">{title}</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
