"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { clearShopping } from "@/lib/offline-shopping";
import { Button } from "./ui/button";
import { Field } from "./form";

export function SignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(false);
          try {
            const result = await authClient.signOut();
            if (result.error) throw Error();
            clearShopping();
            router.push("/login");
            router.refresh();
          } catch {
            setError(true);
          } finally {
            setPending(false);
          }
        }}
      >
        <LogOut />
        Déconnexion
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          Réessaie.
        </p>
      )}
    </div>
  );
}
export function PasswordForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        setPending(true);
        setMessage("");
        if (data.get("newPassword") !== data.get("confirmPassword")) {
          setMessage("Les mots de passe ne correspondent pas.");
          setPending(false);
          return;
        }
        try {
          const result = await authClient.changePassword({
            currentPassword: String(data.get("currentPassword")),
            newPassword: String(data.get("newPassword")),
            revokeOtherSessions: true,
          });
          if (result.error)
            setMessage("Vérifie ton mot de passe actuel et réessaie.");
          else {
            setMessage(
              "Mot de passe modifié. Les autres sessions ont été déconnectées.",
            );
            form.reset();
          }
        } catch {
          setMessage("Connexion impossible. Réessaie.");
        } finally {
          setPending(false);
        }
      }}
    >
      <Field
        label="Mot de passe actuel"
        name="currentPassword"
        type="password"
        required
        autoComplete="current-password"
      />
      <Field
        label="Nouveau mot de passe"
        name="newPassword"
        type="password"
        required
        minLength={12}
        maxLength={128}
        autoComplete="new-password"
        hint="12 caractères minimum."
      />
      <Field
        label="Confirmer le nouveau mot de passe"
        name="confirmPassword"
        type="password"
        required
        minLength={12}
        maxLength={128}
        autoComplete="new-password"
      />
      <p aria-live="polite" className="text-sm">
        {message}
      </p>
      <Button disabled={pending}>
        {pending ? "Modification…" : "Modifier le mot de passe"}
      </Button>
    </form>
  );
}
