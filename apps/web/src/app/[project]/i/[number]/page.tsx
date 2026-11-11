import { ITEM_STATUSES, schema, withProject } from "@ozvi/db";
import { and, asc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { Ban, Hourglass, Lock, MessagesSquare, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { CommentForm } from "@/components/CommentForm";
import { ConfirmFix } from "@/components/ConfirmFix";
import { Gallery } from "@/components/Gallery";
import { CaptureLinks, CaptureTimeline, TeamOnly } from "@/components/ozvi/BugCapture";
import { NetworkLog } from "@/components/ozvi/NetworkLog";
import { contextFor, timeline, type Capture } from "@/lib/bug-context";
import { Journey, type JourneyEvent } from "@/components/ozvi/Journey";
import { EmptyState, Page } from "@/components/ozvi/page";
import { StatusTag } from "@/components/ozvi/route";
import { VotersExport } from "@/components/ExportMenu";
import { AiSummaryBox, GithubBox, MergeBox, RouteControl } from "@/components/ozvi/TeamTools";
import { ProofBox } from "@/components/ozvi/ProofBox";
import { listProofs, readProof, visibleProof } from "@/lib/proof";
import { Button } from "@/components/ui/button";
import { VoteButton } from "@/components/VoteButton";
import { CommentContent, ItemEditForm, ItemEditScope, ItemMenu, QueueActions, RestoreButton, WhenViewing } from "@/components/Moderation";
import { canDeleteComment, canEditComment, canEditPost, isBlocked } from "@/lib/moderation-rules";
import { aiAvailable } from "@/lib/ai";
import { db } from "@/lib/db";
import { ago, browserLabel } from "@/lib/format";
import { getGithub } from "@/lib/github";
import { getLinear } from "@/lib/linear";
import { getJira } from "@/lib/jira";
import { TrackerBox } from "@/components/TrackerForms";
import { getCtx, loginHref } from "@/lib/project";
import { LOCALE_TAG, type Locale } from "@/i18n/locales";
import { getTranslations } from "next-intl/server";
import { TagList } from "@/components/ozvi/tags";
import { TagPicker } from "@/components/ozvi/TagPicker";
import { listTags, tagsByItem } from "@/lib/tags";
import { listSubStatuses } from "@/lib/sub-statuses";
import { subLabel } from "@/lib/statuses";
import { boardLocales } from "@/i18n/board";
import { Customers } from "@/components/ozvi/Customers";
import { itemDemand } from "@/lib/customers";
import { budgetLeft, myVoteWeights, voteModeOf } from "@/lib/votes";
import { ROUTE } from "@/lib/route";
import { isSystemItem } from "@/lib/provenance";
import { stopLabel } from "@/lib/route-text";
import { embeddingsConfig, findSimilar } from "@/lib/similar";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/Markdown";
import { projectOrigin } from "@/lib/email/url";
import { renderMarkdown } from "@/lib/markdown";
import { Gate, signInText } from "../../_gate";
import { TranslateBar, TranslatedBody, TranslatedTitle, TranslationScope } from "@/components/ozvi/Translate";
import { translationView } from "@/lib/translate-view";
import { titlePivot } from "@/lib/translate";

const { items, comments, users, attachments, itemLinks, itemEvents, changelogEntries, changelogItems } = schema;

/** The number only: the title would leak private bug reports to people who can't open them. */
export async function generateMetadata({ params }: { params: Promise<{ number: string }> }) {
  return { title: `#${(await params).number.replace(/\D/g, "")}` };
}

export default async function ItemPage({ params }: { params: Promise<{ project: string; number: string }> }) {
  const { project: slug, number } = await params;
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1) notFound();
  const { project, user, isTeam, plan, locale } = await getCtx(slug);
  const b = await getTranslations("board");
  const t = await getTranslations("board.item");
  const CONTEXT_LABEL: Record<string, string> = Object.fromEntries(
    (["url", "appVersion", "browser", "viewport", "language", "referrer", "console", "traits"] as const).map((k) => [k, t(`context.${k}`)]));
  const tag = LOCALE_TAG[locale];
  const origin = projectOrigin(project);

  const data = await withProject(db, project.id, async (tx) => {
    const [row] = await tx.select({ item: items, authorName: users.name, authorEmail: users.email, authorAvatar: users.avatarUrl, authorBlocked: users.blockedAt, authorRole: users.role }).from(items)
      .leftJoin(users, eq(users.id, items.authorId)).where(eq(items.number, n));
    if (!row) return null;
    const { item } = row;
    const isAuthor = !!user && item.authorId === user.id;
    // Moderation: deleted posts exist only for the team (with a way back) and, when the team rejected
    // them, as a note for their author; queued ideas only for their author and the team.
    if (item.deletedAt && !isTeam) {
      return isAuthor && item.deletedById !== item.authorId ? { rejected: true as const, title: item.title, reason: item.deleteReason } : null;
    }
    if (item.pending && !isTeam && !isAuthor) return null;
    const deletedBy = item.deletedAt && item.deletedById
      ? (await tx.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, item.deletedById)))[0] ?? null : null;
    // Exists, but not for this viewer: say so (and how to get in) instead of pretending it isn't there.
    if (item.kind === "bug" && !isTeam && !isAuthor) return "private" as const;
    if (item.kind === "idea" && !project.ideasPublic && !user) return "signin" as const;
    const thread = (await tx.select({ id: comments.id, body: comments.body, internal: comments.internal, pending: comments.pending, createdAt: comments.createdAt,
      editedAt: comments.editedAt, deletedAt: comments.deletedAt, authorId: comments.authorId,
      name: users.name, email: users.email, avatarUrl: users.avatarUrl, role: users.role, blockedAt: users.blockedAt })
      .from(comments).leftJoin(users, eq(users.id, comments.authorId))
      .where(and(eq(comments.itemId, item.id), ...(isTeam ? [] : [eq(comments.internal, false),
        // Comments held for approval: only their author (and the team) see them.
        user ? or(eq(comments.pending, false), eq(comments.authorId, user.id))! : eq(comments.pending, false)])))
      .orderBy(asc(comments.createdAt)))
      // A deleted comment keeps its place in the thread, never its text.
      .map((c) => (c.deletedAt ? { ...c, body: "" } : c));
    const weight = (await myVoteWeights(tx, user?.id, [item.id])).get(item.id) ?? 0;
    const voted = weight > 0;
    const [vc] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.votes).where(eq(schema.votes.itemId, item.id));
    const vote = { weight, voters: vc?.n ?? 0, left: item.kind === "idea" ? await budgetLeft(tx, project, user?.id) : null };
    const files = await tx.select({ id: attachments.id, name: attachments.name, mime: attachments.mime, bytes: attachments.bytes })
      .from(attachments).where(eq(attachments.itemId, item.id)).orderBy(asc(attachments.createdAt));
    // A deleted original is not linked any more (the duplicate stays closed).
    const mergedInto = item.mergedIntoId
      ? (await tx.query.items.findFirst({ where: and(eq(items.id, item.mergedIntoId), isNull(items.deletedAt)) })) ?? null : null;
    const history = await tx.select({ at: itemEvents.createdAt, to: itemEvents.toStatus, version: itemEvents.version, who: users.name, sub: itemEvents.subStatusId, proof: itemEvents.proof })
      .from(itemEvents).leftJoin(users, eq(users.id, itemEvents.actorId)).where(eq(itemEvents.itemId, item.id)).orderBy(asc(itemEvents.createdAt));
    const links = await tx.select().from(itemLinks).where(eq(itemLinks.itemId, item.id)).orderBy(asc(itemLinks.createdAt));
    const releases = await tx.select({ id: changelogEntries.id, title: changelogEntries.title, at: changelogEntries.publishedAt })
      .from(changelogItems).innerJoin(changelogEntries, eq(changelogEntries.id, changelogItems.entryId))
      .where(and(eq(changelogItems.itemId, item.id), isNotNull(changelogEntries.publishedAt)));
    // Tags: team-only ones only for the team (tagsByItem filters); sub-status names in the viewer's language.
    const itemTagList = (await tagsByItem(tx, [item.id], isTeam)).get(item.id) ?? [];
    const subs = await listSubStatuses(tx);
    const fallback = boardLocales(project).fallback;
    const subName = new Map(subs.map((s) => [s.id, subLabel(s, locale, fallback)]));
    const team = isTeam ? {
      allTags: await listTags(tx, true),
      subs: subs.filter((s) => s.kind === item.kind).map((s) => ({ id: s.id, stage: s.stage, label: subName.get(s.id)! })),
      github: !!(await getGithub(tx).catch(() => null)),
      // Linear/Jira: usable once a team/project is picked.
      linear: !!(await getLinear(tx).catch(() => null))?.config.teamId,
      jira: !!(await getJira(tx).catch(() => null))?.config.projectKey,
      proofs: await listProofs(tx, item.id),
      // Customer data from SSO traits: team only, never in the public part of the page.
      customers: await itemDemand(tx, item, 50),
      similar: item.mergedIntoId ? [] : await findSimilar(tx, { text: item.title, excludeId: item.id, limit: 4, minScore: 0.45, where: [eq(items.kind, item.kind)],
        pivot: await titlePivot(tx, item.id, item.title) }).catch(() => []),
    } : null;
    // Post translation: only what this viewer can read here (the thread above is already filtered).
    const translation = item.deletedAt ? null : await translationView(tx, { project, plan, locale, slug, origin }, [
      { subject: "item", id: item.id, title: item.title, body: item.body },
      ...thread.filter((c) => !c.deletedAt).map((c) => ({ subject: "comment" as const, id: c.id, title: null, body: c.body })),
    ]);
    return { item, authorName: row.authorName, authorEmail: row.authorEmail, authorAvatar: row.authorAvatar, authorBlocked: !!row.authorBlocked, authorRole: row.authorRole, deletedBy, isAuthor, thread, voted, vote, files, mergedInto, history, links, releases, team, itemTagList, subName, translation };
  });
  if (!data) notFound();
  if (data === "signin") {
    return <Gate project={project} locale={locale} returnTo={`/${slug}/i/${n}`} title={b("ideas.gateTitle")}
      text={await signInText(project, locale, t("gateText"))} />;
  }
  if (data === "private") {
    const login = user ? null : loginHref(project, `/${slug}/i/${n}`);
    return (
      <Page>
        <EmptyState level={1} className="mx-auto max-w-[640px]" title={t("privateTitle")}
          text={user ? t("privateSignedIn") : login ? t("privateSignIn") : t("privateViaApp", { app: project.name })}
          action={login ? <Button asChild size="lg"><a href={login}>{b("gate.signIn")}</a></Button>
            : user ? <Button asChild size="lg" variant="outline"><Link href={`/${slug}/bugs`}>{t("myBugs")}</Link></Button>
            : project.ideasPublic ? <Button asChild size="lg" variant="outline"><Link href={`/${slug}/ideas`}>{b("gate.backToIdeas")}</Link></Button> : undefined} />
      </Page>
    );
  }
  if ("rejected" in data) {
    const m = await getTranslations("moderation");
    return (
      <Page>
        <EmptyState level={1} className="mx-auto max-w-[640px]" title={m("rejectedTitle")}
          text={<>{m("rejectedText", { title: data.title ?? "" })}{data.reason && <span className="mt-3 block rounded-lg border bg-surface px-4 py-3 text-left text-foreground whitespace-pre-wrap"><span className="mb-1 block text-[13px] font-semibold text-muted-foreground">{m("rejectedReason")}</span>{data.reason}</span>}</>}
          action={<Button asChild size="lg" variant="outline"><Link href={`/${slug}/ideas`}>{b("gate.backToIdeas")}</Link></Button>} />
      </Page>
    );
  }
  const m = await getTranslations("moderation");
  const { authorBlocked, authorRole, deletedBy } = data;
  const { item, authorName, authorEmail, authorAvatar, isAuthor, thread, voted, vote, files, mergedInto, history, links, releases, team, itemTagList, subName, translation } = data;
  const bug = item.kind === "bug";
  // Ideas Ozvi filed from customer feedback have no person as author (the customers are voters, team-only).
  const system = isSystemItem(item);
  // Without a name: the team sees the e-mail (it has it anyway), the author sees "You", everyone else "User".
  const shown = (id: string | null, name: string | null, email: string | null) =>
    name ?? (isTeam && email ? email : id && id === user?.id ? b("you") : null);
  const byline = system ? b("fromCustomers") : shown(item.authorId, authorName, authorEmail);
  const ctx = (item.context ?? {}) as Record<string, string>;
  const ctxEntries = Object.entries(ctx).filter(([k]) => k in CONTEXT_LABEL && typeof ctx[k] === "string");
  // The widget's capture (steps, network log, session links): team only, never rendered for the reporter.
  const capture: Capture = (bug && contextFor(item.context as Record<string, unknown> | null, isTeam) as Capture | null) || {};
  const steps = isTeam && timeline(capture).length > 0;
  const deleted = !!item.deletedAt;
  const live = thread.filter((c) => !c.deletedAt);
  const teamReplied = live.some((c) => !c.internal && (c.role === "team" || c.role === "admin"));
  const canEdit = canEditPost(item, user, teamReplied);
  const blocked = isBlocked(user);
  const person = (id: string | null, name: string | null, role: string | null, isBlockedNow: boolean) =>
    isTeam && id && id !== user?.id && role === "member" ? { id, name: name ?? b("user"), blocked: isBlockedNow } : null;

  const events: JourneyEvent[] = [
    { type: "status", at: item.createdAt, status: ROUTE[item.kind][0]!, who: byline },
    ...history.map((h): JourneyEvent => ({ type: "status", at: h.at, status: h.to, version: h.version, who: h.who, sub: h.sub ? subName.get(h.sub) : null,
      proof: visibleProof(readProof(h.proof), item.kind, isTeam) })),
    // Imported or older items may lack history: the current stop still belongs on the route.
    ...(item.status !== ROUTE[item.kind][0] && history.at(-1)?.to !== item.status
      ? [{ type: "status", at: item.updatedAt, status: item.status, version: item.fixedInVersion } as JourneyEvent] : []),
    ...live.filter((c) => !c.internal && (c.role === "team" || c.role === "admin"))
      .map((c): JourneyEvent => ({ type: "reply", at: c.createdAt, who: c.name, commentId: c.id })),
    ...(isTeam ? links.map((l): JourneyEvent => ({ type: "link", at: l.createdAt, ref: l.ref, url: l.url, state: l.state })) : []),
    ...releases.map((r): JourneyEvent => ({ type: "release", at: r.at!, title: r.title, href: `/${slug}/changelog#e-${r.id}` })),
  ];

  return (
    <Page>
      <Link href={bug ? `/${slug}/bugs` : `/${slug}/ideas`} className="mb-5 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <span aria-hidden>←</span>{bug ? b("nav.bugs") : b("nav.ideas")}
      </Link>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <article className="min-w-0">
          <TranslationScope slug={slug} view={translation}>
          <ItemEditScope>
          <header className="flex gap-5">
            {!bug && !item.pending && !deleted && (
              <VoteButton slug={slug} itemId={item.id} count={item.voteCount} voted={voted} size="lg"
                voters={vote.voters} weight={vote.weight} mode={voteModeOf(project)} left={vote.left}
                login={user ? null : (loginHref(project, `/${slug}/i/${n}`) ?? false)} />
            )}
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                <span className="font-semibold text-foreground">{bug ? t("bug") : t("idea")} <span data-num>#{item.number}</span></span>
                <StatusTag kind={item.kind} status={item.status} version={item.fixedInVersion} sub={item.subStatusId ? subName.get(item.subStatusId) : null} />
                {bug && <span className="inline-flex items-center gap-1"><Lock className="size-3.5" />{t("privateTag")}</span>}
                {!deleted && (
                  <span className="-my-1.5 ml-auto">
                    <ItemMenu slug={slug} itemId={item.id} kind={item.kind} canEdit={canEdit} team={isTeam}
                      author={person(item.authorId, authorName, authorRole, authorBlocked)} listHref={`/${slug}/${bug ? "bugs" : "ideas"}`} />
                  </span>
                )}
              </div>
              <WhenViewing>
                <h1 className="font-heading text-[26px] leading-tight font-bold tracking-tight md:text-[30px]"><TranslatedTitle id={item.id}>{item.title}</TranslatedTitle></h1>
              </WhenViewing>
              <div className="mt-3 flex items-center gap-2 text-[13.5px] text-muted-foreground">
                {system
                  ? <span className="inline-grid size-6 shrink-0 place-items-center rounded-full border bg-muted text-muted-foreground" aria-hidden><MessagesSquare className="size-3.5" /></span>
                  : <Avatar name={authorName ?? authorEmail} url={authorAvatar} size={24} />}
                <span className="font-medium text-foreground">{byline ?? b("user")}</span>
                <time dateTime={item.createdAt.toISOString()} title={item.createdAt.toLocaleString(tag)}>{ago(item.createdAt, locale)}</time>
                {item.editedAt && <Edited at={item.editedAt} label={m("edited")} tag={tag} />}
                {isTeam && authorBlocked && <BlockedTag label={m("blockedBadge")} />}
              </div>
              {itemTagList.length > 0 && (
                <TagList className="mt-3" tags={itemTagList} hrefFor={(x) => `/${slug}/${bug ? "bugs?s=all&" : "ideas?f=all&"}tag=${encodeURIComponent(x.name)}`} />
              )}
            </div>
          </header>

          <div className="mt-8 grid gap-6">
            {deleted && (
              <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-[14.5px]">
                <p className="flex min-w-0 items-start gap-2">
                  <Trash2 className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                  <span>
                    <span className="font-semibold">{item.pending ? m("rejectedTeamTitle") : m("deletedTeamTitle")}</span>{" "}
                    <span className="text-muted-foreground">{m("deletedMeta", { who: deletedBy?.name ?? deletedBy?.email ?? b("user"), when: ago(item.deletedAt!, locale) })}</span>
                    {item.deleteReason && <span className="mt-1 block text-muted-foreground whitespace-pre-wrap">{m("reasonForAuthor", { reason: item.deleteReason })}</span>}
                  </span>
                </p>
                <RestoreButton slug={slug} itemId={item.id} />
              </div>
            )}
            {item.pending && !deleted && (
              <div role="status" className="grid gap-3 rounded-lg border border-st-ack/40 bg-st-ack/8 px-4 py-3 text-[14.5px]">
                <p className="flex items-start gap-2">
                  <Hourglass className="mt-0.5 size-4 shrink-0 text-st-ack" aria-hidden />
                  <span>
                    <span className="font-semibold">{m("pendingTitle")}</span>{" "}
                    <span className="text-muted-foreground">
                      {isTeam ? (item.pendingReason === "links" ? m("pendingTeamLinks") : m("pendingTeam")) : (item.pendingReason === "links" ? m("pendingAuthorLinks") : m("pendingAuthor"))}
                    </span>
                  </span>
                </p>
                {isTeam && <QueueActions slug={slug} itemId={item.id} />}
              </div>
            )}
            {mergedInto && (
              <p role="note" className="rounded-lg border bg-muted px-4 py-3 text-[14.5px]">
                {bug && !isTeam && mergedInto.authorId !== user?.id
                  ? t("mergedPrivate")
                  : <>{t("mergedInto")} <Link className="oz-link" href={`/${slug}/i/${mergedInto.number}`}>#{mergedInto.number} {mergedInto.title}</Link>{bug ? "" : t("votesMoved")}.</>}
              </p>
            )}
            {isAuthor && bug && item.status === "fixed" && <ConfirmFix slug={slug} itemId={item.id} version={item.fixedInVersion} />}
            {canEdit && <ItemEditForm slug={slug} itemId={item.id} title={item.title} body={item.body} />}
            <WhenViewing>
              <TranslateBar id={item.id} className="-mb-2" />
              {item.body ? <TranslatedBody id={item.id} className="text-[16px]"><Markdown source={item.body} slug={slug} origin={origin} className="text-[16px]" /></TranslatedBody> : <p className="text-muted-foreground">{t("noBody")}</p>}
            </WhenViewing>
            {isTeam && <CaptureLinks links={capture.links} />}
            {(files.length > 0 || steps) && (
              <div className={cn(steps && files.length > 0 && "grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]")}>
                {files.length > 0 && <Gallery slug={slug} files={files} narrow={steps} />}
                {steps && <CaptureTimeline capture={capture} locale={locale} />}
              </div>
            )}
            {isTeam && !!capture.network?.length && <NetworkLog entries={capture.network} teamOnly={<TeamOnly />} />}
            {bug && ctxEntries.length > 0 && (
              <details className="group rounded-xl border bg-surface" open={isTeam}>
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[14px] font-semibold">
                  {t("technical")} <span className="text-xs font-medium text-muted-foreground group-open:hidden">{t("show")}</span>
                </summary>
                <dl className="grid gap-x-6 gap-y-2.5 border-t px-4 py-4 text-[13.5px] sm:grid-cols-[150px_1fr]">
                  {ctxEntries.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground">{CONTEXT_LABEL[k]}</dt>
                      <dd className="min-w-0 overflow-wrap-anywhere">
                        {k === "console" ? <pre tabIndex={0} className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">{v}</pre>
                          : k === "browser" ? <span title={v}>{browserLabel(v)}</span>
                          : k === "url" || k === "referrer" ? <span className="break-all">{v}</span> : v}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            {/* Phones: the route after the report itself, with its heading (wide screens show it in the aside). */}
            <section aria-labelledby="route-h-m" className="rounded-xl border bg-surface p-5 lg:hidden">
              <h2 id="route-h-m" className="mb-4 font-heading text-[15px] font-bold">{b("route")}</h2>
              <Journey kind={item.kind} status={item.status} events={events} locale={locale} />
            </section>
          </div>
          </ItemEditScope>

          <section aria-labelledby="thread-h" className="mt-12">
            <h2 id="thread-h" className="mb-5 flex items-baseline gap-2 font-heading text-lg font-bold">
              {t("comments")}{live.length > 0 && <span className="text-sm font-semibold text-muted-foreground" data-num>{live.length}</span>}
            </h2>
            {thread.length === 0 && <p className="mb-5 text-[14.5px] text-muted-foreground">{t("noComments")}{user ? t("addComment") : ""}</p>}
            <ol className="mb-6 grid gap-5">
              {thread.map((c) => {
                const teamMember = c.role === "team" || c.role === "admin";
                if (c.deletedAt) {
                  return (
                    <li key={c.id} id={`c-${c.id}`} className="grid scroll-mt-24 grid-cols-[32px_1fr] gap-3">
                      <span aria-hidden className="mx-auto mt-2.5 size-2 rounded-full border border-dashed border-line-strong" />
                      <p className="rounded-xl border border-dashed px-4 py-2.5 text-[13.5px] text-muted-foreground">
                        {m("commentDeleted")} <time dateTime={c.createdAt.toISOString()} title={c.createdAt.toLocaleString(tag)}>· {ago(c.createdAt, locale)}</time>
                      </p>
                    </li>
                  );
                }
                return (
                  <li key={c.id} id={`c-${c.id}`} className="grid scroll-mt-24 grid-cols-[32px_1fr] gap-3">
                    {/* Same initial and hue as the header avatar (name, else e-mail); the e-mail itself is never shown. */}
                    <Avatar name={c.name ?? c.email} url={c.avatarUrl} size={32} />
                    <div className={cn("min-w-0 rounded-xl border bg-surface px-4 py-3", (c.internal || c.pending) && "border-dashed bg-st-ack/6", teamMember && !c.internal && "border-brand-line")}>
                      <CommentContent slug={slug} id={c.id} body={c.body} html={renderMarkdown(c.body, { slug, origin })} team={isTeam}
                        pending={c.pending ? (isTeam ? "team" : "author") : null}
                        canEdit={!deleted && canEditComment(c, user)} canDelete={!deleted && canDeleteComment(c, user)}
                        author={person(c.authorId, c.name, c.role, !!c.blockedAt)}
                        header={
                      <header className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                        <strong className="font-semibold">{shown(c.authorId, c.name, c.email) ?? (teamMember ? b("teamMember") : b("user"))}</strong>
                        {teamMember && c.name && <span className="rounded-sm bg-brand-soft px-1.5 py-px text-[11.5px] font-semibold text-brand-text">{t("teamBadge")}</span>}
                        {c.internal && <span className="inline-flex items-center gap-1 rounded-sm bg-st-ack/12 px-1.5 py-px text-[11.5px] font-semibold text-st-ack"><Lock className="size-3" />{t("internal")}</span>}
                        {c.pending && <span className="inline-flex items-center gap-1 rounded-sm bg-st-ack/12 px-1.5 py-px text-[11.5px] font-semibold text-st-ack"><Hourglass className="size-3" aria-hidden />{b("pendingBadge")}</span>}
                        <time className="text-muted-foreground" dateTime={c.createdAt.toISOString()} title={c.createdAt.toLocaleString(tag)}>{ago(c.createdAt, locale)}</time>
                        {c.editedAt && <Edited at={c.editedAt} label={m("edited")} tag={tag} />}
                        {isTeam && c.blockedAt && !teamMember && <BlockedTag label={m("blockedBadge")} />}
                      </header>} />
                    </div>
                  </li>
                );
              })}
            </ol>
            {deleted ? null
              : blocked ? <p role="note" className="flex items-start gap-2 rounded-xl border border-dashed bg-surface/60 px-4 py-3.5 text-[14.5px] text-muted-foreground"><Ban className="mt-0.5 size-4 shrink-0" aria-hidden />{m("blockedNotice")}</p>
              : user ? <CommentForm slug={slug} itemId={item.id} isTeam={isTeam} me={user.name ?? user.email} />
              : <SignInToComment project={project} locale={locale} returnTo={`/${slug}/i/${n}`} />}
          </section>
          </TranslationScope>
        </article>

        <aside className="grid content-start gap-6">
          <section aria-labelledby="route-h" className="hidden rounded-xl border bg-surface p-5 lg:block">
            <h2 id="route-h" className="mb-4 font-heading text-[15px] font-bold">{b("route")}</h2>
            <Journey kind={item.kind} status={item.status} events={events} locale={locale} />
          </section>

          {isTeam && team && (team.customers.demand.people > 0) && (
            <Customers kind={item.kind} people={team.customers.people} demand={team.customers.demand} locale={locale}
              votes={item.kind === "idea" ? { points: item.voteCount, voters: vote.voters, importance: voteModeOf(project) === "importance" } : null} />
          )}

          {isTeam && team && !deleted && (
            <section aria-labelledby="team-h" className="grid gap-5 rounded-xl border border-dashed bg-surface p-5">
              <h2 id="team-h" className="font-heading text-[15px] font-bold">{t("forTeam")}</h2>
              <TeamBlock title={t("status")}>
                <RouteControl key={`${item.status}-${item.subStatusId ?? ""}-${item.fixedInVersion ?? ""}`} slug={slug} itemId={item.id} kind={item.kind}
                  status={item.status} version={item.fixedInVersion} statuses={ITEM_STATUSES[item.kind]} subs={team.subs} sub={item.subStatusId} />
              </TeamBlock>
              <TeamBlock title={t("tags")}>
                {itemTagList.length > 0 && <TagList tags={itemTagList} />}
                <TagPicker key={itemTagList.map((x) => x.id).join()} slug={slug} itemId={item.id} all={team.allTags} selected={itemTagList.map((x) => x.id)} admin={user?.role === "admin"} />
              </TeamBlock>
              {(team.github || links.some((l) => l.provider === "github")) && (
                <TeamBlock title="GitHub">
                  <GithubBox slug={slug} itemId={item.id} enabled={team.github}
                    links={links.filter((l) => l.provider === "github").map((l) => ({ id: l.id, ref: l.ref, url: l.url, title: l.title, state: l.state }))} />
                </TeamBlock>
              )}
              {(["linear", "jira"] as const).map((p) => (team[p] || links.some((l) => l.provider === p)) && (
                <TeamBlock key={p} title={p === "linear" ? "Linear" : "Jira"}>
                  <TrackerBox slug={slug} itemId={item.id} provider={p} enabled={team[p]}
                    links={links.filter((l) => l.provider === p).map((l) => ({ id: l.id, ref: l.ref, url: l.url, title: l.title, state: l.state,
                      stateName: typeof (l.sync as { stateName?: unknown })?.stateName === "string" ? (l.sync as { stateName: string }).stateName : null }))} />
                </TeamBlock>
              ))}
              <TeamBlock title={t("proof")}>
                <ProofBox slug={slug} itemId={item.id} kind={item.kind}
                  proofs={team.proofs.map((x) => ({ id: x.id, kind: x.kind as "pr" | "preview", url: x.url, title: x.title, ref: x.ref }))} />
              </TeamBlock>
              {!bug && (
                <TeamBlock title={t("voters")}>
                  <p className="text-[13px] text-muted-foreground">{t("votersHint", { n: vote.voters })}</p>
                  {vote.voters > 0 && <VotersExport slug={slug} number={item.number} />}
                </TeamBlock>
              )}
              {!bug && ["in_progress", "shipped"].includes(item.status) && (
                <TeamBlock title={t("news")}>
                  <p className="text-[13px] text-muted-foreground">{t("newsHint", { n: item.voteCount })}</p>
                  <Button asChild variant="outline" size="sm"><Link href={`/${slug}/changelog/new?item=${item.number}`}>{b("changelog.write")}</Link></Button>
                </TeamBlock>
              )}
              {!item.mergedIntoId && !item.pending && (
                <TeamBlock title={t("duplicates")}>
                  {embeddingsConfig() && team.similar.length > 0 && (
                    <p className="-mt-1 text-[12.5px] text-muted-foreground" data-ai-generated="true">{t("similarAi")}</p>
                  )}
                  {team.similar.length > 0 ? (
                    <ul className="grid gap-1.5">
                      {team.similar.map((s) => (
                        <li key={s.id} className="text-[13.5px]">
                          <Link href={`/${slug}/i/${s.number}`} className="font-medium hover:underline">#{s.number} {s.title}</Link>
                          <span className="text-muted-foreground"> · {stopLabel(locale, s.status, project)}{s.kind === "idea" ? ` · ${t("votesShort", { n: s.votes })}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-[13px] text-muted-foreground">{t("noSimilar")}</p>}
                  <MergeBox slug={slug} itemId={item.id} suggestion={team.similar[0]?.number} kind={item.kind} />
                </TeamBlock>
              )}
              {aiAvailable(plan) && live.length >= 3 && (
                <TeamBlock title={t("summary")}><AiSummaryBox slug={slug} itemId={item.id} /></TeamBlock>
              )}
            </section>
          )}
        </aside>
      </div>
    </Page>
  );
}

/** "edited" after a timestamp; the exact time on hover. */
function Edited({ at, label, tag }: { at: Date; label: string; tag: string }) {
  return <time className="text-muted-foreground" dateTime={at.toISOString()} title={at.toLocaleString(tag)}>· {label}</time>;
}

function BlockedTag({ label }: { label: string }) {
  return <span className="inline-flex items-center gap-1 rounded-sm bg-destructive/10 px-1.5 py-px text-[11.5px] font-semibold text-destructive"><Ban className="size-3" aria-hidden />{label}</span>;
}

function TeamBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2.5 border-t pt-4 first-of-type:border-t-0 first-of-type:pt-0">
      <h3 className="text-[13px] font-semibold text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

async function SignInToComment({ project, locale, returnTo }: { project: Parameters<typeof loginHref>[0]; locale: Locale; returnTo: string }) {
  const login = loginHref(project, returnTo);
  const b = await getTranslations({ locale, namespace: "board" });
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl border border-dashed bg-surface/60 px-4 py-3.5">
      <p className="text-[14.5px] text-muted-foreground">
        {login ? b("item.commentSignIn") : b("item.commentViaApp", { app: project.name })}
      </p>
      {login && <Button asChild variant="outline" size="sm"><a href={login}>{b("gate.signIn")}</a></Button>}
    </div>
  );
}
