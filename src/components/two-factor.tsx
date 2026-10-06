"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { authClient } from "@/lib/auth-client";
import { Field } from "./form";
import { Button } from "./ui/button";

export function TwoFactorChallenge() {
  const router = useRouter();
  const [backup, setBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        const code = String(
          new FormData(event.currentTarget).get("code") || "",
        ).trim();
        try {
          const result = backup
            ? await authClient.twoFactor.verifyBackupCode({ code })
            : await authClient.twoFactor.verifyTotp({ code });
          if (result.error)
            setError(
              "Code incorrect, expiré ou trop de tentatives. Réessaie, ou reconnecte-toi.",
            );
          else {
            router.replace("/");
            router.refresh();
          }
        } catch {
          setError("Le serveur est momentanément inaccessible.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block space-y-2 text-sm font-medium">
        <span>{backup ? "Code de secours" : "Code de l’application"}</span>
        <input
          className="min-h-11 w-full rounded-xl border bg-background px-3"
          name="code"
          aria-label={backup ? "Code de secours" : "Code de l’application"}
          required
          autoComplete="one-time-code"
          inputMode={backup ? "text" : "numeric"}
          pattern={backup ? undefined : "[0-9]{6}"}
          maxLength={backup ? 40 : 6}
          key={String(backup)}
          autoFocus
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button className="w-full" disabled={busy}>
        {busy ? "Vérification…" : "Vérifier et se connecter"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={busy}
        onClick={() => {
          setBackup(!backup);
          setError("");
        }}
      >
        {backup ? "Utiliser mon application" : "Utiliser un code de secours"}
      </Button>
      <Link href="/login" className="block min-h-11 py-3 text-sm text-primary">
        Recommencer la connexion
      </Link>
    </form>
  );
}

export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<{
    secret: string;
    qr: string;
    codes: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch {
      setError(
        "Action impossible. Vérifie ton mot de passe ou ton code, puis réessaie.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    const revoked = await authClient.revokeOtherSessions();
    setSetup(null);
    setMessage(
      revoked.error
        ? "Double authentification mise à jour. Vérifie et révoque les autres sessions ci-dessous."
        : "Double authentification mise à jour. Les autres sessions sont déconnectées.",
    );
    router.refresh();
  }
  return (
    <section className="panel space-y-4">
      <h2 className="text-lg font-semibold">Double authentification</h2>
      <p className="text-sm text-muted-foreground">
        {enabled
          ? "Activée : ton mot de passe et un code de ton application sont demandés à la connexion."
          : "Ajoute un code temporaire depuis Mots de passe, une application d’authentification ou ton gestionnaire de mots de passe."}
      </p>
      {!setup ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const password = String(
              new FormData(event.currentTarget).get("password"),
            );
            event.currentTarget.reset();
            void run(async () => {
              if (enabled) {
                const result = await authClient.twoFactor.disable({ password });
                if (result.error) throw Error();
                await finish();
              } else {
                const result = await authClient.twoFactor.enable({
                  password,
                  method: "totp",
                });
                if (result.error || result.data?.method !== "totp")
                  throw Error();
                const uri = result.data.totpURI;
                setSetup({
                  secret: new URL(uri).searchParams.get("secret") || "",
                  qr: await QRCode.toDataURL(uri, { width: 240, margin: 2 }),
                  codes: result.data.backupCodes,
                });
              }
            });
          }}
        >
          <Field
            label="Mot de passe pour la double authentification"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
          <Button disabled={busy}>
            {busy
              ? "Vérification…"
              : enabled
                ? "Désactiver la double authentification"
                : "Configurer la double authentification"}
          </Button>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const code = String(new FormData(event.currentTarget).get("code"));
            void run(async () => {
              const result = await authClient.twoFactor.verifyTotp({ code });
              if (result.error) throw Error();
              await finish();
            });
          }}
        >
          <p className="text-sm">
            1. Scanne ce QR code dans ton application, ou saisis cette clé
            manuellement.
          </p>
          {/* Generated locally; the secret is never sent to an external QR service. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={setup.qr}
            alt="QR code de configuration de la double authentification"
            width={240}
            height={240}
            className="rounded-xl"
          />
          <label className="block space-y-2 text-sm">
            <span>Clé de configuration</span>
            <input
              className="w-full min-h-11 rounded-xl border bg-background px-3 font-mono text-xs"
              aria-label="Clé de configuration"
              readOnly
              value={setup.secret}
            />
          </label>
          <p className="text-sm">
            2. Conserve ces codes de secours dans un endroit privé. Chacun
            fonctionne une seule fois.
          </p>
          <pre
            aria-label="Codes de secours"
            className="overflow-x-auto rounded-xl border bg-background p-4 text-sm"
          >
            {setup.codes.join("\n")}
          </pre>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob(
                  [
                    "lehub — Codes de secours personnels\n\n" +
                      setup.codes.join("\n"),
                  ],
                  { type: "text/plain" },
                ),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = "lehub-codes-de-secours.txt";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Télécharger mes codes de secours
          </Button>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" required />
            J’ai conservé mes codes de secours
          </label>
          <label className="block space-y-2 text-sm">
            <span>3. Code de l’application</span>
            <input
              className="w-full min-h-11 rounded-xl border bg-background px-3"
              name="code"
              aria-label="Code de l’application"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              pattern="[0-9]{6}"
              maxLength={6}
            />
          </label>
          <Button disabled={busy}>
            {busy ? "Vérification…" : "Confirmer l’activation"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => setSetup(null)}
          >
            Reprendre plus tard
          </Button>
        </form>
      )}
      {message && (
        <p role="status" className="text-sm text-primary">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
