// Public surface for the leads module.
// Import lifecycle helpers and types from "@/lib/leads".

export * from "./types";
// `lifecycle` uses `server-only` and the Prisma client, so it is only safe
// to import from server-side code (route handlers, server actions, RSCs).
export * from "./lifecycle";
