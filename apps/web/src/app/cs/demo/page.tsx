import { notFound } from "next/navigation";
import { demoMetadata } from "../../demo/meta";
import { PublicDemo } from "../../demo/PublicDemo";

export const dynamic = "force-dynamic";
export const generateMetadata = () => demoMetadata("cs");

/** ozvi.io/cs/demo: the public demo in this language (the dev host app stays at /demo). */
export default function Page() {
  return process.env.OZVI_MODE === "cloud" ? <PublicDemo locale="cs" /> : notFound();
}
