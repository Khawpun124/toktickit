import React, { useEffect, useState } from "react";
import {
  getTicket,
  getAttachments,
  uploadAttachment,
  deleteAttachment,
  downloadAttachmentUrl,
  TicketDetail,
  AttachmentItem,
} from "../api.js";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  ALLOWED_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ACTIVE_ATTACHMENTS,
  MAX_REMOVAL_REASON_LENGTH,
} from "../constants.js";
import { useRequester } from "../context/RequesterContext.js";

interface RequesterTicketDetailScreenProps {
  ticketId: number;
  onBack: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

export const RequesterTicketDetailScreen: React.FC<RequesterTicketDetailScreenProps> = ({
  ticketId,
  onBack,
}) => {
  const { selectedRequester } = useRequester();

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  // Upload state & message
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string>("");
  const [uploadSuccess, setUploadSuccess] = useState<string>("");

  // Soft-remove modal state
  const [removeTarget, setRemoveTarget] = useState<AttachmentItem | null>(null);
  const [removeReason, setRemoveReason] = useState<string>("");
  const [removeReasonError, setRemoveReasonError] = useState<string>("");
  const [removing, setRemoving] = useState<boolean>(false);

  const fetchTicketData = async () => {
    if (!selectedRequester) return;

    setLoading(true);
    setError("");

    try {
      const [ticketData, attachmentData] = await Promise.all([
        getTicket(ticketId, selectedRequester.id),
        getAttachments(ticketId, selectedRequester.id),
      ]);
      setTicket(ticketData);
      setAttachments(attachmentData);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unable to load ticket details");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTicketData();
  }, [ticketId, selectedRequester]);

  const activeAttachments = attachments.filter((att) => att.removedAt === null);
  const removedAttachments = attachments.filter((att) => att.removedAt !== null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedRequester) return;

    setUploadError("");
    setUploadSuccess("");

    // Client-side Validation (BR-21, BR-22, BR-23)
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

    if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.type) && !ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
      setUploadError("Only JPG, PNG, WEBP, and PDF files are allowed");
      e.target.value = "";
      return;
    }

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      setUploadError("File exceeds the 5 MB limit");
      e.target.value = "";
      return;
    }

    if (activeAttachments.length >= MAX_ACTIVE_ATTACHMENTS) {
      setUploadError("A ticket may have at most 5 active attachments");
      e.target.value = "";
      return;
    }

    setUploading(true);

    try {
      const newAtt = await uploadAttachment(ticketId, file, selectedRequester.id);
      setAttachments((prev) => [...prev, newAtt]);
      setUploadSuccess(`Attachment "${newAtt.fileName}" uploaded successfully.`);
      e.target.value = "";
    } catch (err: unknown) {
      if (err instanceof Error) {
        setUploadError(err.message);
      } else {
        setUploadError("Failed to upload attachment");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleOpenRemoveModal = (att: AttachmentItem) => {
    setRemoveTarget(att);
    setRemoveReason("");
    setRemoveReasonError("");
  };

  const handleConfirmRemove = async () => {
    if (!removeTarget || !selectedRequester) return;

    const trimmed = removeReason.trim();
    if (!trimmed) {
      setRemoveReasonError("A removal reason is required");
      return;
    }

    if (trimmed.length > MAX_REMOVAL_REASON_LENGTH) {
      setRemoveReasonError("Removal reason must not exceed 500 characters");
      return;
    }

    setRemoving(true);
    setRemoveReasonError("");

    try {
      const updated = await deleteAttachment(removeTarget.id, removeReason.trim(), selectedRequester.id);
      setAttachments((prev) =>
        prev.map((att) =>
          att.id === updated.id
            ? { ...att, removedAt: updated.removedAt, removedReason: updated.removedReason }
            : att
        )
      );
      setRemoveTarget(null);
      setRemoveReason("");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setRemoveReasonError(err.message);
      } else {
        setRemoveReasonError("Unable to remove attachment");
      }
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <div className="container py-4 text-center">
        <div className="spinner-border text-success my-5" role="status">
          <span className="visually-hidden">Loading ticket details...</span>
        </div>
        <p className="text-muted small">Loading ticket details...</p>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="container py-4">
        <button className="btn btn-outline-secondary btn-sm mb-3" onClick={onBack}>
          ← Back to My Tickets
        </button>
        <div className="alert alert-danger text-center my-4" role="alert">
          <div className="fw-bold mb-1">Ticket Not Found</div>
          <div className="small mb-3">{error || "Ticket not found"}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4">
      {/* Header Controls */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <button className="btn btn-outline-secondary btn-sm" onClick={onBack}>
          ← Back to My Tickets
        </button>
        <div className="small text-muted font-monospace">{ticket.ticketNumber}</div>
      </div>

      {/* Read-only Header Card (BR-30) */}
      <div className="zg-card p-4 mb-4">
        <div className="border-bottom pb-3 mb-4 d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div>
            <h1 className="h4 font-weight-bold mb-1 text-dark">{ticket.summary}</h1>
            <div className="small text-muted">Created on {formatDate(ticket.createdAt)}</div>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span
              className="badge px-3 py-2"
              style={{ backgroundColor: "var(--zg-pale)", color: "var(--zg-secondary)" }}
            >
              ● {ticket.currentStatus}
            </span>
          </div>
        </div>

        {/* Read-only Header Grid */}
        <div className="row g-3 mb-4">
          <div className="col-12 col-sm-6 col-md-3">
            <div className="small text-muted mb-1">Ticket Number</div>
            <div className="fw-bold font-monospace text-success">{ticket.ticketNumber}</div>
          </div>
          <div className="col-12 col-sm-6 col-md-3">
            <div className="small text-muted mb-1">Category</div>
            <div className="fw-medium">{ticket.categoryName}</div>
          </div>
          <div className="col-12 col-sm-6 col-md-3">
            <div className="small text-muted mb-1">Related System</div>
            <div className="fw-medium">{ticket.relatedSystemName}</div>
          </div>
          <div className="col-12 col-sm-6 col-md-3">
            <div className="small text-muted mb-1">Requester</div>
            <div className="fw-medium">{selectedRequester?.name}</div>
          </div>

          <div className="col-12 col-sm-6 col-md-3">
            <div className="small text-muted mb-1">Requested Priority</div>
            <div>
              {ticket.requestedPriority === "HIGH" && (
                <span className="badge bg-danger text-white">🔴 High</span>
              )}
              {ticket.requestedPriority === "MEDIUM" && (
                <span className="badge bg-warning text-dark">🟡 Medium</span>
              )}
              {ticket.requestedPriority === "LOW" && (
                <span className="badge bg-secondary text-white">🟢 Low</span>
              )}
            </div>
          </div>

          <div className="col-12 col-sm-6 col-md-3">
            <div className="small text-muted mb-1">IT Priority</div>
            <div>
              {ticket.itPriority === "HIGH" && <span className="badge bg-danger">🔴 High</span>}
              {ticket.itPriority === "MEDIUM" && (
                <span className="badge bg-warning text-dark">🟡 Medium</span>
              )}
              {ticket.itPriority === "LOW" && <span className="badge bg-secondary">🟢 Low</span>}
              {!ticket.itPriority && (
                <span className="badge bg-light text-muted border opacity-75">
                  Not yet assigned
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Read-only Description */}
        <div>
          <div className="small text-muted mb-1">Description</div>
          <div
            className="p-3 rounded bg-light border text-break"
            style={{ whiteSpace: "pre-wrap", fontSize: "0.95rem" }}
          >
            {ticket.description}
          </div>
        </div>
      </div>

      {/* Attachments Section */}
      <div className="zg-card p-4">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2 className="h5 font-weight-bold mb-0">Attachments ({activeAttachments.length}/5 active)</h2>

          {/* Add Attachment Control */}
          <label
            className={`btn btn-sm zg-btn-primary ${
              activeAttachments.length >= 5 || uploading ? "disabled" : ""
            }`}
            style={{ cursor: activeAttachments.length >= 5 || uploading ? "not-allowed" : "pointer" }}
          >
            {uploading ? "Uploading..." : "+ Add Attachment"}
            <input
              type="file"
              className="d-none"
              onChange={handleFileSelect}
              disabled={activeAttachments.length >= 5 || uploading}
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
              aria-label="Upload Attachment"
            />
          </label>
        </div>

        <p className="small text-muted mb-3">
          Allowed formats: JPG, PNG, WEBP, PDF (max 5 MB per file, max 5 active attachments).
        </p>

        {uploadError && (
          <div className="alert alert-danger alert-dismissible py-2 mb-3" role="alert">
            <div className="small">{uploadError}</div>
          </div>
        )}

        {uploadSuccess && (
          <div className="alert alert-success alert-dismissible py-2 mb-3" role="alert">
            <div className="small">{uploadSuccess}</div>
          </div>
        )}

        {/* Attachments List */}
        {attachments.length === 0 ? (
          <div className="text-center text-muted p-4 border rounded bg-light small">
            No attachments added yet.
          </div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {attachments.map((att) => {
              const isRemoved = att.removedAt !== null;

              return (
                <div
                  key={att.id}
                  className={`p-3 border rounded d-flex align-items-center justify-content-between flex-wrap gap-2 ${
                    isRemoved ? "bg-light text-muted opacity-75" : "bg-white"
                  }`}
                >
                  <div className="d-flex align-items-center gap-3">
                    <span className="fs-4">{isRemoved ? "📄" : "📎"}</span>
                    <div>
                      <div className={`fw-medium ${isRemoved ? "text-decoration-line-through" : ""}`}>
                        {att.fileName}
                      </div>
                      <div className="small text-muted">
                        {formatFileSize(att.sizeBytes)} • Uploaded {formatDate(att.uploadedAt)}
                        {isRemoved && (
                          <span className="text-danger ms-2">
                            [Removed {formatDate(att.removedAt!)} — Reason: {att.removedReason}]
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="d-flex align-items-center gap-2">
                    {!isRemoved ? (
                      <>
                        <a
                          href={downloadAttachmentUrl(att.id)}
                          target="_blank"
                          rel="noreferrer"
                          download={att.fileName}
                          className="btn btn-outline-primary btn-sm px-3"
                          aria-label={`Download ${att.fileName}`}
                        >
                          Download
                        </a>
                        <button
                          className="btn btn-outline-danger btn-sm px-3"
                          onClick={() => handleOpenRemoveModal(att)}
                          aria-label={`Remove ${att.fileName}`}
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <span className="badge bg-secondary opacity-75">Removed</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Soft-Remove Confirmation Modal */}
      {removeTarget && (
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title h6">Remove Attachment</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setRemoveTarget(null)}
                  disabled={removing}
                  aria-label="Close"
                ></button>
              </div>

              <div className="modal-body">
                <p className="small mb-3">
                  Are you sure you want to remove <strong>{removeTarget.fileName}</strong>? The file will remain visible as removed metadata, but will no longer be downloadable.
                </p>

                <div className="mb-3">
                  <label htmlFor="removeReasonInput" className="form-label small fw-bold">
                    Removal Reason <span className="text-danger">*</span>
                  </label>
                  <textarea
                    id="removeReasonInput"
                    className={`form-control form-control-sm ${removeReasonError ? "is-invalid" : ""}`}
                    rows={3}
                    maxLength={MAX_REMOVAL_REASON_LENGTH}
                    placeholder="Enter reason for removing this attachment..."
                    value={removeReason}
                    onChange={(e) => setRemoveReason(e.target.value)}
                    disabled={removing}
                  ></textarea>
                  {removeReasonError && (
                    <div className="invalid-feedback small">{removeReasonError}</div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setRemoveTarget(null)}
                  disabled={removing}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger px-3"
                  onClick={handleConfirmRemove}
                  disabled={removing}
                >
                  {removing ? "Removing..." : "Confirm Removal"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
