import { AuthShell } from "@/components/auth-shell";
import { MutationForm, Field } from "@/components/form";
import { resetPasswordAction } from "@/app/recovery-actions";
export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <AuthShell
      title="Un nouveau départ."
      description="Ce lien est personnel et valable une seule fois."
    >
      <MutationForm
        action={resetPasswordAction}
        label="Enregistrer le nouveau mot de passe"
      >
        <input name="token" type="hidden" value={token} />
        <Field
          label="Nouveau mot de passe"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
        <Field
          label="Confirmer le mot de passe"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
      </MutationForm>
    </AuthShell>
  );
}
