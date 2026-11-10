/**
 * Operator details for the cloud's legal pages (/terms, /privacy). Fill in before launch;
 * the texts are drafts until a lawyer has reviewed them.
 */
export const LEGAL = {
  draft: true,
  operator: "Zamiska solutions s.r.o.",
  companyId: "54580242",
  taxId: "2121731106",
  vatId: "SK2121731106",
  address: "Bajkalská 45G, 821 05 Bratislava-Ružinov",
  register: "zapísaná v obchodnom registri Mestského súdu Bratislava III, oddiel Sro, vložka č. 160737/B",
  email: "support@ozvi.io",
  effective: "[dátum účinnosti]",
  version: "návrh 2026-11-07",
} as const;

export const cloudOnly = () => process.env.OZVI_MODE === "cloud";
