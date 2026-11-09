import { redirect } from "next/navigation";

export default async function ProjectHome({ params }: { params: Promise<{ project: string }> }) {
  redirect(`/${(await params).project}/ideas`);
}
