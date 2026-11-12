/**
 * Operator details for the cloud's legal pages (/terms, /privacy, /dpa, /subprocessors). Bump `version`
 * and `effective` with every material change (customers get 30 days' notice by e-mail).
 */
export const LEGAL = {
  draft: false,
  operator: "Zamiska solutions s.r.o.",
  companyId: "54580242",
  taxId: "2121731106",
  vatId: "SK2121731106",
  address: "Bajkalská 45G, 821 05 Bratislava-Ružinov",
  register: "zapísaná v obchodnom registri Mestského súdu Bratislava III, oddiel Sro, vložka č. 160737/B",
  email: "support@ozvi.io",
  effective: "12. 11. 2026",
  version: "1.0",
} as const;

export const cloudOnly = () => process.env.OZVI_MODE === "cloud";
