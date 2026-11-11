import { notFound } from "next/navigation";
import { sectionOn, type HasSections, type Section } from "./sections";

/** A switched-off section is not there at all (404), for everyone, team included. */
export function needSection(project: HasSections, s: Section) {
  if (!sectionOn(project, s)) notFound();
}
