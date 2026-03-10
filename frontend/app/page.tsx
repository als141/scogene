"use client";

import { Header } from "@/components/header";
import { GradingForm } from "@/components/grading-form";
import { StreamDisplay } from "@/components/stream-display";
import { GradingResult } from "@/components/grading-result";
import { GradingHistory } from "@/components/grading-history";
import { useGrading } from "@/hooks/use-grading";

export default function Home() {
  const {
    isGrading,
    streamContent,
    statusMessage,
    result,
    history,
    error,
    submitForGrading,
  } = useGrading();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-5xl px-4 py-6 md:py-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          {/* Main content */}
          <div className="space-y-6">
            <GradingForm onSubmit={submitForGrading} isLoading={isGrading} />

            <StreamDisplay
              content={streamContent}
              statusMessage={statusMessage}
              isActive={isGrading}
            />

            {result && <GradingResult result={result} />}

            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Mobile history */}
            <div className="lg:hidden">
              <GradingHistory items={history} />
            </div>
          </div>

          {/* Desktop sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-20">
              <GradingHistory items={history} />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
