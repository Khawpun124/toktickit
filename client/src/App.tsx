import React, { useState } from "react";
import { RequesterProvider, useRequester } from "./context/RequesterContext.js";
import { AppHeader } from "./components/AppHeader.js";
import { RequesterSelectionScreen } from "./components/RequesterSelectionScreen.js";
import { checkHealth, getCategories, Category } from "./api.js";
import "./index.css";

type UiState = "idle" | "loading" | "success" | "error";

function MainContent() {
  const { selectedRequester } = useRequester();
  const [state, setState] = useState<UiState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [categories, setCategories] = useState<Category[]>([]);

  if (!selectedRequester) {
    return <RequesterSelectionScreen />;
  }

  async function handleCheck() {
    setState("loading");
    setErrorMessage("");
    setCategories([]);
    try {
      const res = await checkHealth();
      if (res.status === "ok") {
        const catList = await getCategories();
        setCategories(catList);
        setState("success");
      } else {
        setState("error");
        setErrorMessage("Unable to connect to TokTickIT API");
      }
    } catch (err: unknown) {
      setState("error");
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Unable to connect to TokTickIT API");
      }
    }
  }

  return (
    <div className="container py-4" style={{ maxWidth: 640 }}>
      <div className="alert alert-success mb-4">
        <h5 className="alert-heading mb-1">Development Requester Active</h5>
        <div>
          Current Requester Context: <strong>{selectedRequester.name}</strong> ({selectedRequester.email})
        </div>
      </div>

      <h1 className="h3 mb-4">
        TokTickIT <span className="text-success">IT Service Desk</span>
      </h1>

      <button className="btn btn-success" onClick={handleCheck} disabled={state === "loading"}>
        {state === "loading" ? "Loading…" : "Check System"}
      </button>

      {state === "success" && (
        <div className="alert alert-success mt-3" role="status">
          <div>System Status: Online</div>
          {categories.length > 0 && (
            <div className="mt-3">
              <div className="fw-bold mb-2">Supported Request Categories:</div>
              <ul className="mb-0 ps-3">
                {categories.map((cat) => (
                  <li key={cat.id}>{cat.name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {state === "error" && (
        <div className="alert alert-danger mt-3" role="alert">
          <div><strong>System Status: Offline</strong></div>
          <div>{errorMessage || "Unable to connect to TokTickIT API"}</div>
        </div>
      )}
    </div>
  );
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



