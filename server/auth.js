// Auth middleware: verifies a Firebase ID token, then looks up the caller's
// role from RTDB (staff/{uid}/role). Roles are stored in the database rather
// than as custom claims so a manager can grant/revoke access instantly
// (createStaff.js) without needing the user to get a fresh token via a
// separate claims-refresh flow.
import admin from "firebase-admin";
import { httpError } from "../server/src/errors.js";

const ROLE_RANK = { bartender: 1, manager: 2 };

let devWarned = false;

function firebaseReady() {
  return admin.apps.length > 0;
}

export function requireAuth(minRole = "bartender") {
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
      const roleSnap = await admin.database().ref(`staff/${decoded.uid}/role`).get();
      const role = roleSnap.val();

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