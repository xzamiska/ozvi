/** Must match scripts/e2e-server.sh: the tests write to the same database and sign with the same keys. */
export const E2E = {
  databaseUrl: "postgres://ozvi:ozvi@localhost:5446/ozvi_e2e",
  secretKey: "e2e-only-secret-key-0123456789abcdef0123",
  mailpit: "http://localhost:8046",
  base: "http://e2e.localhost:3410",
};
process.env.OZVI_SECRET_KEY ??= E2E.secretKey;

/** Unique per run, so specs never collide with each other or with earlier runs in the shared Mailpit. */
const run = Date.now().toString(36);
let n = 0;
export const uniq = (prefix: string) => `${prefix}-${run}-${++n}`;
export const email = (who: string) => `${uniq(who)}@e2e.test`.toLowerCase();
