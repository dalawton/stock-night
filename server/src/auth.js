// Auth middleware: verifies a Firebase ID token, then looks up the caller's
// role from RTDB (staff/{uid}/role). Roles are stored in the database rather
// than as custom claims so a manager can grant/revoke access instantly
// (createStaff.js) without needing the user to get a fresh token via a
// separate claims-refresh flow.
import admin from "firebase-admin";
import { httpError } from "./errors.js";

// display = the read-only TV account (can view the board, nothing else)
const ROLE_RANK = { display: 1, bartender: 2, manager: 3 };

// Role lookups hit the database; the display polls every few seconds, so
// remember a role for a short time. Short enough that revoking access still
// takes effect within seconds.
const ROLE_CACHE_MS = 15000;
const roleCache = new Map(); // uid -> { role, at }

let devWarned = false;

function firebaseReady() {
  return admin.apps.length > 0;
}

export function requireAuth(minRole = "display") {
  return async (req, res, next) => {
    try {
      if (!firebaseReady()) {
        if (!devWarned) {
          console.warn(
            "[auth] Firebase not configured — requests are running with an UNAUTHENTICATED dev bypass (role: manager). Set FIREBASE_* env vars before using this for real."
          );
          devWarned = true;
        }
        req.user = { uid: "dev", email: "dev@local", role: "manager" };
        return next();
      }

      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token) throw httpError(401, "Missing Authorization header");

      const decoded = await admin.auth().verifyIdToken(token);
      let role;
      const cached = roleCache.get(decoded.uid);
      if (cached && Date.now() - cached.at < ROLE_CACHE_MS) {
        role = cached.role;
      } else {
        role = (await admin.database().ref(`staff/${decoded.uid}/role`).get()).val();
        roleCache.set(decoded.uid, { role, at: Date.now() });
      }

      if (!role || !(role in ROLE_RANK)) {
        throw httpError(403, "No staff role assigned to this account. Ask a manager to add you (see scripts/createStaff.js).");
      }
      if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
        throw httpError(403, `This action requires the '${minRole}' role.`);
      }

      req.user = { uid: decoded.uid, email: decoded.email, role };
      next();
    } catch (err) {
      if (err.status) return next(err);
      next(httpError(401, "Invalid or expired sign-in token"));
    }
  };
}