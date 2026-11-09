import { describe, expect, it, vi } from "vitest";
import { createApi, peekToken, traitsLine, type Controller } from "./api";
import { isUnseen, readSeen, seenKey, unseenCount, writeSeen } from "./seen";

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims: object) => `${b64({ alg: "HS256" })}.${b64(claims)}.sig`;

/** A window with the snippet stub already on it, as a host page has before widget.js loads. */
function pageWithStub() {
  const w = { fetch: vi.fn() } as unknown as Window & { Ozvi?: unknown };
  const stub = function (...a: unknown[]) { stub.q.push(a); } as ((...a: unknown[]) => void) & { q: unknown[][] };
  stub.q = [];
  w.Ozvi = stub;
  return { w, stub };
}

function controller() {
  let open = false;
  const el = new EventTarget() as unknown as HTMLElement;
  const calls: string[] = [];
  const c: Controller = { el, open: (t) => { open = true; calls.push(`open:${t}`); }, close: () => { open = false; calls.push("close"); }, isOpen: () => open };
  return { c, calls };
}

describe("queue before load (snippet stub)", () => {
  it("runs queued calls in order once widget.js loads, and open() waits for the widget element", async () => {
    const { w, stub } = pageWithStub();
    stub("prefill", { title: "Export do CSV", kind: "idea" });
    stub("setLanguage", "en");
    stub("open", "ideas");
    const readyCb = vi.fn();
    stub("ready", readyCb);
    const api = createApi(w, "1");
    expect(w.Ozvi).toBe(api);
    expect(api.__.state.prefill).toEqual({ title: "Export do CSV", body: undefined, kind: "idea" });
    expect(api.__.state.lang).toBe("en");
    await api.ready;
    expect(readyCb).toHaveBeenCalledWith(api);
    const { c, calls } = controller();
    expect(calls).toEqual([]);
    api.__.attach(c);
    expect(calls).toEqual(["open:ideas"]);
  });

  it("accepts method-style queue entries and arguments objects, ignores unknown methods", () => {
    const { w, stub } = pageWithStub();
    (function (..._a: unknown[]) { stub.q.push(arguments as unknown as unknown[]); })("setTraits", { plan: "pro" });
    stub.q.push(["nope", 1]);
    const api = createApi(w, "1");
    expect(api.__.state.traits).toEqual({ plan: "pro" });
  });

  it("toggle and close go to the attached widget; Ozvi(\"open\") works after load too", () => {
    const api = createApi({ fetch: vi.fn() } as never, "1");
    const { c, calls } = controller();
    api.__.attach(c);
    api.toggle("bug");
    api.toggle();
    api("open", "menu");
    expect(calls).toEqual(["open:bug", "close", "open:menu"]);
    expect(api.isOpen()).toBe(true);
  });
});

describe("events", () => {
  it("on/off, unsubscribe function, DOM event on the element, a throwing listener does not stop others", () => {
    vi.useFakeTimers();
    const api = createApi({ fetch: vi.fn() } as never, "1");
    const a = vi.fn(), b = vi.fn(), bad = vi.fn(() => { throw new Error("host bug"); });
    api.on("submitted", bad);
    api.on("submitted", a);
    const un = api.on("submitted", b);
    const el = new EventTarget();
    const dom = vi.fn();
    el.addEventListener("ozvi:submitted", (e) => dom((e as CustomEvent).detail));
    const detail = { kind: "bug", number: 7, url: "https://x/acme/i/7", pending: null };
    api.__.emit("submitted", detail, el as HTMLElement);
    expect(a).toHaveBeenCalledWith(detail);
    expect(b).toHaveBeenCalledWith(detail);
    expect(dom).toHaveBeenCalledWith(detail);
    un();
    api.off("submitted", a);
    api.__.emit("submitted", detail);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(() => vi.runAllTimers()).toThrow("host bug");
    vi.useRealTimers();
  });

  it("notifies the widget when state changes", () => {
    const api = createApi({ fetch: vi.fn() } as never, "1");
    const f = vi.fn();
    const un = api.__.subscribe(f);
    api.prefill({ body: "x" });
    api.setLanguage("cs");
    api.setLanguage("xx" as never);
    expect(api.__.state.lang).toBeNull();
    un();
    api.logout();
    expect(f).toHaveBeenCalledTimes(3);
  });
});

