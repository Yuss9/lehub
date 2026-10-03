import { redirect } from "next/navigation";
import { db } from "@/db";
import { installation } from "@/db/schema";
import { AuthShell } from "@/components/auth-shell";
import { Field, MutationForm } from "@/components/form";
import { setupAction } from "../actions";
export const dynamic = "force-dynamic";
export default async function SetupPage() {
  if ((await db.select().from(installation).limit(1)).length)
    redirect("/login");
  return (
    <AuthShell
      title="Bienvenue chez toi."
      description="Crée ton foyer et son premier compte administrateur. Cette étape n’est disponible qu’une seule fois."
    >
      <MutationForm action={setupAction} label="Créer mon foyer">
        <Field
          name="householdName"
          label="Nom du foyer"
          placeholder="La maison"
          required
          maxLength={80}
        />
        <Field
          name="name"
          label="Ton prénom"
          required
          autoComplete="name"
          maxLength={80}
        />
        <Field
          name="email"
          label="Adresse email"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
        />
        <Field
          name="password"
          label="Mot de passe"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          hint="12 caractères minimum."
        />
        <Field
          name="setupKey"
          label="Clé de configuration"
          type="password"
          required
          maxLength={256}
          autoComplete="off"
          hint="La valeur SETUP_KEY définie dans le fichier .env de ton serveur."
        />
      </MutationForm>
    </AuthShell>
  );
}
