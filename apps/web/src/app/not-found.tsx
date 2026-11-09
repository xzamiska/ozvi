import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="oz-frame grid min-h-[70dvh] place-content-center justify-items-center gap-3 py-16 text-center">
      <p className="font-heading text-[56px] leading-none font-extrabold tracking-tight text-muted-foreground" data-num>404</p>
      <h1 className="font-heading text-2xl font-bold">Táto stránka neexistuje</h1>
      <p className="max-w-[44ch] text-muted-foreground">Možno bol záznam zlúčený alebo zmazaný, alebo je v odkaze preklep.</p>
      <Button asChild variant="outline" className="mt-2"><Link href="/">Na úvod</Link></Button>
    </main>
  );
}
