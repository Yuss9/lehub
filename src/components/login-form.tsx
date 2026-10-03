"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Field } from "./form";
import { Button } from "./ui/button";
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setError("");
        setPending(true);
        try {
          const result = await authClient.signIn.email({
            email: String(data.get("email")).trim().toLowerCase(),
            password: String(data.get("password")),
          });
          if (result.error) {
            setError(
              "Email ou mot de passe incorrect, ou trop de tentatives. Réessaie dans un instant.",
            );
          } else {
            router.push("/");
            router.refresh();
          }
        } catch {
          setError("Le serveur est momentanément inaccessible.");
        } finally {
          setPending(false);
        }
      }}
    >
      <Field
        label="Adresse email"
        name="email"
        type="email"
        required
        autoComplete="email"
        maxLength={254}
      />
      <Field
        label="Mot de passe"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        maxLength={128}
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button className="w-full" disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
