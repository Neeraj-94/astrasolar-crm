/**
 * Consultant directory — backed by the live API (GET /users/consultants).
 *
 * Replaces the former mock consultant list. The endpoint returns active sales
 * consultants scoped to the viewer; see apps/api UsersController.consultants().
 */
import { useApi } from "@/lib/api/use-api";

export interface Consultant {
  id: string;
  name: string;
  email: string;
  /** Region label as stored on the User (e.g. "ACT", "TAS", null). */
  region: string | null;
}

/**
 * Live consultant directory hook. Returns the resolved list (empty until
 * loaded) plus the raw loading/error/reload handles for callers that need them.
 */
export function useConsultants() {
  const { data, loading, error, reload } = useApi<Consultant[]>(
    "/users/consultants",
  );
  return { consultants: data ?? [], loading, error, reload };
}
