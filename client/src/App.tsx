import { useState } from "react";
import { checkHealth } from "./api.js";

type UiState = "idle" | "loading" | "success" | "error";

export default function App() {
  const [state, setState] = useState<UiState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  async function handleCheck() {
    setState("loading");
    setErrorMessage("");
    try {
      const res = await checkHealth();
      if (res.status === "ok") {
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
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <h1 className="h3 mb-4">
        TokTickIT <span className="text-success">IT Service Desk</span>
      </h1>

      <button className="btn btn-success" onClick={handleCheck} disabled={state === "loading"}>
        {state === "loading" ? "Loading…" : "Check System"}
      </button>

      {state === "success" && (
        <div className="alert alert-success mt-3" role="status">
          System Status: Online
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
