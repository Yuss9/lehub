import { and, eq, isNull, gt, desc } from "drizzle-orm";
import { db } from "@/db";
import { invitation, membership, user } from "@/db/schema";
import { getContext } from "@/lib/context";
import { Field, MutationForm } from "@/components/form";
import { PasswordForm } from "@/components/account-controls";
import { ThemeControl } from "@/components/providers";
import {
  householdAction,
  inviteAction,
  removeAction,
  revokeAction,
} from "@/app/actions";
export default async function SettingsPage() {
  const context = await getContext();
  const isAdmin = context.membership.role === "admin";
  const members = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: membership.role,
    })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(eq(membership.householdId, context.household.id));
  const invites = isAdmin
    ? await db
        .select()
        .from(invitation)
        .where(
          and(
            eq(invitation.householdId, context.household.id),
            isNull(invitation.acceptedAt),
            isNull(invitation.revokedAt),
            gt(invitation.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(invitation.createdAt))
    : [];
  return (
    <>
      <p className="eyebrow">COMME TU L’AIMES</p>
      <h1 className="page-title mt-3">Paramètres</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Les détails qui font de cet espace le tien.
      </p>
      <div className="mt-9 grid items-start gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <section className="panel">
            <h2 className="mb-1 text-lg font-semibold">Le foyer</h2>
            <p className="mb-6 text-xs leading-6 text-muted-foreground">
              {isAdmin
                ? "Le nom et les préférences communes à tous les membres."
                : "Seul un administrateur peut modifier ces préférences."}
            </p>
            {isAdmin ? (
              <MutationForm action={householdAction} label="Enregistrer">
                <Field
                  label="Nom du foyer"
                  name="name"
                  required
                  defaultValue={context.household.name}
                  maxLength={80}
                />
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
                  <Field
                    label="Devise"
                    name="currency"
                    required
                    defaultValue={context.household.currency}
                    maxLength={3}
                    hint="Code ISO : EUR, CHF, TRY…"
                  />
                  <Field
                    label="Fuseau horaire"
                    name="timezone"
                    required
                    defaultValue={context.household.timezone}
                    maxLength={100}
                    hint="Exemple : Europe/Paris"
                  />
                </div>
              </MutationForm>
            ) : (
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Nom</dt>
                  <dd>{context.household.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Devise et fuseau horaire
                  </dt>
                  <dd>
                    {context.household.currency} · {context.household.timezone}
                  </dd>
                </div>
              </dl>
            )}
          </section>
          <section className="panel">
            <h2 className="mb-2 text-lg font-semibold">Apparence</h2>
            <p className="mb-5 text-xs text-muted-foreground">
              Ton choix est conservé sur cet appareil.
            </p>
            <ThemeControl />
          </section>
          <section className="panel">
            <h2 className="mb-2 text-lg font-semibold">Sécurité</h2>
            <p className="mb-6 break-all text-xs text-muted-foreground">
              Connecté avec {context.user.email}
            </p>
            <PasswordForm />
          </section>
        </div>
        <section className="panel">
          <h2 className="text-lg font-semibold">En bonne compagnie</h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Les personnes qui partagent ce foyer.
          </p>
          <ul className="my-6 divide-y divide-border">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-2 py-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {member.name}
                    {member.id === context.user.id && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        toi
                      </span>
                    )}
                  </p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {member.email}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {member.role === "admin" ? "Administrateur" : "Membre"}
                  </p>
                </div>
                {isAdmin && member.role === "member" && (
                  <MutationForm
                    compact
                    action={removeAction}
                    label="Retirer"
                    confirmation={`Retirer ${member.name} du foyer ? Son accès sera supprimé immédiatement.`}
                  >
                    <input type="hidden" name="userId" value={member.id} />
                  </MutationForm>
                )}
              </li>
            ))}
          </ul>
          {isAdmin && (
            <>
              <div className="border-t border-border pt-6">
                <h3 className="mb-2 text-sm font-semibold">
                  Inviter un membre
                </h3>
                <p className="mb-5 text-xs leading-6 text-muted-foreground">
                  Un lien valable 48 heures, à transmettre toi-même. Aucun email
                  n’est envoyé.
                </p>
                <MutationForm
                  action={inviteAction}
                  label="Créer un lien d’invitation"
                >
                  <Field
                    label="Adresse email du membre"
                    name="email"
                    type="email"
                    required
                    maxLength={254}
                  />
                </MutationForm>
              </div>
              {invites.length > 0 && (
                <div className="mt-8 border-t border-border pt-6">
                  <h3 className="text-sm font-semibold">
                    Invitations en attente
                  </h3>
                  <ul className="divide-y divide-border">
                    {invites.map((invite) => (
                      <li key={invite.id} className="py-4">
                        <p className="break-all text-sm">{invite.email}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Expire le{" "}
                          {new Intl.DateTimeFormat("fr-FR", {
                            dateStyle: "short",
                            timeStyle: "short",
                            timeZone: context.household.timezone,
                          }).format(invite.expiresAt)}
                        </p>
                        <MutationForm
                          compact
                          action={revokeAction}
                          label="Révoquer"
                          confirmation="Révoquer ce lien d’invitation ?"
                        >
                          <input type="hidden" name="id" value={invite.id} />
                        </MutationForm>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
