import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { AuthUser, login as apiLogin, logout as apiLogout, getMe, changePassword as apiChangePassword } from "../api";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = async () => {
    try {
      const u = await getMe();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };



  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (email: string, password: string) => {
    setError(null);
    try {
      const loggedInUser = await apiLogin(email, password);
      setUser(loggedInUser);
    } catch (err: any) {
      const msg = err.message || "Invalid email or password. Please try again.";
      setError(msg);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string, confirmPassword: string) => {
    const res = await apiChangePassword(currentPassword, newPassword, confirmPassword);
    if (res.success) {
      setUser((prev) => (prev ? { ...prev, mustChangePassword: false } : null));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        logout,
        changePassword,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
