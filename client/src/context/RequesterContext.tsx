import React, { createContext, useContext, useState, useEffect } from "react";
import { RequesterUser } from "../api.js";

interface RequesterContextType {
  selectedRequester: RequesterUser | null;
  setSelectedRequester: (requester: RequesterUser | null) => void;
  clearRequester: () => void;
}

const STORAGE_KEY = "toktickit_selected_requester";

const RequesterContext = createContext<RequesterContextType | undefined>(undefined);

export const RequesterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedRequester, setSelectedRequesterState] = useState<RequesterUser | null>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const setSelectedRequester = (requester: RequesterUser | null) => {
    setSelectedRequesterState(requester);
    try {
      if (requester) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(requester));
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore storage write errors
    }
  };

  const clearRequester = () => {
    setSelectedRequester(null);
  };

  return (
    <RequesterContext.Provider value={{ selectedRequester, setSelectedRequester, clearRequester }}>
      {children}
    </RequesterContext.Provider>
  );
};

export const useRequester = (): RequesterContextType => {
  const context = useContext(RequesterContext);
  if (!context) {
    throw new Error("useRequester must be used within a RequesterProvider");
  }
  return context;
};
