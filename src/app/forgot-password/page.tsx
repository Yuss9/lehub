import { AuthShell } from "@/components/auth-shell";
import { MutationForm, Field } from "@/components/form";
import { requestResetAction } from "@/app/recovery-actions";
import Link from "next/link";
export default function ForgotPassword() {
  return (
    <AuthShell
      title="Retrouver ton accès."
      description="Reçois un lien privé pour choisir un nouveau mot de passe."
    >
      <MutationForm action={requestResetAction} label="Recevoir un lien">
        <Field
          label="Adresse email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </MutationForm>
      <Link
        href="/login"
        className="mt-6 block min-h-11 py-3 text-sm text-primary"
      >
        Retour à la connexion
      </Link>
    </AuthShell>
  );
}
