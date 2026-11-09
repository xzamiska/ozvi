/**
 * Operator details for the cloud's legal pages (/terms, /privacy). Fill in before launch;
 * the texts are drafts until a lawyer has reviewed them.
 */
export const LEGAL = {
  draft: true,
  operator: "[obchodné meno prevádzkovateľa]",
  companyId: "[IČO]",
  address: "[sídlo]",
  email: "podpora@ozvi.io",
  effective: "[dátum účinnosti]",
  version: "návrh 2026-11-07",
} as const;

export const cloudOnly = () => process.env.OZVI_MODE === "cloud";
