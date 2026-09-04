import React from "react";
import { useRequester } from "../context/RequesterContext.js";

export const AppHeader: React.FC = () => {
  const { selectedRequester, clearRequester } = useRequester();

  return (
    <header className="zg-header shadow-sm py-2 px-3">
      <div className="container-fluid d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-3">
          <span className="h4 mb-0 fw-bold tracking-tight text-white">TokTickIT</span>
          <span className="badge bg-light text-dark font-weight-normal small">IT Service Desk</span>
        </div>

        {selectedRequester && (
          <div className="d-flex align-items-center gap-3">
            <div className="text-end text-white">
              <div className="small opacity-75">Selected Requester</div>
              <div className="fw-semibold text-truncate" style={{ maxWidth: 200 }}>
                {selectedRequester.name}
              </div>
            </div>
            <button
              onClick={clearRequester}
              className="btn btn-sm btn-outline-light"
              aria-label="Change Requester"
            >
              Change Requester
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
