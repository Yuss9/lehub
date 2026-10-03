import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { household, invitation } from "@/db/schema";
import { tokenHash } from "@/lib/domain";
import { getAuth } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { Field, MutationForm } from "@/components/form";
import { acceptAction } from "@/app/actions";
export const dynamic = "force-dynamic";
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [row] = /^[A-Za-z0-9_-]{43}$/.test(token)
    ? await db
        .select({ invitation, name: household.name })
        .from(invitation)
        .innerJoin(household, eq(household.id, invitation.householdId))
        .where(eq(invitation.tokenHash, tokenHash(token)))
    : [];
  if (
    !row ||
    row.invitation.acceptedAt ||
    row.invitation.revokedAt ||
    row.invitation.expiresAt <= new Date()
  )
    return (
      <AuthShell
        title="Ce lien n’est plus valide."
        description="Demande une nouvelle invitation à l’administrateur du foyer."
      >
        <Link href="/login" className="text-primary">
          Aller à la connexion
        </Link>
      </AuthShell>
    );
  const session = await getAuth().api.getSession({ headers: await headers() });
  const ownAccount = session?.user.email.toLowerCase() === row.invitation.email;
  return (
    <AuthShell
      title={`Rejoins ${row.name}.`}
      description={`Invitation pour ${row.invitation.email}. Ton compte aura le rôle membre.`}
    >
      <MutationForm
        action={acceptAction}
        label={ownAccount ? "Rejoindre le foyer" : "Créer mon compte"}
      >
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="email" value={row.invitation.email} />
        {!ownAccount && (
          <>
            <Field
              name="name"
              label="Ton prénom"
              required
              maxLength={80}
              autoComplete="name"
            />
            <Field
              name="password"
              label="Ton mot de passe"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              hint="12 caractères minimum."
            />
          </>
        )}
      </MutationForm>
      {!ownAccount && (
        <p className="mt-6 text-sm text-muted-foreground">
          Déjà un compte ?{" "}
          <Link href="/login" className="text-primary underline">
            Connecte-toi
          </Link>
          , puis rouvre ce lien.
        </p>
      )}
    </AuthShell>
  );
}
