import { LogoutButton } from "@/components/logout-button";
import { ShieldAlert } from "lucide-react";

export default function NoAccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="max-w-md text-center space-y-4 bg-card border rounded-xl p-10 shadow-sm">
        <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold">No dashboards available</h1>
        <p className="text-sm text-muted-foreground">
          Your account doesn&apos;t have access to any dashboards yet. Please
          contact your administrator to request access.
        </p>
        <LogoutButton />
      </div>
    </div>
  );
}
