import { RELAY_URL } from "@/lib/relay";
import { HostPanel } from "./host-panel";

// Params are a Promise in this Next version.
export default async function HostNamePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const broadcastName = decodeURIComponent(name);

  return (
    <main className="min-h-dvh bg-neutral-950 px-4 py-10 text-neutral-100">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="mb-1 font-mono text-lg">Host a private stream</h1>
        <p className="mb-6 text-sm text-neutral-400">
          Paste the broadcast name and relay URL into the OBS MoQ dock, then
          share the watch link. Anyone with the name can join — keep it private.
        </p>
        <HostPanel name={broadcastName} relayUrl={RELAY_URL} />
      </div>
    </main>
  );
}