describe("prefill", () => {
  it("bounds the text, defaults to a bug, null clears", () => {
    const api = createApi({ fetch: vi.fn() } as never, "1");
    api.prefill({ title: "t".repeat(300), body: "b" });
    expect(api.__.state.prefill!.title).toHaveLength(200);
    expect(api.__.state.prefill!.kind).toBe("bug");
    api.prefill(null);
    expect(api.__.state.prefill).toBeNull();
  });
});

describe("identify and tokens", () => {
  const tokenUrl = "/api/ozvi-token";
  it("uses identify() before the token attribute and token-url; logout forgets it", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ token: jwt({ id: "u-url", exp: Date.now() / 1000 + 600 }) }), { headers: { "content-type": "application/json" } }));
    const api = createApi({ fetch } as never, "1");
    api.identify(jwt({ id: "u-direct" }));
    expect(peekToken(await api.__.token({ token: "attr", url: tokenUrl }, fetch as never)).id).toBe("u-direct");
    expect(api.__.uid()).toBe("u-direct");
    api.identify({ token: async () => "from-fn", id: "acct-9" });
    expect(await api.__.token({ url: tokenUrl }, fetch as never)).toBe("from-fn");
    expect(api.__.uid()).toBe("acct-9");
    api.logout();
    expect(await api.__.token({ token: "attr" }, fetch as never)).toBe("attr");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("caches a token-url token until shortly before it expires", async () => {
    let n = 0;
    const fetch = vi.fn(async () => new Response(jwt({ id: "u1", exp: Math.floor(Date.now() / 1000) + (n++ === 0 ? 600 : 30) })));
    const api = createApi({ fetch } as never, "1");
    const t1 = await api.__.token({ url: tokenUrl }, fetch as never);
    expect(await api.__.token({ url: tokenUrl }, fetch as never)).toBe(t1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(api.__.uid()).toBe("u1");
    api.logout(); // clears the cache
    await api.__.token({ url: tokenUrl }, fetch as never);
    await api.__.token({ url: tokenUrl }, fetch as never); // expires in 30 s: not cached
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("fails with no-token when there is no way to get one or the endpoint refuses", async () => {
    const api = createApi({ fetch: vi.fn() } as never, "1");
    await expect(api.__.token({})).rejects.toThrow("no-token");
    const refuse = vi.fn(async () => new Response("", { status: 401 }));
    await expect(api.__.token({ url: tokenUrl }, refuse as never)).rejects.toThrow("no-token");
  });
});

describe("traits and seen state", () => {
  it("formats traits for the bug context", () => {
    expect(traitsLine({ plan: "pro", seats: 5, beta: true, empty: "", none: null })).toBe("plan: pro · seats: 5 · beta: true");
    expect(traitsLine(null)).toBe("");
  });
  it("counts changelog entries newer than the last seen one, per person", () => {
    const entries = [{ publishedAt: "2026-11-01T10:00:00.000Z" }, { publishedAt: "2026-10-01T10:00:00.000Z" }];
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const key = seenKey("https://x", "acme", "u1");
    expect(key).not.toBe(seenKey("https://x", "acme", ""));
    expect(unseenCount(entries, readSeen(store, key))).toBe(2);
    writeSeen(store, key, entries);
    expect(unseenCount(entries, readSeen(store, key))).toBe(0);
    expect(isUnseen({ publishedAt: "2026-11-05T00:00:00.000Z" }, readSeen(store, key))).toBe(true);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readSeen(broken, key)).toBeNull();
    expect(() => writeSeen(broken, key, entries)).not.toThrow();
  });
});
