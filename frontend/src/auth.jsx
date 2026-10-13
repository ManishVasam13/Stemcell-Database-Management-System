import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, setToken, getToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api.get('/auth/me').then((d) => setUser(d.user)).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  const value = useMemo(() => ({
    user,
    ready,
    async login(username, password) {
      const data = await api.post('/auth/login', { username, password });
      setToken(data.token);
      setUser(data.user);
      return data.user;
    },
    logout() { setToken(null); setUser(null); },
  }), [user, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
