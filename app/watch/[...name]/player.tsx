"use client";

// This module is loaded only in the browser (via dynamic(ssr:false) in
// watch-client.tsx), so these side-effecting imports — which register the
// <moq-watch>/<moq-watch-ui> custom elements and touch WebTransport/WebCodecs —
// are safe at module scope. They must NEVER be imported on the server.
import "@moq/watch/element";
import "@moq/watch/ui";

import { RELAY_URL } from "@/lib/relay";

export default function Player({ name }: { name: string }) {
  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* <moq-watch-ui> overlays controls on top of <moq-watch>. The <canvas>
          child is required — the element renders decoded video into it. */}
      <moq-watch-ui className="block">
        <moq-watch
          url={RELAY_URL}
          name={name}
          reload
          className="block aspect-video w-full overflow-hidden rounded-xl bg-black"
        >
          <canvas className="h-full w-full" />
        </moq-watch>
      </moq-watch-ui>
    </div>
  );
}
