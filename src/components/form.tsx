"use client";
import { useActionState, useId, useState } from "react";
import { LoaderCircle, Copy, Check } from "lucide-react";
import type { ActionState } from "@/app/actions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function Field({
  label,
  hint,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <Input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...props}
      />
      {hint && (
        <p
          id={`${id}-hint`}
          className="text-xs text-muted-foreground leading-relaxed"
        >
          {hint}
        </p>
      )}
    </div>
  );
}
export function MutationForm({
  action,
  children,
  label,
  confirmation,
  compact = false,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  label: string;
  confirmation?: string;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [copied, setCopied] = useState(false);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmation && !window.confirm(confirmation))
          event.preventDefault();
      }}
      className={compact ? "space-y-2" : "space-y-5"}
    >
      {children}
      <div aria-live="polite" aria-atomic="true">
        {state.error && (
          <p
            role="alert"
            className="rounded-xl bg-danger/10 p-3 text-sm text-danger"
          >
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="rounded-xl bg-primary/8 p-3 text-sm leading-relaxed">
            {state.success}
          </p>
        )}
      </div>
      {state.link && (
        <div className="space-y-2">
          <label className="text-sm" htmlFor="invitation-link">
            Lien privé — valable 48 heures
          </label>
          <Input
            id="invitation-link"
            readOnly
            value={state.link}
            onFocus={(event) => event.target.select()}
          />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.link!);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copié" : "Copier le lien"}
          </Button>
        </div>
      )}
      <Button
        type="submit"
        disabled={pending}
        variant={compact ? "ghost" : "default"}
        size={compact ? "sm" : "default"}
      >
        {pending && <LoaderCircle className="animate-spin" />}
        {pending ? "En cours…" : label}
      </Button>
    </form>
  );
}
