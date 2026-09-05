import React from "react";
import { RequesterProvider, useRequester } from "./context/RequesterContext.js";
import { AppHeader } from "./components/AppHeader.js";
import { RequesterSelectionScreen } from "./components/RequesterSelectionScreen.js";
import { CreateTicketScreen } from "./components/CreateTicketScreen.js";
import "./index.css";

function MainContent() {
  const { selectedRequester } = useRequester();

  if (!selectedRequester) {
    return <RequesterSelectionScreen />;
  }

  return <CreateTicketScreen />;
}


export default function App() {
  return (
    <RequesterProvider>
      <div className="min-vh-100 d-flex flex-column">
        <AppHeader />
        <main className="flex-grow-1">
          <MainContent />
        </main>
      </div>
    </RequesterProvider>
  );
}



