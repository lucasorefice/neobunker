"use client";

import dynamic from "next/dynamic";

const Publisher = dynamic(() => import("./publisher"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto aspect-video w-full max-w-2xl animate-pulse rounded-xl bg-neutral-900" />
  ),
});

export default function PublishClient({
  url,
  name,
}: {
  url: string;
  name: string;
}) {
  return <Publisher url={url} name={name} />;
}
