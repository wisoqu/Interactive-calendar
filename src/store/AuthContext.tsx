import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Classroom, User } from "../types.ts";
import { ApiError, apiClient, onUnauthorizedSession } from "../api/client.ts";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  classrooms: Classroom[];
  currentClassroom: Classroom | null;
  applyUser: (nextUser: User) => void;
  refreshUser: (throwOnError?: boolean) => Promise<void>;
  refreshClassrooms: () => Promise<Classroom[]>;
  selectClassroom: (classroom: Classroom | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getClassroomIdFromHash(): string | null {
  try {
    const match = window.location.hash.match(/^#\/classroom\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [currentClassroom, setCurrentClassroom] = useState<Classroom | null>(null);
  const inFlightClassroomsRef = useRef<Promise<Classroom[]> | null>(null);

  const applyUser = useCallback((nextUser: User) => {
    setUser(nextUser);
    setLoading(false);
  }, []);

  const refreshUser = useCallback(async (throwOnError = false) => {
    try {
      const data = await apiClient.me();
      setUser({ id: data.id, username: data.username, email: data.email });
    } catch (e) {
      // Only clear user state on genuine 401 authentication failure, never on transient network errors
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setClassrooms([]);
        setCurrentClassroom(null);
      } else if (loading) {
        setUser(null);
      }
      if (throwOnError) {
        throw e;
      }
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const refreshClassrooms = useCallback(async (): Promise<Classroom[]> => {
    if (inFlightClassroomsRef.current) {
      return inFlightClassroomsRef.current;
    }

    const promise = (async () => {
      try {
        const data = await apiClient.listClassrooms();
        setClassrooms(data);

        const hashClassroomId = getClassroomIdFromHash();
        setCurrentClassroom((prev) => {
          if (prev) {
            const found = data.find((c) => c.id === prev.id);
            if (found) return found;
          }
          if (hashClassroomId) {
            const fromHash = data.find((c) => c.id === hashClassroomId);
            if (fromHash) return fromHash;
          }
          return data[0] || null;
        });

        return data;
      } catch (e) {
        console.error("Failed to query classrooms", e);
        return [];
      } finally {
        inFlightClassroomsRef.current = null;
      }
    })();

    inFlightClassroomsRef.current = promise;
    return promise;
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
      if (window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, []);

  // Identify existing HttpOnly cookie session once on initial mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await apiClient.me();
        if (active) {
          setUser({ id: data.id, username: data.username, email: data.email });
        }
      } catch {
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Clear stale UI state immediately if any API call reports an expired/revoked session (401)
  useEffect(() => {
    return onUnauthorizedSession(() => {
      setUser(null);
      setClassrooms([]);
      setCurrentClassroom(null);
    });
  }, []);

  // Load classrooms once whenever the authenticated user changes
  useEffect(() => {
    if (user?.id) {
      refreshClassrooms();
    }
  }, [user?.id, refreshClassrooms]);

  // Refresh session & classroom metadata when returning to a hidden tab (without logging out on network blips)
  useEffect(() => {
    if (!user?.id) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        apiClient
          .me()
          .then((data) => {
            setUser({ id: data.id, username: data.username, email: data.email });
            return refreshClassrooms();
          })
          .catch((err) => {
            if (err instanceof ApiError && err.status === 401) {
              setUser(null);
              setClassrooms([]);
              setCurrentClassroom(null);
            }
          });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user?.id, refreshClassrooms]);

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
