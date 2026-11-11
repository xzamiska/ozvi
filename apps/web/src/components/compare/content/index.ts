import type { CompareId } from "@/lib/compare";
import type { PageContent } from "../types";
import { canny } from "./canny";
import { featurebase } from "./featurebase";
import { fider } from "./fider";

export const CONTENT: Record<CompareId, PageContent> = { canny, featurebase, fider };
