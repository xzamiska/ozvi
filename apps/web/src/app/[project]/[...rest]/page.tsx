import { notFound } from "next/navigation";

/** Any unknown path under a board renders the board's own not-found (inside its header), not the global one. */
export default function Unknown() {
  notFound();
}
