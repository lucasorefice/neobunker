import { redirect } from "next/navigation";
import { randomBroadcastName } from "@/lib/broadcast-name";

// Mint a fresh unguessable name and hand off to /host/<name>, which holds the
// name in the URL (stable on reload, shareable). No DB, no state.
export default function HostPage() {
  redirect(`/host/${randomBroadcastName()}`);
}
