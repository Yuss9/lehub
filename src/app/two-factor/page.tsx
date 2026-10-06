import { AuthShell } from "@/components/auth-shell";
import { TwoFactorChallenge } from "@/components/two-factor";
export default function TwoFactorPage() {
  return (
    <AuthShell
      title="Une dernière vérification."
      description="Saisis le code de ton application d’authentification ou un code de secours."
    >
      <TwoFactorChallenge />
    </AuthShell>
  );
}
