import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { register } from "../auth-actions";
import { AuthForm } from "../auth-form";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <AuthForm action={register} mode="register" />
    </main>
  );
}
