import type { CompareId } from "@/lib/compare";
import type { PageContent } from "../types";
import { canny } from "./canny";
import { featurebase } from "./featurebase";
import { fider } from "./fider";
import { sentry } from "./sentry";

export const CONTENT: Record<CompareId, PageContent> = { canny, featurebase, sentry, fider };
