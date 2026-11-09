import { createElement, useEffect, useRef, type ReactElement, type RefObject } from "react";
import { loadOzvi, ozvi, type LoadOptions } from "./loader";
import type { OzviEventName, OzviListener, OzviOptions } from "./types";

/**
 * @ozvi/widget/react — hook and components. Works with SSR (Next.js App Router and Pages): nothing runs on the
 * server except rendering the custom element tags; widget.js loads in an effect. Mark files that use the hooks
 * with "use client" in the App Router.
 *
 *   <OzviWidget host="https://feedback.example.com" project="acme" tokenUrl="/api/ozvi-token" />
 *   const ozvi = useOzvi(); ozvi.open("ideas");
 *   <OzviChangelog host="https://feedback.example.com" project="acme" limit={3} />
 */

export * from "./loader";

const kebab = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), String(v)]));

/** The API (stable object; calls before widget.js loads are queued). */
export function useOzvi() {
  return ozvi;
}

/** Subscribes to a widget event for the lifetime of the component. */
export function useOzviEvent<E extends OzviEventName>(event: E, handler: OzviListener<E>): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => ozvi.on(event, ((d: never) => ref.current(d)) as OzviListener<E>), [event]);
}

export type OzviWidgetProps = OzviOptions & Pick<LoadOptions, "src" | "nonce" | "config">;

/** The floating widget: renders <ozvi-widget> and loads widget.js once. */
export function OzviWidget({ src, nonce, config, ...opts }: OzviWidgetProps): ReactElement {
  useEffect(() => { loadOzvi({ src, nonce, config, host: opts.host }).catch((e) => console.warn(e)); }, [src, opts.host]);
  return createElement("ozvi-widget", { ...kebab(opts as Record<string, unknown>), suppressHydrationWarning: true });
}

export interface OzviEmbedProps { project: string; host?: string; lang?: "sk" | "cs" | "en"; heading?: string; tokenUrl?: string; src?: string; nonce?: string; className?: string }

function embed(tag: string, props: OzviEmbedProps, ref?: RefObject<HTMLElement | null>): ReactElement {
  const { src, nonce, className, ...rest } = props as OzviEmbedProps & Record<string, unknown>;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- called from components below only
  useEffect(() => { loadOzvi({ src, nonce, host: rest.host as string | undefined }).catch((e) => console.warn(e)); }, [src, rest.host]);
  return createElement(tag, { ...kebab(rest), class: className, ref, suppressHydrationWarning: true });
}

/** Inline roadmap: planned / in progress / shipped, `limit` cards per lane. */
export function OzviRoadmap(props: OzviEmbedProps & { limit?: number; lanes?: string }): ReactElement {
  return embed("ozvi-roadmap", props);
}

/** Inline changelog (latest `limit` entries) or, with mode="badge", a "What's new" button with the unseen count. */
export function OzviChangelog({ onUnseen, ...props }: OzviEmbedProps & { limit?: number; mode?: "list" | "badge"; align?: "start" | "end"; onUnseen?: (count: number) => void }): ReactElement {
  const cb = useRef(onUnseen);
  cb.current = onUnseen;
  const el = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = el.current;
    const h = (e: Event) => cb.current?.((e as CustomEvent<{ count: number }>).detail.count);
    node?.addEventListener("ozvi:unseen", h);
    return () => node?.removeEventListener("ozvi:unseen", h);
  }, []);
  return embed("ozvi-changelog", props, el);
}
