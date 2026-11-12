import { describe, expect, it } from "vitest";
import { MASK, maskBody, maskText, maskUrl, SECRET_NAME, sensitiveRanges } from "./mask";

describe("maskUrl", () => {
  it.each([
    ["https://api.x.sk/v1/inv?token=abc123&page=2", "https://api.x.sk/v1/inv?token=***&page=2"],
    ["https://api.x.sk/a?access_token=abc", "https://api.x.sk/a?access_token=***"],
    ["https://api.x.sk/a?api_key=abc&apiKey=def&KEY=g", "https://api.x.sk/a?api_key=***&apiKey=***&KEY=***"],
    ["https://api.x.sk/a?password=hunter2&user=jan", "https://api.x.sk/a?password=***&user=jan"],
    ["https://api.x.sk/a?sessionId=s1&auth=x&client_secret=y", "https://api.x.sk/a?sessionId=***&auth=***&client_secret=***"],
    ["https://api.x.sk/pay?card_number=4111111111111111&iban=SK3112000000198742637541", "https://api.x.sk/pay?card_number=***&iban=***"],
    ["https://api.x.sk/a?Authorization=Bearer%20x", "https://api.x.sk/a?Authorization=***"],
    ["/api/items?sort=new&q=faktura", "/api/items?sort=new&q=faktura"],
    ["https://x.sk/cb#access_token=abc&state=1", "https://x.sk/cb#access_token=***&state=1"],
    ["https://x.sk/#/reset?token=abc", "https://x.sk/#/reset?token=***"],
    ["https://x.sk/page#section-2", "https://x.sk/page#section-2"],
    ["https://jan:heslo@x.sk/a", "https://x.sk/a"],
  ])("%s", (input, out) => expect(maskUrl(input)).toBe(out));

  it("masks e-mails and JWTs in the path and in values", () => {
    expect(maskUrl("https://x.sk/users/jan.novak@firma.sk/edit")).toBe(`https://x.sk/users/${MASK}/edit`);
    expect(maskUrl("https://x.sk/users/jan%40firma.sk")).toBe(`https://x.sk/users/${MASK}`);
    expect(maskUrl("https://x.sk/a?email=jan%40firma.sk")).toBe("https://x.sk/a?email=***");
    expect(maskUrl("https://x.sk/r/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl")).toBe(`https://x.sk/r/${MASK}`);
  });

  it("keeps UUIDs, numbers and dates (useful for debugging)", () => {
    const u = "https://x.sk/inv/7b0c8a52-2b0f-4a8a-9b1f-0f6e8c1d2e3f?from=2026-01-01&ts=1767225600000";
    expect(maskUrl(u)).toBe(u);
  });

  it("is idempotent", () => {
    const once = maskUrl("https://x.sk/a?token=1&mail=a%40b.sk");
    expect(maskUrl(once)).toBe(once);
  });
});

describe("maskText", () => {
  it("masks bearer and basic credentials", () => {
    expect(maskText("Authorization: Bearer abc.def-ghi_123")).toBe(`Authorization: Bearer ${MASK}`);
    expect(maskText("Basic dXNlcjpwYXNzd29yZA==")).toBe(`Basic ${MASK}`);
  });
  it("masks card numbers only when they pass Luhn", () => {
    expect(maskText("card 4111 1111 1111 1111 ok")).toBe(`card ${MASK} ok`);
    expect(maskText("id 1234567890123")).toBe("id 1234567890123");
    expect(maskText("ts 1767225600000")).toBe("ts 1767225600000");
  });
  it("masks IBANs and e-mails", () => {
    expect(maskText("IBAN SK31 1200 0000 1987 4263 7541.")).toBe(`IBAN ${MASK}.`);
    expect(maskText("contact jan+test@firma.co.uk now")).toBe(`contact ${MASK} now`);
  });
  it("leaves ordinary text alone", () => {
    expect(maskText("Faktúra 2026-0501 sa neuložila (HTTP 500)")).toBe("Faktúra 2026-0501 sa neuložila (HTTP 500)");
  });
});

describe("maskBody", () => {
  it("masks secret-named JSON keys at any depth", () => {
    const out = JSON.parse(maskBody(JSON.stringify({
      user: { email: "a@b.sk", password: "x", profile: { apiKey: "k", name: "Jan" } },
      items: [{ cardNumber: "4111111111111111", amount: 10 }],
      refresh_token: "r", sessionToken: null, note: "Bearer abcdefghijk",
    })));
    expect(out).toEqual({
      user: { email: MASK, password: MASK, profile: { apiKey: MASK, name: "Jan" } },
      items: [{ cardNumber: MASK, amount: 10 }],
      refresh_token: MASK, sessionToken: null, note: `Bearer ${MASK}`,
    });
  });
  it("masks URL-encoded form fields", () => {
    expect(maskBody("user=jan&password=hunter2&csrf_token=t")).toBe("user=jan&password=***&csrf_token=***");
  });
  it("masks free text and cuts to the limit", () => {
    expect(maskBody("error for jan@firma.sk")).toBe(`error for ${MASK}`);
    expect(maskBody("x".repeat(50), 10)).toBe(`${"x".repeat(10)}…`);
  });
  it("survives broken JSON", () => {
    expect(maskBody('{"token": "abc", broken')).toContain("broken");
  });
});

describe("SECRET_NAME", () => {
  it.each(["token", "X-Auth", "client_secret", "passwd", "pwd", "api-key", "session", "cardNo", "iban", "cvv", "otp", "csrftoken", "jwt", "cookie"])("%s is secret", (k) =>
    expect(SECRET_NAME.test(k)).toBe(true));
  it.each(["page", "sort", "q", "amount", "invoiceId", "lang"])("%s is not", (k) => expect(SECRET_NAME.test(k)).toBe(false));
});

describe("sensitiveRanges (screenshots)", () => {
  const covered = (s: string) => sensitiveRanges(s).map(([a, b]) => s.slice(a, b));
  it("finds e-mails, phones, IBANs, cards and tokens", () => {
    expect(covered("Write to jana.k@firma.sk or call +421 905 123 456")).toEqual(["jana.k@firma.sk", "+421 905 123 456"]);
    expect(covered("Phone 0905 123 456, UK +44 7700 900418, US (415) 555-0132")).toEqual(["0905 123 456", "+44 7700 900418", "(415) 555-0132"]);
    expect(covered("IBAN SK31 1200 0000 1987 4263 7541")).toEqual(["SK31 1200 0000 1987 4263 7541"]);
    expect(covered("card 4111 1111 1111 1111 ok")).toEqual(["4111 1111 1111 1111"]);
    expect(covered("Bearer abcdefghijkl123 and eyJhbGciOiJI.eyJzdWIiOiIx.c2ln")).toHaveLength(2);
  });
  it("leaves dates, times, prices and short numbers alone", () => {
    for (const s of ["12. 11. 2026", "10. – 14. 11. 2026", "6:00 – 7:00 pm", "1 284 €", "£1,284", "Order 4711", "v3.9.2", "81 %"]) {
      expect(sensitiveRanges(s), s).toEqual([]);
    }
  });
  it("merges overlapping finds", () => {
    expect(sensitiveRanges("x a@b.co y")).toEqual([[2, 8]]);
  });
});
