import { redirect } from "next/navigation";

/** Old address (links in e-mails and Creem return URLs): the plan now lives in the console. */
export default async function OldBilling({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const q = new URLSearchParams(await searchParams).toString();
  redirect(`/app/w/${id}/plan${q ? `?${q}` : ""}`);
}
