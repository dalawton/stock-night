import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../authContext";

export default function Login() {
  const { login, error, user, role, loading, firebaseConfigured } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
    } catch {
      // error already surfaced via context
    } finally {
      setSubmitting(false);
    }
  }

  // Already signed in (or just did): go where they were headed, or to the
  // page that suits their role.
  if (!firebaseConfigured) return <Navigate to="/admin" replace />;
  if (!loading && user && role) {
    const home = role === "display" ? "/display" : "/admin";
    const from = location.state?.from;
    const dest = from && (role !== "display" || from === "/display") ? from : home;
    return <Navigate to={dest} replace />;
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={handleSubmit}>
        <h1>Staff sign in</h1>
        <p className="admin__subtitle">
          Sign in to view the board or use the dashboard.
        </p>
        {error && <div className="banner banner--error">{error}</div>}
        <input
          type="email"
          placeholder="you@thebar.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}