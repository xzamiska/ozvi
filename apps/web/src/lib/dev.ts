/** Dev-only shortcuts (`pnpm dev`): need OZVI_DEV_LOGIN=1, never in production builds or cloud mode. */
export const devEnabled = () =>
  process.env.OZVI_DEV_LOGIN === "1" && process.env.OZVI_MODE !== "cloud" && process.env.NODE_ENV !== "production";

export const DEV_USERS = {
  member: { id: "dev-member", name: "Jana Nováková", email: "jana@example.test" },
  team: { id: "dev-team", name: "Peter (tím)", email: "peter@example.test", role: "admin" as const },
};
