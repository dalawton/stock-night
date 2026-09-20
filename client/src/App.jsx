import { HashRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import Display from "./pages/Display";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import { AuthProvider, useAuth } from "./authContext";
import "./styles.css";

function RequireStaff({ children }) {
  const { user, loading, firebaseConfigured } = useAuth();
  if (!firebaseConfigured) return children; // dev bypass, matches server
  if (loading) return <div className="admin">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Nav() {
  const { user, role, logout, firebaseConfigured } = useAuth();
  return (
    <nav className="nav">
      <Link to="/display">Display board</Link>
      <Link to="/admin">Admin</Link>
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
          <Route path="/" element={<Display />} />
          <Route path="/display" element={<Display />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/admin"
            element={
              <RequireStaff>
                <Admin />
              </RequireStaff>
            }
          />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}