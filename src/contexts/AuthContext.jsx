import { useState, useCallback } from "react";
import { useDispatch } from "react-redux";
import { loginRequest } from "@/features/auth/api/authApi";
import { sessionEnded, sessionStarted } from "@/features/auth/model/authSlice";
import { clearSession, getToken as getStoredToken, getUser as getStoredUser, setToken, setUser } from "@/shared/api/authStorage";
import { setActiveTenant } from "@/shared/model/sessionActions";
import { AuthContext } from "@/contexts/authContextValue";

export function AuthProvider({ children }) {
  const dispatch = useDispatch();
  const [user, setUserState] = useState(getStoredUser);
  const [token, setTokenState] = useState(getStoredToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const login = useCallback(async (username, password) => {
    setLoading(true);
    setError("");
    try {
      const res = await loginRequest({ username, password });
      const tokenStr = res?.access_token || res?.token || res?.accessToken;
      if (!tokenStr) throw new Error("Invalid login response");
      const profile = res?.user || {};
      const roles = profile.roles || profile.role || [];
      const roleList = Array.isArray(roles) ? roles : [roles];
      const isEngineAdmin = roleList.includes("ADMIN") || roleList.includes("ENGINE_ADMIN") || !!profile.isEngineAdmin;
      setToken(tokenStr);
      setTokenState(tokenStr);
      const userData = {
        id: profile.id,
        name: profile.name || profile.username || username,
        username: profile.username || username,
        roles: roleList,
        isEngineAdmin,
        isTenant: !isEngineAdmin,
        tenantId: isEngineAdmin ? null : profile.id,
        tenantName: profile.name || profile.username || username,
        color: profile.color,
        logo: profile.logo,
      };
      setUser(userData);
      setUserState(userData);
      dispatch(sessionStarted({ token: tokenStr, user: userData }));
      if (!userData.isEngineAdmin && userData.tenantId) {
        setActiveTenant(userData.tenantId, userData.tenantName);
      } else if (userData.isEngineAdmin) {
        setActiveTenant(null, null);
      }
      return userData;
    } catch (err) {
      const msg = err.message || "Erreur de connexion";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  const logout = useCallback(() => {
    clearSession();
    setTokenState(null);
    setUserState(null);
    dispatch(sessionEnded());
  }, [dispatch]);

  const value = {
    user,
    token,
    loading,
    error,
    isAuthenticated: !!token,
    isEngineAdmin: user?.isEngineAdmin || false,
    isTenant: user?.isTenant || false,
    isSSO: user?.isSSO || false,
    login,
    logout,
    clearError: () => setError(""),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
