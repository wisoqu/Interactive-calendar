import React, { createContext, useContext, useState, useEffect } from "react";
import { User, Classroom } from "../types";
import { apiClient } from "../api/client";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  classrooms: Classroom[];
  currentClassroom: Classroom | null;
  refreshUser: () => Promise<void>;
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

  const refreshUser = async () => {
    try {
      const data = await apiClient.me();
      setUser({ id: data.id, username: data.username, email: data.email });
    } catch (e) {
      setUser(null);
      setClassrooms([]);
      setCurrentClassroom(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshClassrooms = async () => {
    if (!user) return;
    try {
      const data = await apiClient.listClassrooms();
      setClassrooms(data);
      
      // Update selected classroom if it exists in the new list to keep details fresh
      if (currentClassroom) {
        const found = data.find(c => c.id === currentClassroom.id);
        if (found) {
          setCurrentClassroom(found);
        } else {
          setCurrentClassroom(data[0] || null);
        }
      } else if (data.length > 0) {
        setCurrentClassroom(data[0]);
      }
    } catch (e) {
      console.error("Failed to query classrooms", e);
    }
  };

  const selectClassroom = (classroom: Classroom | null) => {
    setCurrentClassroom(classroom);
  };

  const logout = async () => {
    try {
      await apiClient.logout();
    } catch (e) {
      console.error(e);
    } finally {
      setUser(null);
      setClassrooms([]);
      setCurrentClassroom(null);
    }
  };

  // Run on mount to auto-identify logged in session cookies
  useEffect(() => {
    refreshUser();
  }, []);

  // Sync classrooms list with authenticated user status
  useEffect(() => {
    if (user) {
      refreshClassrooms();
    }
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        classrooms,
        currentClassroom,
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
