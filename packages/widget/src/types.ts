/**
 * Public types of the Ozvi widget JavaScript API (window.Ozvi, the <ozvi-widget> element, @ozvi/widget,
 * @ozvi/widget/react, @ozvi/widget/vue). Type-only: nothing here ends up in widget.js.
 */
export interface NetEntry {
  at: number; method: string; url: string; status: number; ms: number; failed: boolean;
  size?: number; type?: string; error?: string; req?: string; res?: string;
}
export type LinkKind = "sentry" | "posthog" | "logrocket";
/** window.OzviConfig / Ozvi.configure(): what bug reports capture (README, "Configuration"). */
export interface OzviConfig {
  network?: boolean; networkBodies?: boolean; actions?: boolean;
  maskRequest?: (e: NetEntry) => NetEntry | null | false | undefined | void;
  links?: Partial<Record<LinkKind, string | (() => string | null | undefined)>>;
  detectLinks?: boolean; sentryOrg?: string;
  /** CSP nonce for scripts and styles the widget adds (default: the nonce of the widget.js <script>). */
  nonce?: string;
}
export type OzviLang = "sk" | "cs" | "en" | "pl" | "hu" | "de";

/** Which part of the widget to open. "mine" opens the person's reports on the board in a new tab. */
export type OzviTab = "menu" | "bug" | "ideas" | "idea" | "mine";

export interface OzviPrefill {
  title?: string;
  body?: string;
  /** Which form the text goes to; default "bug". */
  kind?: "bug" | "idea";
}

/** Something that returns a fresh signOzviToken() value from your backend. */
export type OzviTokenSource = string | (() => string | Promise<string>);

export interface OzviIdentity {
  /** A signOzviToken() value or a function returning one. Without it the widget asks `token-url`. */
  token?: OzviTokenSource;
  /** Your user id; only used to remember, per person, which changelog entries they have seen. */
  id?: string;
}

/** Shown to the team with bug reports as "Page data (unverified)". Signed traits belong in the SSO token. */
export type OzviTraits = Record<string, string | number | boolean | null | undefined>;

export interface OzviEvents {
  open: { tab: OzviTab };
  close: Record<string, never>;
  submit: { kind: "bug" | "idea"; title: string };
  /** The report or idea was saved. `pending` is set when it waits for the team's approval. */
  submitted: { kind: "bug" | "idea"; number: number; url: string; pending: string | null };
  error: { kind?: "bug" | "idea" | "vote"; message: string };
}
export type OzviEventName = keyof OzviEvents;
export type OzviListener<E extends OzviEventName> = (detail: OzviEvents[E]) => void;

/** What init() / loadOzvi() / <OzviWidget> accept: the <ozvi-widget> attributes in camelCase. */
export interface OzviOptions {
  project: string;
  /** Ozvi base URL; defaults to where widget.js was loaded from. */
  host?: string;
  /** Same-origin endpoint of your app returning {"token": "..."} (preferred: always fresh). */
  tokenUrl?: string;
  token?: string;
  appVersion?: string;
  /** "none" hides the floating button; open it with Ozvi.open(). */
  launcher?: "none" | "button";
  lang?: OzviLang;
  label?: string;
  network?: "off" | "bodies";
  actions?: "off";
  links?: "auto";
}

export interface OzviApi {
  /** Snippet-style call: Ozvi("open", "ideas"). */
  (method: string, ...args: unknown[]): unknown;
  readonly version: string;
  /** Resolves once widget.js has loaded and calls queued before that have run. */
  readonly ready: Promise<OzviApi>;
  /** Adds an <ozvi-widget> to the page (once) and returns it. */
  init(options: OzviOptions): HTMLElement;
  open(tab?: OzviTab): void;
  close(): void;
  toggle(tab?: OzviTab): void;
  isOpen(): boolean;
  /** Text for the next bug report or idea form; null clears it. */
  prefill(p: OzviPrefill | null): void;
  identify(who: OzviTokenSource | OzviIdentity): void;
  /** Forgets the identity and any cached token (call it when the person signs out of your app). */
  logout(): void;
  setTraits(traits: OzviTraits): void;
  setLanguage(lang: OzviLang): void;
  on<E extends OzviEventName>(event: E, fn: OzviListener<E>): () => void;
  off<E extends OzviEventName>(event: E, fn: OzviListener<E>): void;
  configure(c: OzviConfig): void;
}
