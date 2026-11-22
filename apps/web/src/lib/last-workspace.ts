/** Cookie with the id of the workspace last open in the console (not a secret: membership is checked on use). */
export const LAST_WORKSPACE_COOKIE = "ozvi_ws";
export const LAST_WORKSPACE_MAX_AGE = 365 * 86_400;

/** The workspace a console path opens (/app/w/<id>/…), remembered by the proxy on the response. */
export function workspaceInPath(path: string): string | null {
  return /^\/app\/w\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/|$)/i.exec(path)?.[1]?.toLowerCase() ?? null;
}

/** The workspace /app opens: the one just created a project in, else the remembered one if still a member, else the first. */
export function pickWorkspace<W extends { id: string; projects: { slug: string }[] }>(all: W[], opts: { created?: string; last?: string }): W | undefined {
  return (opts.created && all.find((w) => w.projects.some((p) => p.slug === opts.created)))
    || (opts.last && all.find((w) => w.id === opts.last))
    || all[0];
}
