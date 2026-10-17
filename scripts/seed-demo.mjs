// Explicitly demo-only, initial population; never clears an existing instance.
import pg from "pg";
import { hashPassword } from "better-auth/crypto";

const url = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
if (process.env.DEMO_MODE !== "true" || url.pathname !== "/lehub_demo") {
  throw new Error("Seed refused: DEMO_MODE=true and database lehub_demo required.");
}
for (const key of ["DEMO_PASSWORD", "DEMO_ADMIN_PASSWORD"]) {
  if (!process.env[key] || (process.env[key].length < 12 || process.env[key].length > 128)) {
    throw new Error(`${key} must contain between 12 and 128 characters.`);
  }
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(741903)");
  const existing = await client.query("SELECT household_id FROM installation WHERE id=1");
  if (existing.rows.length) {
    if (existing.rows[0].household_id !== "lehub-demo-household") {
      throw new Error("Refusing to seed an existing non-demo installation.");
    }
    console.log("Demo already initialized; preserving accounts and data.");
  } else {
    const counts = await client.query('SELECT (SELECT count(*) FROM "user") + (SELECT count(*) FROM household) AS n');
    if (Number(counts.rows[0].n) !== 0) throw new Error("Seed requires an empty instance.");
    const hid = "lehub-demo-household";
    await client.query("INSERT INTO household(id,name) VALUES($1,$2)", [hid,"Maison démo — données fictives"]);
    for (const [id,name,email,role,password] of [
      ["demo-admin","Administrateur démo","admin@example.test","admin",process.env.DEMO_ADMIN_PASSWORD],
      ["demo-member","Visiteur démo","demo@example.test","member",process.env.DEMO_PASSWORD],
    ]) {
      await client.query('INSERT INTO "user"(id,name,email,email_verified) VALUES($1,$2,$3,true)', [id,name,email]);
      await client.query("INSERT INTO account(id,account_id,provider_id,user_id,password) VALUES($1,$2,'credential',$2,$3)", [`account-${id}`,id,await hashPassword(password)]);
      await client.query("INSERT INTO membership(household_id,user_id,role) VALUES($1,$2,$3)", [hid,id,role]);
    }
    await client.query("INSERT INTO installation(id,household_id) VALUES(1,$1)", [hid]);
    for (const [id,name,pos] of [["room-salon","Salon",0],["room-cuisine","Cuisine",1],["room-buanderie","Buanderie",2]]) {
      await client.query("INSERT INTO room(id,household_id,name,position) VALUES($1,$2,$3,$4)", [id,hid,name,pos]);
    }
    for (const [id,room,name,brand,model,price] of [
      ["eq-tv","room-salon","Téléviseur","Samsung","Modèle fictif",79900],
      ["eq-coffee","room-cuisine","Machine à café","DeLonghi","Modèle fictif",34900],
      ["eq-washer","room-buanderie","Lave-linge","Bosch","Modèle fictif",59900],
    ]) {
      await client.query("INSERT INTO equipment(id,household_id,room_id,name,brand,model,purchased_cents,purchased_on,warranty_until,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [id,hid,room,name,brand,model,price,"2026-01-15","2028-01-15","Exemple fictif, aucune donnée personnelle."]);
    }
    const date = new Date(); date.setUTCDate(date.getUTCDate()+7);
    await client.query("INSERT INTO maintenance(id,household_id,equipment_id,title,due_on,frequency,anchor_day) VALUES($1,$2,$3,$4,$5,'once',$6)", ["maintenance-coffee",hid,"eq-coffee","Détartrer la machine à café",date.toISOString().slice(0,10),date.getUTCDate()]);
    await client.query("INSERT INTO shopping_list(id,household_id,name) VALUES($1,$2,$3)", ["shopping-demo",hid,"Courses de la semaine"]);
    for (const [i,name,category,quantity] of [[1,"Café","Autres","1"],[2,"Pommes","Autres","6"],[3,"Lessive","Autres","1"]]) {
      await client.query("INSERT INTO shopping_item(id,household_id,list_id,name,category,quantity) VALUES($1,$2,$3,$4,$5,$6)", [`item-${i}`,hid,"shopping-demo",name,category,quantity]);
    }
    console.log("Demo initialized: two accounts, rooms, equipment, maintenance and shopping list.");
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
