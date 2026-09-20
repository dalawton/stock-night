import "dotenv/config";
import admin from "firebase-admin";

function init() {
  if (admin.apps.length) return;
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

async function main() {
  const [, , email, password, role] = process.argv;
  if (!email || !password || !role) {
    console.error("Usage: node scripts/createStaff.js <email> <password> <bartender|manager>");
    process.exit(1);
  }
  if (!["bartender", "manager"].includes(role)) {
    console.error("Role must be 'bartender' or 'manager'");
    process.exit(1);
  }
  if (!process.env.FIREBASE_PROJECT_ID) {
    console.error("Firebase env vars aren't set — fill in server/.env first.");
    process.exit(1);
  }

  init();

  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
    console.log(`User already exists (${user.uid}) — updating role only.`);
  } catch {
    user = await admin.auth().createUser({ email, password });
    console.log(`Created auth user ${user.uid}`);
  }

  await admin.database().ref(`staff/${user.uid}/role`).set(role);
  console.log(`Set ${email} → role "${role}". They can sign in at /login now.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});