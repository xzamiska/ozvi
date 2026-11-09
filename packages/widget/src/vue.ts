import { defineComponent, h, onBeforeUnmount, onMounted, ref, type App, type PropType } from "vue";
import { loadOzvi, ozvi, type LoadOptions } from "./loader";
import type { OzviEventName, OzviListener } from "./types";

/**
 * @ozvi/widget/vue — plugin, composables and components. SSR-safe (Nuxt): widget.js loads only in the browser.
 *
 *   app.use(OzviPlugin, { host: "https://feedback.example.com", project: "acme", tokenUrl: "/api/ozvi-token" });
 *   const ozvi = useOzvi(); ozvi.open("ideas");
 *   <OzviChangelog host="https://feedback.example.com" project="acme" :limit="3" />
 *
 * Using the <ozvi-*> tags directly in templates? Tell Vue they are custom elements:
 * compilerOptions.isCustomElement = (tag) => tag.startsWith("ozvi-").
 */

export * from "./loader";

/** app.use(OzviPlugin, options): loads widget.js and adds the floating widget (when `project` is given). */
export const OzviPlugin = {
  install(app: App, opts: LoadOptions = {}) {
    app.config.globalProperties.$ozvi = ozvi;
    if (typeof window !== "undefined") loadOzvi(opts).catch((e) => console.warn(e));
  },
};

export const useOzvi = () => ozvi;

/** Subscribes to a widget event while the calling component is mounted. */
export function useOzviEvent<E extends OzviEventName>(event: E, handler: OzviListener<E>): void {
  let off: (() => void) | undefined;
  onMounted(() => { off = ozvi.on(event, handler); });
  onBeforeUnmount(() => off?.());
}

const common = {
  project: { type: String, required: true },
  host: String, lang: String, heading: String, tokenUrl: String, src: String, nonce: String,
  limit: [Number, String] as PropType<number | string>,
};
const attrs = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([k, v]) => v != null && v !== "" && k !== "src" && k !== "nonce").map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), String(v)]));

function embed(tag: string, extra: Record<string, unknown>) {
  return defineComponent({
    props: { ...common, ...extra },
    emits: ["unseen"],
    setup(props, { emit }) {
      const el = ref<HTMLElement | null>(null);
      const onUnseen = (e: Event) => emit("unseen", (e as CustomEvent<{ count: number }>).detail.count);
      onMounted(() => {
        loadOzvi({ src: props.src, nonce: props.nonce, host: props.host }).catch((e) => console.warn(e));
        el.value?.addEventListener("ozvi:unseen", onUnseen);
      });
      onBeforeUnmount(() => el.value?.removeEventListener("ozvi:unseen", onUnseen));
      return () => h(tag, { ...attrs(props as Record<string, unknown>), ref: el });
    },
  });
}

/** Inline roadmap: planned / in progress / shipped. */
export const OzviRoadmap = embed("ozvi-roadmap", { lanes: String });
/** Inline changelog or, with mode="badge", a "What's new" button with the unseen count (emits `unseen`). */
export const OzviChangelog = embed("ozvi-changelog", { mode: String, align: String });
