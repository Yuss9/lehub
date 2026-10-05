"use client";
import { useState } from "react";
import { Button } from "./ui/button";
export function PushControls({ scope }: { scope: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function change(operation: "subscribe" | "disable" | "test") {
    setBusy(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        throw Error(
          "Ce navigateur ne prend pas en charge les notifications push. Sur iPhone, installe d’abord lehub sur l’écran d’accueil.",
        );
      const settings = await fetch("/api/push", { cache: "no-store" });
      if (!settings.ok) throw Error("Reconnecte-toi puis réessaie.");
      const config = await settings.json();
      if ((operation !== "disable" && !config.key) || config.scope !== scope)
        throw Error(
          "Actualise la page ou demande à l’administrateur de configurer les clés VAPID.",
        );
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (operation === "subscribe") {
        if ((await Notification.requestPermission()) !== "granted")
          throw Error(
            "Autorisation refusée. Tu peux la modifier dans les paramètres du navigateur.",
          );
        const key = Uint8Array.from(
          atob(config.key.replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0),
        );
        subscription ||= await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      }
      if (!subscription)
        throw Error("Active d’abord les notifications sur cet appareil.");
      const result = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation,
          scope,
          endpoint: subscription.endpoint,
          subscription: subscription.toJSON(),
        }),
      });
      if (!result.ok)
        throw Error(
          (await result.json()).error || "Enregistrement impossible.",
        );
      // The same browser subscription may serve another household: remove only this household's registration.
      setMessage(
        operation === "disable"
          ? "Notifications désactivées pour ce foyer sur cet appareil."
          : operation === "test"
            ? "Notification de test envoyée."
            : "Notifications activées pour ce foyer sur cet appareil.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Notifications privées, sans détail de l’entretien sur l’écran
        verrouillé. À activer séparément pour chaque foyer et appareil.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy}
          type="button"
          onClick={() => void change("subscribe")}
        >
          Activer les notifications
        </Button>
        <Button
          disabled={busy}
          type="button"
          variant="outline"
          onClick={() => void change("test")}
        >
          Tester
        </Button>
        <Button
          disabled={busy}
          type="button"
          variant="ghost"
          onClick={() => void change("disable")}
        >
          Désactiver pour ce foyer
        </Button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
