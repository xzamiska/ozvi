import type { Project } from "./project";

/** Widget write API: only origins the project owner allowed. */
export function corsHeaders(project: Project | undefined, origin: string | null): Record<string, string> {
  if (!project || !origin || !project.allowedOrigins.includes(origin)) return { vary: "Origin" };
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}
