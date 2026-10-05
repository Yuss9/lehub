"use client";
import { useActionState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { homeAction } from "@/app/home-actions";
export function ShoppingToggle({
  id,
  name,
  checked,
}: {
  id: string;
  name: string;
  checked: boolean;
}) {
  const [state, action, pending] = useActionState(homeAction, {});
  return (
    <form action={action} className="shrink-0">
      <input name="entity" type="hidden" value="shoppingItem" />
      <input name="id" type="hidden" value={id} />
      <input name="operation" type="hidden" value="toggle" />
      <button
        disabled={pending}
        aria-label={`${checked ? "Décocher" : "Cocher"} ${name}`}
        aria-pressed={checked}
        className={`flex size-11 items-center justify-center rounded-xl border transition-colors ${checked ? "border-primary bg-primary/10 text-primary" : "bg-surface hover:border-primary"}`}
      >
        {pending ? (
          <LoaderCircle size={18} className="animate-spin" />
        ) : checked ? (
          <Check size={19} />
        ) : (
          <span className="size-4 rounded border" />
        )}
      </button>
      {state.error && (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}
