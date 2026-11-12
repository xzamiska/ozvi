/**
 * What cloud plans limit — only things that cost us money or are hosting convenience (ADR-0001,
 * ADR-0006): e-mails, storage, number of hosted projects, custom domains (TLS), the "Ozvi"
 * badge and AI calls we pay for (translationsPerMonth: new AI translations per workspace and calendar
 * month, cached ones are free; ai: duplicates, summaries, drafts). Self-host is unlimited. Users and records are never limited;
 * MCP, GitHub, webhooks, SSO/OIDC are in every plan.
 */
const INF = Number.POSITIVE_INFINITY;

export const PLAN_LIMITS = {
  self: { emailsPerMonth: INF, attachmentBytes: INF, projects: INF, customDomain: true, badge: false, ai: true, translationsPerMonth: INF },
  free: { emailsPerMonth: 200, attachmentBytes: 250 * 1024 ** 2, projects: 1, customDomain: false, badge: true, ai: false, translationsPerMonth: 0 },
  pro: { emailsPerMonth: 1_500, attachmentBytes: 2 * 1024 ** 3, projects: 3, customDomain: true, badge: false, ai: false, translationsPerMonth: 500 },
  studio: { emailsPerMonth: 5_000, attachmentBytes: 10 * 1024 ** 3, projects: INF, customDomain: true, badge: false, ai: true, translationsPerMonth: 2_000 },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;

/** A storage limit as people read it: "250 MB", "2 GB" (whole units; limits are round numbers). */
export const limitSize = (bytes: number) => bytes < 1024 ** 3 ? `${Math.round(bytes / 1024 ** 2)} MB` : `${Math.round((bytes / 1024 ** 3) * 10) / 10} GB`;

/** Paid plans and their prices in euro cents (ADR-0006: quarterly or yearly only, never monthly). */
export const PRICES = {
  pro: { year: 1900, quarter: 600 },
  studio: { year: 4900, quarter: 1500 },
} as const;
export type PaidPlan = keyof typeof PRICES;
export type Interval = keyof (typeof PRICES)["pro"];
