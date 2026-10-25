# lehub

- Read README.md before changing scope.
- Every batch starts from up-to-date main in a feature/fix/docs/refactor branch.
- Never push to main, merge a PR or enable auto-merge. The owner reviews and merges.
- CI may build and publish GHCR images on main; it must not deploy or run production migrations. Run PR validation on GitHub-hosted runners, never on the self-hosted runner.
- Keep household authorization on the server, including file downloads.
- Use PostgreSQL and versioned Drizzle migrations; no production mock data.
- French UI, accessible controls, system fonts, quiet visual hierarchy.
- Run npm run lint, npm run typecheck, npm test and npm run build as relevant.
- Include test results, migration/env instructions, limitations and UI captures in PRs.
- Wait for owner feedback before starting a batch depending on an unmerged PR.

