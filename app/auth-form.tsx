"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthState } from "./auth-actions";

export function AuthForm({
  action,
  mode,
}: {
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  mode: "login" | "register";
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const isLogin = mode === "login";

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-3xl font-semibold tracking-tight">
        {isLogin ? "Sign in" : "Create account"}
      </h1>
      <p className="mt-2 text-sm text-neutral-400">
        {isLogin
          ? "Broadcaster sign in."
          : "Sign up and get your own stream."}
      </p>

      <form action={formAction} className="mt-6 space-y-3">
        <input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          autoComplete="email"
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-600"
        />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="password (min 8 chars)"
          autoComplete={isLogin ? "current-password" : "new-password"}
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-600"
        />

        {state?.error ? (
          <p className="text-sm text-red-400">{state.error}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 transition-colors hover:bg-neutral-200 disabled:opacity-60"
        >
          {pending ? "…" : isLogin ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-sm text-neutral-500">
        {isLogin ? (
          <>
            No account?{" "}
            <Link href="/register" className="text-neutral-300 underline hover:text-white">
              Create one
            </Link>
          </>
        ) : (
          <>
            Already have one?{" "}
            <Link href="/login" className="text-neutral-300 underline hover:text-white">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
