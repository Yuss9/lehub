"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function Pwa() {
  useEffect(() => {
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Installe lehub depuis le menu de ton navigateur : « Ajouter à l’écran
        d’accueil ». Sur iPhone, utilise Safari → Partager.
      </p>
      {prompt && (
        <Button
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
          }}
        >
          Installer lehub
        </Button>
      )}
    </div>
  );
}
