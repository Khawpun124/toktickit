import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getTicket,
  getAttachments,
  uploadAttachment,
  deleteAttachment,
  downloadAttachment,
  downloadAttachmentUrl,
  getPublicComments,
  postPublicComment,
  updateResolutionFlag,
  TicketDetail,
  AttachmentItem,
  PublicComment,
} from "../api.js";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  ALLOWED_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ACTIVE_ATTACHMENTS,
  MAX_REMOVAL_REASON_LENGTH,
} from "../constants.js";
import { useAuth } from "../context/AuthContext.js";

interface RequesterTicketDetailScreenProps {
  ticketId?: number;
  onBack?: () => void;
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
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();

  const activeTicketId = ticketId !== undefined ? ticketId : Number(params.id);

  const handleBack = () => {
    if (onBack) onBack();
    navigate("/tickets");
  };

  const handleUnauthorizedOrNotFound = () => {
    if (onBack) {
      onBack();
    }
    navigate("/tickets", {
      replace: true,
      state: { notification: "Ticket not found or access denied" },
    });
  };

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  // Upload state & message
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string>("");
  const [uploadSuccess, setUploadSuccess] = useState<string>("");
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const downloadingRef = useRef<number | null>(null);

  // Soft-remove modal state
  const [removeTarget, setRemoveTarget] = useState<AttachmentItem | null>(null);
  const [removeReason, setRemoveReason] = useState<string>("");
  const [removeReasonError, setRemoveReasonError] = useState<string>("");
  const [removing, setRemoving] = useState<boolean>(false);

  // Public Comments & Resolution Flag state
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [commentText, setCommentText] = useState<string>("");
  const [commentError, setCommentError] = useState<string>("");
  const [submittingComment, setSubmittingComment] = useState<boolean>(false);
  const [showResolveModal, setShowResolveModal] = useState<boolean>(false);
  const [updatingResolution, setUpdatingResolution] = useState<boolean>(false);

