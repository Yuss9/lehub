import { House } from "lucide-react";
export function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
        <House size={20} strokeWidth={1.7} />
      </span>
      <span className="text-xl font-semibold tracking-[-0.055em]">
        lehub<span className="text-primary">.</span>
      </span>
    </span>
  );
}
