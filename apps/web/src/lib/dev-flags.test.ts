import { describe, expect, it } from "vitest";
import { devSimulation, isLocalDevHost } from "./dev-flags";

describe("devSimulation", () => {
  it("is off without the flag", () => {
    expect(devSimulation(undefined, { NODE_ENV: "development" })).toBe(false);
    expect(devSimulation("0", { NODE_ENV: "development" })).toBe(false);
  });
  it("follows the flag in development", () => {
    expect(devSimulation("1", { NODE_ENV: "development", PUBLIC_URL: "https://ozvi.io" })).toBe(true);
  });
  it("in production only on a local dev host", () => {
    expect(devSimulation("1", { NODE_ENV: "production", PUBLIC_URL: "http://e2e.localhost:3410" })).toBe(true);
    expect(devSimulation("1", { NODE_ENV: "production", PUBLIC_URL: "http://localhost:3300" })).toBe(true);
    expect(devSimulation("1", { NODE_ENV: "production", PUBLIC_URL: "http://127.0.0.1:3000" })).toBe(true);
    expect(devSimulation("1", { NODE_ENV: "production", PUBLIC_URL: "https://ozvi.io" })).toBe(false);
    expect(devSimulation("1", { NODE_ENV: "production", PUBLIC_URL: "https://localhost.ozvi.io" })).toBe(false);
    expect(devSimulation("1", { NODE_ENV: "production", PUBLIC_URL: "https://ozvi.io/x.localhost" })).toBe(false);
    expect(devSimulation("1", { NODE_ENV: "production", PUBLIC_URL: "https://user@ozvi.io" })).toBe(false);
    expect(devSimulation("1", { NODE_ENV: "production" })).toBe(false);
    expect(devSimulation("1", { NODE_ENV: "production", PUBLIC_URL: "not a url" })).toBe(false);
  });
  it("recognises local hosts only", () => {
    expect(isLocalDevHost("http://a.b.localhost")).toBe(true);
    expect(isLocalDevHost("http://notlocalhost")).toBe(false);
    expect(isLocalDevHost("http://localhost.evil.com")).toBe(false);
    expect(isLocalDevHost("http://127.0.0.2")).toBe(false);
  });
});
