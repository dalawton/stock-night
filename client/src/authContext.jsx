import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, firebaseConfigured } from "./firebase";
import { api, setAuthTokenProvider } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!firebaseConfigured) {
      // Dev mode without Firebase set up — matches the server's dev bypass.
      setLoading(false);
      return;
    }
    return onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      // Set the token provider here, synchronously with fbUser, rather than
      // in a separate effect keyed on `user` — that effect only runs after
      // the next render, which is too late for the api.me() call below.
      setAuthTokenProvider(() => (fbUser ? fbUser.getIdToken() : Promise.resolve(null)));
      if (fbUser) {
        try {
          const me = await api.me();
          setRole(me.role);
        } catch (err) {
          setRole(null);
          setError(err.message);
        }
      } else {
        setRole(null);
      }
      setLoading(false);
    });
  }, []);

  const login = useCallback(async (email, password) => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError("Couldn't sign in — check the email and password.");
      throw err;
    }
  }, []);

  const logout = useCallback(() => signOut(auth), []);

  return (
    <AuthContext.Provider value={{ user, role, loading, error, login, logout, firebaseConfigured }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}