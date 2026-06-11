"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Wrench } from "lucide-react";

/**
 * Segment error boundary for all dashboard tabs. While the legacy screens are
 * being migrated onto the NestJS API, any tab that still depends on the old
 * data layer renders this friendly notice instead of crashing the app.
 */
export default function DashboardSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the underlying error in the console for developers.
    console.error("Dashboard segment error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-muted/30 p-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Wrench className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">This section is being migrated</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          This screen still runs on the previous data layer and is being moved
          onto the new API. Authentication, navigation, and the migrated
          dashboards work normally.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
