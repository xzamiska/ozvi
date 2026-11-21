/** Cookie with the id of the workspace last open in the console (not a secret: membership is checked on use). */
export const LAST_WORKSPACE_COOKIE = "ozvi_ws";

/** The workspace /app opens: the one just created a project in, else the remembered one if still a member, else the first. */
export function pickWorkspace<W extends { id: string; projects: { slug: string }[] }>(all: W[], opts: { created?: string; last?: string }): W | undefined {
  return (opts.created && all.find((w) => w.projects.some((p) => p.slug === opts.created)))
    || (opts.last && all.find((w) => w.id === opts.last))
    || all[0];
}
