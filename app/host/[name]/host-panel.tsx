"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { watchHref } from "@/lib/broadcast-name";

function CopyRow({
  label,
  value,
  href,
  absolute,
}: {
  label: string;
  value: string;
  href?: string;
  absolute?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    // Read window only at click time to avoid SSR hydration mismatch.
    const text = absolute ? `${window.location.origin}${value}` : value;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="rounded-lg border border-neutral-800 p-3">
      <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate font-mono text-sm text-neutral-200">{value}</code>
        <button
          onClick={copy}
          className="rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="rounded bg-emerald-700 px-2 py-1 text-xs hover:bg-emerald-600"
          >
            Open
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function HostPanel({ name, relayUrl }: { name: string; relayUrl: string }) {
  const router = useRouter();
  const href = watchHref(name);
  return (
    <div className="space-y-3">
      <CopyRow label="OBS broadcast name" value={name} />
      <CopyRow label="Relay URL (OBS dock)" value={relayUrl} />
      <CopyRow label="Watch link" value={href} href={href} absolute />
      <button
        onClick={() => router.push("/host")}
        className="mt-2 rounded-lg bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
      >
        Regenerate name
      </button>
    </div>
  );
}
