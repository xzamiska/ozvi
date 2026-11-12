import type { ComponentType } from "react";
import ScreenshotPrivacy from "./hide-private-data-in-bug-report-screenshots";
import SignIn from "./sign-in-users-to-an-embedded-widget";

/** Article bodies by slug (metadata in lib/blog.ts). */
export const BLOG_BODIES: Record<string, ComponentType> = {
  "hide-private-data-in-bug-report-screenshots": ScreenshotPrivacy,
  "sign-in-users-to-an-embedded-widget": SignIn,
};
