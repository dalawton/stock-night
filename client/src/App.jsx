import { HashRouter, Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import Display from "./pages/Display";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import { AuthProvider, useAuth } from "./authContext";
import "./styles.css";

const STAFF = ["bartender", "manager"];
const ANY_ROLE = ["display", "bartender", "manager"];

// Nothing renders for anyone who isn't signed in with an allowed role.
function RequireRole({ roles, children }) {
  const { user, role, loading, error, firebaseConfigured, logout } = useAuth();
  const location = useLocation();
  if (!firebaseConfigured) return children; // local dev bypass, matches server
  if (loading) return <div className="gate">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!role) {
    return (
      <div className="gate">
        <h1>No access</h1>
        <p>{error || "This account doesn't have a staff role yet. Ask a manager to add you."}</p>
        <button className="btn-ghost" onClick={logout}>Sign out</button>
      </div>
    );
  }
  if (!roles.includes(role)) {
    return (
      <div className="gate">
        <h1>No access</h1>
        <p>Your account ({role}) can't open this page.</p>
        <Link to="/display">Go to the board</Link>
      </div>
    );
  }
  return children;
}

function Nav() {
  const { user, role, logout, firebaseConfigured } = useAuth();
  const onBoard = ["/", "/display"].includes(useLocation().pathname);
  const signedIn = !firebaseConfigured || (user && role);
  const isStaff = !firebaseConfigured || STAFF.includes(role);
  return (
    <nav className={`nav${onBoard ? " nav--display" : ""}`}>
      {signedIn && <Link to="/display">Display board</Link>}
      {isStaff && <Link to="/admin">Admin</Link>}
      <span className="nav__spacer" />
      {firebaseConfigured && user && (
        <span className="nav__user">
          {user.email} · {role || "no role"}{" "}
          <button className="btn-ghost nav__logout" onClick={logout}>
            Sign out
          </button>
        </span>
      )}
    </nav>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Nav />
        <Routes>
          <Route path="/" element={<Navigate to="/display" replace />} />
          <Route
            path="/display"
            element={
              <RequireRole roles={ANY_ROLE}>
                <Display />
              </RequireRole>
            }
          />
          <Route path="/login" element={<Login />} />
          <Route
            path="/admin"
            element={
              <RequireRole roles={STAFF}>
                <Admin />
              </RequireRole>
            }
          />
          <Route path="*" element={<Navigate to="/display" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
