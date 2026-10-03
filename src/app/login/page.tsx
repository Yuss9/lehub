import { redirect } from "next/navigation";
import { db } from "@/db";
import { installation } from "@/db/schema";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
import { SignOut } from "@/components/account-controls";
export const dynamic = "force-dynamic";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; reason?: string }>;
}) {
  if (!(await db.select().from(installation).limit(1)).length)
    redirect("/setup");
  const params = await searchParams;
  return (
    <AuthShell
      title="Heureux de te revoir."
      description="Connecte-toi pour retrouver ton espace maison."
    >
      {params.created && (
        <p className="mb-5 rounded-xl bg-primary/10 p-3 text-sm">
          Ton compte est prêt. Tu peux te connecter.
        </p>
      )}
      {params.reason === "membership" && (
        <div className="mb-5 space-y-2">
          <p className="text-sm text-danger">
            Ce compte n’a plus accès à un foyer. Demande une nouvelle invitation
            à un administrateur.
          </p>
          <SignOut />
        </div>
      )}
      <LoginForm />
      <p className="mt-7 text-center text-xs leading-relaxed text-muted-foreground">
        Pour rejoindre un foyer, demande un lien d’invitation à son
        administrateur.
      </p>
    </AuthShell>
  );
}
