"use client";

// Browser-only, loaded via dynamic(ssr:false). Registers <moq-publish> /
// <moq-publish-ui> and uses getUserMedia + WebCodecs, none of which exist on the
// server.
import "@moq/publish/element";
import "@moq/publish/ui";

import { RELAY_URL } from "@/lib/relay";

export default function Publisher({ name }: { name: string }) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* <moq-publish-ui> renders the source picker + publish controls.
          The <video muted autoplay> child shows the local preview. */}
      <moq-publish-ui className="block">
        <moq-publish
          url={RELAY_URL}
          name={name}
          source="camera"
          className="block aspect-video w-full overflow-hidden rounded-xl bg-black"
        >
          <video muted autoPlay playsInline className="h-full w-full" />
        </moq-publish>
      </moq-publish-ui>
    </div>
  );
}
