"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

/**
 * Installs the demo mock, then loads widget.js. The inline <script> in the server HTML covers a full
 * page load, but React does not run inline scripts after a client-side navigation (e.g. a link from
 * /vs/canny): without this the widget would talk to the real server, where the demo project does not
 * exist ("failed to load", "not signed in").
 */
export function DemoBoot({ mock, config }: { mock: string; config: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as unknown as { __ozviDemoData?: unknown };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- our own server-built script, no user input
    if (!w.__ozviDemoData) new Function(mock)();
    new Function(config)();
    setReady(true);
  }, [mock, config]);
  return ready ? <Script src="/widget.js" strategy="afterInteractive" /> : null;
}
