import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRequesters, RequesterUser } from "../api.js";
import { useRequester } from "../context/RequesterContext.js";

type UiState = "loading" | "success" | "error" | "empty";

export const RequesterSelectionScreen: React.FC = () => {
  const { setSelectedRequester } = useRequester();
  const navigate = useNavigate();
  const [requesters, setRequesters] = useState<RequesterUser[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [state, setState] = useState<UiState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const loadRequesters = async () => {
    setState("loading");
    setErrorMessage("");
    try {
      const data = await getRequesters();
      if (!data || data.length === 0) {
        setRequesters([]);
        setState("empty");
      } else {
        setRequesters(data);
        setSelectedId(data[0].id.toString());
        setState("success");
      }
    } catch (err: unknown) {
      setState("error");
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Unable to load requesters");
      }
    }
  };

  useEffect(() => {
    loadRequesters();
  }, []);

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    const req = requesters.find((r) => r.id.toString() === selectedId);
    if (req) {
      setSelectedRequester(req);
      navigate("/tickets");
    }
  };


  return (
    <div className="container py-5 d-flex justify-content-center">
      <div className="zg-card p-4 w-100" style={{ maxWidth: 480 }}>
        <div className="text-center mb-3">
          <div className="display-6 mb-2">👤</div>
          <h1 className="h4 font-weight-bold mb-2">Select Development Requester</h1>
          <p className="text-muted small">
            This is a temporary development testing mechanism to simulate being logged in as a specific Requester.
          </p>
        </div>

        {state === "loading" && (
          <div>
            <div className="mb-3">
              <label htmlFor="requesterSelect" className="form-label fw-medium">
                Development Requester
              </label>
              <select id="requesterSelect" className="form-select" disabled>
                <option>Loading requesters...</option>
              </select>
            </div>
            <button className="btn zg-btn-primary w-100 py-2" disabled>
              Continue
            </button>
          </div>
        )}

        {state === "error" && (
          <div className="alert alert-danger" role="alert">
            <div className="fw-bold mb-1">Error Loading Requesters</div>
            <div className="small mb-3">{errorMessage || "Unable to load requesters"}</div>
            <button className="btn btn-outline-danger btn-sm w-100" onClick={loadRequesters}>
              Retry
            </button>
          </div>
        )}

        {state === "empty" && (
          <div className="alert alert-warning text-center" role="status">
            <div className="fw-bold mb-1">No Active Requesters Found</div>
            <div className="small mb-3">
              Please check your seed data or database connection to populate active Development Requesters.
            </div>
            <button className="btn btn-outline-secondary btn-sm" onClick={loadRequesters}>
              Retry
            </button>
          </div>
        )}

        {state === "success" && (
          <form onSubmit={handleContinue}>
            <div className="mb-3">
              <label htmlFor="requesterSelect" className="form-label fw-medium">
                Development Requester <span className="text-danger">*</span>
              </label>
              <select
                id="requesterSelect"
                className="form-select"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                required
              >
                {requesters.map((req) => (
                  <option key={req.id} value={req.id}>
                    {req.name} ({req.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="zg-callout-info small mb-3">
              ℹ️ Only active development requesters are shown in this list.
            </div>

            <button type="submit" className="btn zg-btn-primary w-100 py-2 font-weight-bold">
              Continue
            </button>

            <div className="text-center mt-3 text-muted small">
              Note: Real authentication will be introduced in Lab 3.
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
