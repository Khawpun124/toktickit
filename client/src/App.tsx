import React, { useState } from "react";
import { RequesterProvider, useRequester } from "./context/RequesterContext.js";
import { AppHeader } from "./components/AppHeader.js";
import { RequesterSelectionScreen } from "./components/RequesterSelectionScreen.js";
import { CreateTicketScreen } from "./components/CreateTicketScreen.js";
import { MyTicketsScreen } from "./components/MyTicketsScreen.js";
import "./index.css";

type Tab = "my-tickets" | "create-ticket";

function MainContent({ activeTab, onSelectTab }: { activeTab: Tab; onSelectTab: (tab: Tab) => void }) {
  const { selectedRequester } = useRequester();

  if (!selectedRequester) {
    return <RequesterSelectionScreen />;
  }

  if (activeTab === "create-ticket") {
    return <CreateTicketScreen />;
  }

  return <MyTicketsScreen onNavigateToCreate={() => onSelectTab("create-ticket")} />;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("my-tickets");

  return (
    <RequesterProvider>
      <div className="min-vh-100 d-flex flex-column">
        <AppHeader activeTab={activeTab} onSelectTab={setActiveTab} />
        <main className="flex-grow-1">
          <MainContent activeTab={activeTab} onSelectTab={setActiveTab} />
        </main>
      </div>
    </RequesterProvider>
  );
}




