import { ComparePage, compareMetadata } from "@/components/compare/ComparePage";

// OZVI_MODE is read at request time (the same image runs self-host and cloud).
export const dynamic = "force-dynamic";
export const generateMetadata = () => compareMetadata("fider", "en");

export default function Page() {
  return <ComparePage id="fider" locale="en" />;
}
