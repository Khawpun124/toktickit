import React, { useState } from "react";
import { RequesterProvider, useRequester } from "./context/RequesterContext.js";
import { AppHeader } from "./components/AppHeader.js";
import { RequesterSelectionScreen } from "./components/RequesterSelectionScreen.js";
import { CreateTicketScreen } from "./components/CreateTicketScreen.js";
import { MyTicketsScreen } from "./components/MyTicketsScreen.js";
import { RequesterTicketDetailScreen } from "./components/RequesterTicketDetailScreen.js";
import "./index.css";

type Tab = "my-tickets" | "create-ticket";

function MainContent({
  activeTab,
  onSelectTab,
  selectedTicketId,
  onSelectTicket,
}: {
  activeTab: Tab;
  onSelectTab: (tab: Tab) => void;
  selectedTicketId: number | null;
  onSelectTicket: (id: number | null) => void;
}) {
  const { selectedRequester } = useRequester();

  if (!selectedRequester) {
    return <RequesterSelectionScreen />;
  }

  if (selectedTicketId !== null) {
    return (
      <RequesterTicketDetailScreen
        ticketId={selectedTicketId}
        onBack={() => onSelectTicket(null)}
      />
    );
  }

  if (activeTab === "create-ticket") {
    return <CreateTicketScreen />;
  }

  return (
    <MyTicketsScreen
      onNavigateToCreate={() => onSelectTab("create-ticket")}
      onSelectTicket={(id) => onSelectTicket(id)}
    />
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("my-tickets");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

  const handleSelectTab = (tab: Tab) => {
    setSelectedTicketId(null);
    setActiveTab(tab);
  };

  return (
    <RequesterProvider>
      <div className="min-vh-100 d-flex flex-column">
        <AppHeader activeTab={activeTab} onSelectTab={handleSelectTab} />
        <main className="flex-grow-1">
          <MainContent
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            selectedTicketId={selectedTicketId}
            onSelectTicket={setSelectedTicketId}
          />
        </main>
      </div>
    </RequesterProvider>
  );
}




