"use client";

// Browser-only, loaded via dynamic(ssr:false). Registers <moq-publish> /
// <moq-publish-ui> and uses getUserMedia + WebCodecs, none of which exist on the
// server.
import "@moq/publish/element";
import "@moq/publish/ui";

// `url` is computed server-side: plain relay URL in anon mode, or the relay root
// carrying a ?jwt= publish token in JWT mode.
export default function Publisher({ url, name }: { url: string; name: string }) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* <moq-publish-ui> renders the source picker + publish controls.
          The <video muted autoplay> child shows the local preview. */}
      <moq-publish-ui className="block">
        <moq-publish
          url={url}
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
