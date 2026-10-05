import { db, pool } from "../src/db/index";
import { issueReset } from "../src/lib/recovery";
const email = process.argv[2];
try {
  if (!email || !process.env.BETTER_AUTH_URL)
    throw new Error(
      "Usage: npm run account:recover -- adresse@email (BETTER_AUTH_URL et DATABASE_URL requis)",
    );
  const token = await issueReset(db, email);
  if (!token) throw new Error("Compte introuvable.");
  console.log(
    `Lien privé, une utilisation, 30 minutes :\n${new URL(`/reset-password?token=${token}`, process.env.BETTER_AUTH_URL)}`,
  );
} finally {
  await pool.end();
}
