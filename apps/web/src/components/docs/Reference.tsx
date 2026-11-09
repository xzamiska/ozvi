import { Fragment } from "react";
import { Method, Table } from "./blocks";

/**
 * Renders the OpenAPI document (lib/api/openapi.ts) as readable reference: no client-side renderer,
 * no dependency, the same spec the API serves. Schemas link to their own section.
 */

type Json = Record<string, any>;

const refName = (r: string) => r.split("/").pop()!;
const HEADER_NAME: Record<string, string> = { IdempotencyKey: "Idempotency-Key", IfNoneMatch: "If-None-Match", Lockdown: "X-Ozvi-Lockdown" };

/** Descriptions use `code` spans (as in Markdown); render them as code. */
export function Inline({ text }: { text: string | undefined }) {
  if (!text) return null;
  return text.split(/(`[^`]+`)/g).map((part, i) => (part.startsWith("`") && part.endsWith("`") && part.length > 2
    ? <code key={i}>{part.slice(1, -1)}</code> : <Fragment key={i}>{part}</Fragment>));
}
export const opAnchor = (id: string) => `op-${id}`;
const schemaAnchor = (name: string) => `schema-${name}`;

function TypeOf({ s }: { s: Json | undefined }): React.ReactNode {
  if (!s) return "any";
  if (s.$ref) return <a href={`#${schemaAnchor(refName(s.$ref))}`}>{refName(s.$ref)}</a>;
  if (s.anyOf || s.oneOf) {
    const list = (s.anyOf ?? s.oneOf) as Json[];
    return list.map((x, i) => <Fragment key={i}>{i > 0 && " | "}<TypeOf s={x} /></Fragment>);
  }
  if (s.const !== undefined) return <code>{JSON.stringify(s.const)}</code>;
  if (s.enum) return (s.enum as unknown[]).map((v, i) => <Fragment key={i}>{i > 0 && " | "}<code>{JSON.stringify(v)}</code></Fragment>);
  const types = (Array.isArray(s.type) ? s.type : [s.type ?? (s.properties ? "object" : "any")]) as string[];
  return types.map((t, i) => (
    <Fragment key={i}>
      {i > 0 && " | "}
      {t === "array" ? <>array of <TypeOf s={s.items} /></> : t === "object" && s.additionalProperties && typeof s.additionalProperties === "object" && !s.properties ? <>map of <TypeOf s={s.additionalProperties} /></> : t}
    </Fragment>
  ));
}

function constraints(s: Json): string {
  const out: string[] = [];
  if (s.format) out.push(s.format);
  if (s.minLength !== undefined || s.maxLength !== undefined) out.push(`length ${s.minLength ?? 0}–${s.maxLength ?? "∞"}`);
  const min = s.minimum ?? (s.exclusiveMinimum !== undefined ? (s.type === "integer" ? s.exclusiveMinimum + 1 : `>${s.exclusiveMinimum}`) : undefined);
  if (min !== undefined || s.maximum !== undefined) out.push(s.maximum === 2147483647 ? `≥ ${min}` : `${min ?? "…"}–${s.maximum ?? "…"}`);
  if (s.maxItems !== undefined) out.push(`max ${s.maxItems} items`);
  if (s.default !== undefined) out.push(`default ${JSON.stringify(s.default)}`);
  return out.join(", ");
}

/** Object properties one level deep; nested inline objects are listed with dotted names. */
function rows(s: Json, prefix = "", depth = 0): React.ReactNode[][] {
  const props = (s.properties ?? {}) as Record<string, Json>;
  const req = new Set((s.required ?? []) as string[]);
  return Object.entries(props).flatMap(([name, p]) => {
    const full = `${prefix}${name}`;
    const extra = constraints(p);
    const row: React.ReactNode[] = [
      <code key="n">{full}</code>,
      <span key="t" className="text-[13.5px]"><TypeOf s={p.type === "object" && p.properties ? { type: "object" } : p} /></span>,
      <span key="d" className="text-[13.5px] text-muted-foreground">
        {req.has(name) ? <span className="font-semibold text-foreground">required. </span> : null}
        <Inline text={p.description} />{extra && <span className="block font-mono text-[12px]">{extra}</span>}
      </span>,
    ];
    const nested = p.type === "object" && p.properties && depth < 2 ? rows(p, `${full}.`, depth + 1)
      : p.type === "array" && p.items?.properties && depth < 2 ? rows(p.items, `${full}[].`, depth + 1) : [];
    return [row, ...nested];
  });
}

export function Operation({ path, method, op }: { path: string; method: string; op: Json }) {
  const params = ((op.parameters ?? []) as Json[]).filter((p) => !p.$ref);
  const body = op.requestBody?.content?.["application/json"]?.schema as Json | undefined;
  const ok = Object.entries(op.responses as Record<string, Json>).filter(([c]) => /^2/.test(c));
  const problems = Object.entries(op.responses as Record<string, Json>).filter(([c]) => /^[45]/.test(c));
  const sharedHeaders = ((op.parameters ?? []) as Json[]).filter((p) => p.$ref).map((p) => refName(p.$ref));
  return (
    <section aria-labelledby={opAnchor(op.operationId)} className="mt-8 min-w-0 rounded-xl border bg-surface">
      <header className="grid gap-1.5 border-b px-4 py-3.5 sm:px-5">
        <h4 id={opAnchor(op.operationId)} className="!m-0 flex scroll-mt-24 flex-wrap items-center gap-x-3 gap-y-1.5 text-[15px] font-semibold">
          <Method m={method.toUpperCase()} />
          <code className="!bg-transparent !p-0 font-mono text-[14px] break-all">{path}</code>
        </h4>
        <p className="text-[14.5px] font-medium">{op.summary}</p>
      </header>
      <div className="grid gap-1 px-4 py-4 text-[14.5px] sm:px-5">
        {(op.description as string).split("\n\n").map((para, i) => <p key={i} className="text-muted-foreground"><Inline text={para} /></p>)}
        {params.length > 0 && (
          <>
            <p className="mt-3 text-[13px] font-semibold">Parameters</p>
            <Table label={`Parameters of ${op.operationId}`} className="!my-1" head={["Name", "In", "Type", "Description"]} rows={params.map((p) => [
              <code key="n">{p.name}</code>, p.in, <span key="t" className="text-[13.5px]"><TypeOf s={p.schema} /></span>,
              <span key="d" className="text-[13.5px] text-muted-foreground">{p.required ? <span className="font-semibold text-foreground">required. </span> : null}<Inline text={p.description} />
                {constraints(p.schema ?? {}) && <span className="block font-mono text-[12px]">{constraints(p.schema ?? {})}</span>}</span>,
            ])} />
          </>
        )}
        {body?.$ref && <p className="mt-3 text-[14px]"><span className="font-semibold">Body</span> (application/json): <TypeOf s={body} /></p>}
        {ok.map(([code, r]) => (
          <p key={code} className="mt-2 text-[14px]">
            <span className="font-semibold">{code}</span> {r.description}
            {r.content?.["application/json"] && <> → <TypeOf s={r.content["application/json"].schema} /></>}
            {r.content?.["text/csv"] && <> (or <code>text/csv</code>)</>}
          </p>
        ))}
        <p className="mt-2 text-[13.5px] text-muted-foreground">
          <span className="font-semibold text-foreground">Errors:</span>{" "}
          {problems.map(([code, r], i) => <Fragment key={code}>{i > 0 && " · "}<span className="font-semibold">{code}</span> <Inline text={(r.description as string).replace(/^[^:]+: /, "")} /></Fragment>)}
        </p>
        {sharedHeaders.length > 0 && <p className="text-[13px] text-muted-foreground">Headers: {sharedHeaders.map((h, i) => <Fragment key={h}>{i > 0 && ", "}<code>{HEADER_NAME[h] ?? h}</code></Fragment>)}</p>}
      </div>
    </section>
  );
}

export function Schemas({ schemas }: { schemas: Record<string, Json> }) {
  return (
    <>
      {Object.entries(schemas).sort(([a], [b]) => a.localeCompare(b)).map(([name, s]) => (
        <div key={name} className="min-w-0">
          <h3 id={schemaAnchor(name)}>{name}</h3>
          {s.description && <p className="text-muted-foreground"><Inline text={s.description} /></p>}
          {s.properties ? <Table label={`Fields of ${name}`} head={["Field", "Type", "Description"]} rows={rows(s)} /> : <p><TypeOf s={s} /></p>}
        </div>
      ))}
    </>
  );
}
