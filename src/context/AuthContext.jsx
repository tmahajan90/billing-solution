import { createContext, useContext, useState, useCallback } from "react";
import { authService } from "../services/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(authService.getUser());
  const [tenant, setTenant] = useState(authService.getTenant());

  const login = useCallback(async (data) => {
    const result = await authService.login(data);
    setUser(result.user);
    setTenant(result.tenant);
    return result;
  }, []);

  const register = useCallback(async (data) => {
    const result = await authService.register(data);
    setUser(result.user);
    setTenant(result.tenant);
    return result;
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
    setTenant(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, tenant, login, register, logout, isLoggedIn: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
