import { Sparkles, ShieldCheck, ListChecks, FileText } from "lucide-react";

/** Shared icons for tabs inside CaseIntelligencePanel — kept separate from the
 * component file so HMR's fast-refresh only-exports-components rule stays clean. */
export const PanelIcons = {
  Activity: <Sparkles className="size-3" />,
  Checks: <ShieldCheck className="size-3" />,
  Checklist: <ListChecks className="size-3" />,
  Evidence: <FileText className="size-3" />,
};
