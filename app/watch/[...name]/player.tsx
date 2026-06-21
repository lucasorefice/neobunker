"use client";

// This module is loaded only in the browser (via dynamic(ssr:false) in
// watch-client.tsx), so these side-effecting imports — which register the
// <moq-watch>/<moq-watch-ui> custom elements and touch WebTransport/WebCodecs —
// are safe at module scope. They must NEVER be imported on the server.
import "@moq/watch/element";
import "@moq/watch/ui";

// `url` is computed server-side: plain relay URL in anon mode, or the relay root
// carrying a ?jwt= subscribe token in JWT mode.
export default function Player({ url, name }: { url: string; name: string }) {
  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* <moq-watch-ui> overlays controls on top of <moq-watch>. The <canvas>
          child is required — the element renders decoded video into it. */}
      <moq-watch-ui className="block">
        <moq-watch
          url={url}
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