  const handleDownloadAttachment = async (att: AttachmentItem) => {
    if (downloadingRef.current === att.id) return;

    downloadingRef.current = att.id;
    setDownloadingId(att.id);
    setUploadError("");
    setUploadSuccess("");

    try {
      await downloadAttachment(att.id, att.fileName);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setUploadError(`Failed to download "${att.fileName}": ${err.message}`);
      } else {
        setUploadError(`Failed to download "${att.fileName}"`);
      }
    } finally {
      downloadingRef.current = null;
      setDownloadingId(null);
    }
  };

  const fetchTicketData = async () => {
    if (isNaN(activeTicketId) || activeTicketId <= 0) {
      handleUnauthorizedOrNotFound();
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [ticketData, attachmentData, commentData] = await Promise.all([
        getTicket(activeTicketId),
        getAttachments(activeTicketId),
        getPublicComments(activeTicketId).catch(() => []),
      ]);
      setTicket(ticketData);
      setAttachments(attachmentData);
      setComments(commentData);
    } catch (err: unknown) {
      handleUnauthorizedOrNotFound();
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchTicketData();
  }, [activeTicketId]);

  const handleConfirmResolve = async () => {
    if (!ticket) return;
    setUpdatingResolution(true);
    try {
      await updateResolutionFlag(activeTicketId);
      setTicket((prev) => (prev ? { ...prev, problemAppearsResolved: true } : prev));
      setShowResolveModal(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update resolution flag");
    } finally {
      setUpdatingResolution(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed) {
      setCommentError("Comment content cannot be empty or whitespace only");
      return;
    }
    if (trimmed.length > 2000) {
      setCommentError("Comment content must not exceed 2000 characters");
      return;
    }

    setSubmittingComment(true);
    setCommentError("");

    try {
      const newComment = await postPublicComment(activeTicketId, trimmed);
      setComments((prev) => [...prev, newComment]);
      setCommentText("");
    } catch (err: unknown) {
      setCommentError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setSubmittingComment(false);
    }
  };


  const activeAttachments = attachments.filter((att) => att.removedAt === null);
  const removedAttachments = attachments.filter((att) => att.removedAt !== null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
      const newAtt = await uploadAttachment(activeTicketId, file);
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
    if (!removeTarget) return;

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
      const updated = await deleteAttachment(removeTarget.id, removeReason.trim());
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
        <button className="btn btn-outline-secondary btn-sm mb-3" onClick={handleBack}>
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
        <button className="btn btn-outline-secondary btn-sm" onClick={handleBack}>
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
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span
              className="badge px-3 py-2"
              style={{ backgroundColor: "var(--zg-pale)", color: "var(--zg-secondary)" }}
            >
              ● {ticket.currentStatus}
            </span>

            {ticket.problemAppearsResolved ? (
              <span className="badge bg-success text-white px-3 py-2">
                ✓ Problem Appears Resolved
              </span>
            ) : (
              ticket.currentStatus !== "CLOSED" &&
              ticket.currentStatus !== "CANCELLED" && (
                <button
                  type="button"
                  className="btn btn-outline-success btn-sm px-3"
                  onClick={() => setShowResolveModal(true)}
                >
                  Mark problem as resolved
                </button>
              )
            )}
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
            <div className="fw-medium">{user?.name}</div>
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

      {/* Public Comments Panel */}
      <div className="zg-card p-4 mb-4">
        <h2 className="h5 font-weight-bold mb-3">Public Comments ({comments.length})</h2>

        {/* Comment Thread */}
        {comments.length === 0 ? (
          <div className="text-center text-muted p-4 border rounded bg-light small mb-4">
            No public comments yet.
          </div>
        ) : (
          <div className="d-flex flex-column gap-3 mb-4">
            {comments.map((c) => {
              const isStaff = c.authorRole === "IT_STAFF" || c.authorRole === "ADMINISTRATOR";
              return (
                <div key={c.id} className={`p-3 rounded border ${isStaff ? "bg-light border-primary" : "bg-white"}`}>
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <div className="d-flex align-items-center gap-2">
                      <span className="fw-bold small">{c.authorName}</span>
                      <span className={`badge ${isStaff ? "bg-primary" : "bg-secondary"} text-white`}>
                        {c.authorRole}
                      </span>
                    </div>
                    <span className="small text-muted">{formatDate(c.createdAt)}</span>
                  </div>
                  <div className="text-dark small text-break" style={{ whiteSpace: "pre-wrap" }}>
                    {c.content}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add Comment Form */}
        <form onSubmit={handlePostComment}>
          <div className="mb-2">
            <label htmlFor="publicCommentInput" className="form-label small fw-bold">
              Add Public Comment
            </label>
            <textarea
              id="publicCommentInput"
              className={`form-control form-control-sm ${commentError ? "is-invalid" : ""}`}
              rows={3}
              maxLength={2000}
              placeholder="Write a public comment..."
              value={commentText}
              onChange={(e) => {
                setCommentText(e.target.value);
                if (commentError) setCommentError("");
              }}
              disabled={submittingComment}
            ></textarea>
            {commentError && <div className="invalid-feedback small">{commentError}</div>}
          </div>
          <div className="d-flex justify-content-between align-items-center">
            <span className="small text-muted">{commentText.length}/2000 characters</span>
            <button
              type="submit"
              className="btn btn-sm zg-btn-primary px-3"
              disabled={submittingComment || !commentText.trim()}
            >
              {submittingComment ? "Posting..." : "+ Post Comment"}
            </button>
          </div>
        </form>
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
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm px-3"
                          aria-label={`Download ${att.fileName}`}
                          onClick={() => handleDownloadAttachment(att)}
                          disabled={downloadingId === att.id}
                        >
                          {downloadingId === att.id ? "Downloading..." : "Download"}
                        </button>
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

      {/* Mark Problem as Resolved Confirmation Modal */}
      {showResolveModal && (
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
                <h5 className="modal-title h6">Mark Problem as Resolved</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowResolveModal(false)}
                  disabled={updatingResolution}
                  aria-label="Close"
                ></button>
              </div>

              <div className="modal-body">
                <p className="small mb-0">
                  Are you sure you want to mark this problem as resolved? This indicates to IT Staff that your issue appears resolved, but it does not formally close or cancel the ticket.
                </p>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setShowResolveModal(false)}
                  disabled={updatingResolution}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-success px-3"
                  onClick={handleConfirmResolve}
                  disabled={updatingResolution}
                >
                  {updatingResolution ? "Submitting..." : "Confirm Resolution"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

