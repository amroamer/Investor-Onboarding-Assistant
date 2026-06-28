import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/onboarding/TopBar";
import { ConversationFeed } from "@/components/onboarding/ConversationFeed";
import { VoiceProvider } from "@/lib/onboarding/voice";
import { ProgressPanel } from "@/components/onboarding/ProgressPanel";
import { DispatchProvider } from "@/lib/onboarding/dispatch";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Onboarding — MGX" },
      { name: "description", content: "Investor onboarding workspace." },
    ],
  }),
  component: OnboardingWorkspace,
});

function OnboardingWorkspace() {
  return (
    <VoiceProvider>
      <DispatchProvider>
        <div className="flex h-screen flex-col bg-background">
          <TopBar />
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_360px]">
            <main className="min-h-0 bg-background">
              <ConversationFeed />
            </main>
            <ProgressPanel />
          </div>
        </div>
      </DispatchProvider>
    </VoiceProvider>
  );
}
