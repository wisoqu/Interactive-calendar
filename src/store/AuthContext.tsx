import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { User, Classroom } from "../types";
import { apiClient, onUnauthorizedSession } from "../api/client";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  classrooms: Classroom[];
  currentClassroom: Classroom | null;
  applyUser: (nextUser: User) => void;
  refreshUser: (throwOnError?: boolean) => Promise<void>;
  refreshClassrooms: () => Promise<void>;
  selectClassroom: (classroom: Classroom | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [currentClassroom, setCurrentClassroom] = useState<Classroom | null>(null);

  const applyUser = useCallback((nextUser: User) => {
    setUser(nextUser);
    setLoading(false);
  }, []);

  const refreshUser = useCallback(async (throwOnError = false) => {
    try {
      const data = await apiClient.me();
      setUser({ id: data.id, username: data.username, email: data.email });
    } catch (e) {
      setUser(null);
      setClassrooms([]);
      setCurrentClassroom(null);
      if (throwOnError) {
        throw e;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshClassrooms = useCallback(async () => {
    try {
      const data = await apiClient.listClassrooms();
      setClassrooms(data);

      // Functional update prevents stale closure overwrites when updating or switching classrooms
      setCurrentClassroom((prev) => {
        if (prev) {
          const found = data.find((c: Classroom) => c.id === prev.id);
          return found || data[0] || null;
        }
        return data[0] || null;
      });
    } catch (e) {
      console.error("Failed to query classrooms", e);
    }
  }, []);

  const selectClassroom = useCallback((classroom: Classroom | null) => {
    setCurrentClassroom(classroom);
    if (classroom) {
      setClassrooms((prev) => {
        const exists = prev.some((item) => item.id === classroom.id);
        if (!exists) return [classroom, ...prev];
        return prev.map((item) => (item.id === classroom.id ? classroom : item));
      });
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch (e) {
      console.error(e);
    } finally {
      setUser(null);
      setClassrooms([]);
      setCurrentClassroom(null);
    }
  }, []);

  // Run on mount to auto-identify logged in session
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Clear stale UI state immediately if any API call reports an expired/revoked session
  useEffect(() => {
    return onUnauthorizedSession(() => {
      setUser(null);
      setClassrooms([]);
      setCurrentClassroom(null);
    });
  }, []);

  // Sync classrooms list whenever authenticated user changes
  useEffect(() => {
    if (user?.id) {
      refreshClassrooms();
    }
  }, [user?.id, refreshClassrooms]);

  // Keep roles and classroom open/closed state fresh when returning to the browser tab
  useEffect(() => {
    if (!user?.id) return;
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        refreshUser()
          .then(() => refreshClassrooms())
          .catch(() => {});
      }
    };
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [user?.id, refreshUser, refreshClassrooms]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        classrooms,
        currentClassroom,
        applyUser,
        refreshUser,
        refreshClassrooms,
        selectClassroom,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be wrapped inside an AuthProvider");
  }
  return context;
};
