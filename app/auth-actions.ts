"use server";

import { eq } from "drizzle-orm";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { db } from "@/lib/db";
import { users, streams } from "@/lib/schema";
import { hashPassword } from "@/lib/password";
import { candidateBroadcastName, slugifyEmail } from "@/lib/broadcast-name";

export type AuthState = { error?: string } | undefined;

function normalizeEmail(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().toLowerCase();
}

export async function register(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");

  if (!email.includes("@")) return { error: "Enter a valid email address." };
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) return { error: "An account with that email already exists." };

  const passwordHash = await hashPassword(password);

  // Create the user and provision their single stream atomically.
  try {
    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email, passwordHash })
        .returning({ id: users.id });

      await tx.insert(streams).values({
        ownerUserId: user.id,
        broadcastName: candidateBroadcastName(email),
        title: `${slugifyEmail(email)}'s stream`,
      });
    });
  } catch {
    return { error: "Could not create the account. Please try again." };
  }

  // Establish the session (throws a redirect on success — let it propagate).
  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Could not sign in." };
    throw error;
  }
  return undefined;
}

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Invalid email or password." };
    throw error;
  }
  return undefined;
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
