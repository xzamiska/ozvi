import { createDb, type Db } from "@ozvi/db";

const g = globalThis as unknown as { ozviDb?: Db };

/** Created on first use, not at import — `next build` must work without DATABASE_URL. */
export const db = new Proxy({} as Db, {
  get(_, prop) {
    const real = (g.ozviDb ??= createDb());
    const v = Reflect.get(real, prop, real);
    return typeof v === "function" ? v.bind(real) : v;
  },
});
