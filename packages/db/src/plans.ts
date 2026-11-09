/**
 * What cloud plans limit — only things that cost us money or are hosting convenience (ADR-0001,
 * ADR-0006): e-mails, storage, number of hosted projects, custom domains (TLS), the "Ozvi"
 * badge and AI calls we pay for. Self-host is unlimited. Users and records are never limited;
 * MCP, GitHub, webhooks, SSO/OIDC are in every plan.
 */
const INF = Number.POSITIVE_INFINITY;

export const PLAN_LIMITS = {
  self: { emailsPerMonth: INF, attachmentBytes: INF, projects: INF, customDomain: true, badge: false, ai: true },
  free: { emailsPerMonth: 1_000, attachmentBytes: 1 * 1024 ** 3, projects: 1, customDomain: false, badge: true, ai: false },
  pro: { emailsPerMonth: 10_000, attachmentBytes: 10 * 1024 ** 3, projects: 3, customDomain: true, badge: false, ai: false },
  studio: { emailsPerMonth: 50_000, attachmentBytes: 50 * 1024 ** 3, projects: INF, customDomain: true, badge: false, ai: true },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;

/** Paid plans and their prices in euro cents (ADR-0006: quarterly or yearly only, never monthly). */
export const PRICES = {
  pro: { year: 1900, quarter: 600 },
  studio: { year: 4900, quarter: 1500 },
} as const;
export type PaidPlan = keyof typeof PRICES;
export type Interval = keyof (typeof PRICES)["pro"];
