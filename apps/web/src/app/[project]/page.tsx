import { schema } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { homeSection } from "@/lib/sections";

/** The board opens on its home section (settings → Board sections). */
export default async function ProjectHome({ params }: { params: Promise<{ project: string }> }) {
  const slug = (await params).project;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  if (!project) notFound();
  redirect(`/${slug}/${homeSection(project)}`);
}
