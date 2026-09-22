import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import {
  getStaffTicketDetail,
  StaffTicketDetail,
  getStaffUsers,
  StaffUserItem,
  getPublicComments,
  postPublicComment,
  PublicComment,
  getInternalNotes,
  postInternalNote,
  InternalNote,
  claimTicketOwner,
  setItPriority,
  setTicketStatus,
  getAttachments,
  AttachmentItem,
  downloadAttachment,
} from "../api.js";

// ---------------------------------------------------------------------------
// Status Transition Matrix (mirrors backend BR-11) — O(1) lookup
// ---------------------------------------------------------------------------
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["OPEN"],
  CANCELLED: [],
};

// Statuses that require user confirmation before applying
const CONFIRM_TRANSITIONS = new Set(["CANCELLED", "RESOLVED", "CLOSED", "REOPENED"]);

// Active (non-terminal) statuses — CLOSED and CANCELLED are terminal
const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_REQUESTER: "Waiting for Requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
};

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------
const getPriorityBadgeClass = (priority: string | null) => {
  switch (priority) {
    case "HIGH":   return "badge bg-danger";
    case "MEDIUM": return "badge bg-warning text-dark";
    case "LOW":    return "badge bg-info text-dark";
    default:       return "badge bg-light text-muted";
  }
};

const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case "NEW":                  return "bg-primary text-white";
    case "OPEN":                 return "bg-info text-dark";
    case "IN_PROGRESS":          return "bg-warning text-dark";
    case "WAITING_FOR_REQUESTER":return "bg-secondary text-white";
    case "RESOLVED":             return "bg-success text-white";
    case "CLOSED":               return "bg-dark text-white";
    case "REOPENED":             return "bg-danger text-white";
    case "CANCELLED":            return "bg-light text-muted border";
    default:                     return "bg-secondary text-white";
  }
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export const StaffTicketDetailScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // ── Page state ──────────────────────────────────────────────────────────
  const [ticket, setTicket] = useState<StaffTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [is404, setIs404] = useState(false);
  const [is403, setIs403] = useState(false);

  // ── Staff users list (for owner dropdown) ───────────────────────────────
  const [staffUsers, setStaffUsers] = useState<StaffUserItem[]>([]);

  // ── Operations panel state ───────────────────────────────────────────────
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [prioritySaving, setPrioritySaving] = useState(false);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // ── Tabs ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"comments" | "notes" | "attachments">("comments");

  // ── Public Comments ──────────────────────────────────────────────────────
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentContent, setCommentContent] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  // ── Internal Notes ───────────────────────────────────────────────────────
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  // ── Attachments ──────────────────────────────────────────────────────────
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // ── Success flash ────────────────────────────────────────────────────────
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Load ticket ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    if (user.role === "REQUESTER") { setIs403(true); setLoading(false); return; }
    if (!id) { setIs404(true); setLoading(false); return; }

    let isMounted = true;
    setLoading(true);
    setError(null);

    Promise.all([
      getStaffTicketDetail(id),
      getStaffUsers(),
    ])
      .then(([ticketData, usersData]) => {
        if (!isMounted) return;
        setTicket(ticketData);
        setStaffUsers(usersData);
        setLoading(false);
      })
      .catch((err: any) => {
        if (!isMounted) return;
        if (err.status === 403 || err.message === "Forbidden") setIs403(true);
        else if (err.status === 404 || err.message === "Ticket not found") setIs404(true);
        else setError(err.message || "Unable to load ticket detail");
        setLoading(false);
      });

    return () => { isMounted = false; };
  }, [id, user]);

  // ── Load tab data on tab switch ──────────────────────────────────────────
  const loadComments = useCallback(async () => {
    if (!ticket) return;
    setCommentsLoading(true);
    try {
      const data = await getPublicComments(ticket.id);
      setComments(data);
    } catch { /* non-fatal */ }
    setCommentsLoading(false);
  }, [ticket]);

  const loadNotes = useCallback(async () => {
    if (!ticket) return;
    setNotesLoading(true);
    try {
      const data = await getInternalNotes(ticket.id);
      setNotes(data);
    } catch { /* non-fatal */ }
    setNotesLoading(false);
  }, [ticket]);

  const loadAttachments = useCallback(async () => {
    if (!ticket) return;
    setAttachmentsLoading(true);
    try {
      const data = await getAttachments(ticket.id);
      setAttachments(data);
    } catch { /* non-fatal */ }
    setAttachmentsLoading(false);
  }, [ticket]);

  useEffect(() => {
    if (!ticket) return;
    if (activeTab === "comments") loadComments();
    else if (activeTab === "notes") loadNotes();
    else loadAttachments();
  }, [activeTab, ticket, loadComments, loadNotes, loadAttachments]);

  // ── Flash helper ─────────────────────────────────────────────────────────
  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // ── Operations handlers ──────────────────────────────────────────────────

  /** Owner dropdown change */
  const handleOwnerChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!ticket) return;
    const val = e.target.value;
    const newOwnerId = val === "" ? null : parseInt(val, 10);

    setOwnerError(null);
    setOwnerSaving(true);
    try {
      const res = await claimTicketOwner(ticket.id, newOwnerId);
      const ownerUser = newOwnerId != null ? staffUsers.find((u) => u.id === newOwnerId) : null;
      setTicket((prev) =>
        prev
          ? { ...prev, ticketOwnerId: res.ticketOwnerId, ticketOwnerName: res.ticketOwnerName }
          : prev
      );
      flash(ownerUser ? `Owner set to ${ownerUser.name}` : "Ticket unassigned");
    } catch (err: any) {
      setOwnerError(err.message || "Unable to update owner");
    } finally {
      setOwnerSaving(false);
    }
  };

  /** IT Priority dropdown change */
  const handlePriorityChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!ticket) return;
    const val = e.target.value as "LOW" | "MEDIUM" | "HIGH";
    setPriorityError(null);
    setPrioritySaving(true);
    try {
      await setItPriority(ticket.id, val);
      setTicket((prev) => prev ? { ...prev, itPriority: val } : prev);
      flash(`IT Priority set to ${val}`);
    } catch (err: any) {
      setPriorityError(err.message || "Unable to update priority");
    } finally {
      setPrioritySaving(false);
    }
  };

  /** Status dropdown change — requires confirmation for certain transitions */
  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!ticket) return;
    const newStatus = e.target.value;
    if (!newStatus) return;

    // Confirmation for irreversible or high-impact transitions
    if (CONFIRM_TRANSITIONS.has(newStatus)) {
      const label = STATUS_LABELS[newStatus] ?? newStatus;
      const confirmed = window.confirm(
        `Transition ticket to "${label}"?\n\nThis action may be difficult to reverse. Please confirm.`
      );
      if (!confirmed) {
        // Reset dropdown visual
        e.target.value = "";
        return;
      }
    }

    setStatusError(null);
    setStatusSaving(true);
    try {
      await setTicketStatus(ticket.id, newStatus);
      setTicket((prev) => prev ? { ...prev, currentStatus: newStatus } : prev);
      flash(`Status changed to ${STATUS_LABELS[newStatus] ?? newStatus}`);
    } catch (err: any) {
      setStatusError(
        err.from && err.to
          ? `Cannot transition from ${err.from} to ${err.to}`
          : err.message || "Unable to update status"
      );
    } finally {
      setStatusSaving(false);
    }
  };

  // ── Comment submit ───────────────────────────────────────────────────────
  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !commentContent.trim()) return;
    setCommentError(null);
    setCommentSaving(true);
    try {
      const newComment = await postPublicComment(ticket.id, commentContent.trim());
      setComments((prev) => [...prev, newComment]);
      setCommentContent("");
    } catch (err: any) {
      setCommentError(err.message || "Unable to post comment");
    } finally {
      setCommentSaving(false);
    }
  };

  // ── Note submit ──────────────────────────────────────────────────────────
  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !noteContent.trim()) return;
    setNoteError(null);
    setNoteSaving(true);
    try {
      const newNote = await postInternalNote(ticket.id, noteContent.trim());
      setNotes((prev) => [...prev, newNote]);
      setNoteContent("");
    } catch (err: any) {
      setNoteError(err.message || "Unable to post internal note");
    } finally {
      setNoteSaving(false);
    }
  };

  // ── Attachment download ──────────────────────────────────────────────────
  const handleDownload = async (att: AttachmentItem) => {
    setDownloadError(null);
    try {
      await downloadAttachment(att.id, att.fileName);
    } catch (err: any) {
      setDownloadError(err.message || "Unable to download attachment");
    }
  };

  // ── Guard rendering ──────────────────────────────────────────────────────
  if (is403) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger shadow-sm" role="alert">
          <h4 className="alert-heading fw-bold">403 Forbidden</h4>
          <p className="mb-0">Access denied. You do not have permission to view IT Staff Ticket Details.</p>
        </div>
      </div>
    );
  }

  if (is404) {
    return (
      <div className="container py-5">
        <div className="alert alert-warning shadow-sm" role="alert">
          <h4 className="alert-heading fw-bold">404 Not Found</h4>
          <p className="mb-3">The requested ticket does not exist or could not be found.</p>
          <button onClick={() => navigate("/staff/tickets")} className="btn btn-sm btn-outline-secondary">
            ← Back to Queue
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div className="spinner-border text-success mx-auto mb-2" role="status">
          <span className="visually-hidden">Loading ticket details...</span>
        </div>
        <div className="text-muted small">Loading IT Staff Ticket Details...</div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger shadow-sm mb-3" role="alert">{error || "Unable to load ticket details"}</div>
        <button onClick={() => navigate("/staff/tickets")} className="btn btn-sm btn-outline-secondary">
          ← Back to Queue
        </button>
      </div>
    );
  }

  const allowedNext = ALLOWED_TRANSITIONS[ticket.currentStatus] ?? [];

  // ── Full render ──────────────────────────────────────────────────────────
  return (
    <div className="container py-4">
      {/* Success flash */}
      {successMsg && (
        <div
          className="alert alert-success alert-dismissible py-2 shadow-sm mb-3"
          role="alert"
          style={{ position: "sticky", top: 0, zIndex: 100 }}
        >
          ✓ {successMsg}
        </div>
      )}

      {/* Header */}
      <div className="mb-4">
        <button
          id="staff-ticket-detail-back-btn"
          onClick={() => navigate("/staff/tickets")}
          className="btn btn-sm btn-outline-secondary mb-3"
        >
          ← Back to Queue
        </button>
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2">
          <div>
            <span className="h4 fw-bold text-primary me-2">{ticket.ticketNumber}</span>
            <span className={`badge ${getStatusBadgeClass(ticket.currentStatus)} me-2`}>
              {STATUS_LABELS[ticket.currentStatus] ?? ticket.currentStatus}
            </span>
            {ticket.problemAppearsResolved && (
              <span className="badge bg-warning text-dark ms-1">Problem Appears Resolved</span>
            )}
          </div>
          <div className="small text-muted">
            Created: {new Date(ticket.createdAt).toLocaleString()} &nbsp;|&nbsp;
            Updated: {new Date(ticket.updatedAt).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="row g-4">
        {/* ── Left: Ticket Info ──────────────────────────────────────────── */}
        <div className="col-12 col-lg-8">
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-light fw-bold py-3">Ticket Information</div>
            <div className="card-body p-4">
              <div className="row g-3 mb-4">
                <div className="col-12 col-md-6">
                  <label className="form-label small text-muted mb-1">Requester</label>
                  <div className="fw-semibold text-dark">
                    {ticket.requesterName}
                    <span className="text-muted fw-normal"> ({ticket.requesterEmail})</span>
                  </div>
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label small text-muted mb-1">Category</label>
                  <div className="fw-semibold text-dark">{ticket.categoryName}</div>
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label small text-muted mb-1">Related System</label>
                  <div className="fw-semibold text-dark">{ticket.relatedSystemName}</div>
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label small text-muted mb-1">Requested Priority</label>
                  <div>
                    <span className={getPriorityBadgeClass(ticket.requestedPriority)}>
                      {ticket.requestedPriority}
                    </span>
                  </div>
                </div>
                <div className="col-12 col-md-3">
                  <label className="form-label small text-muted mb-1">IT Priority</label>
                  <div>
                    <span className={getPriorityBadgeClass(ticket.itPriority)}>
                      {ticket.itPriority ?? "—"}
                    </span>
                  </div>
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label small text-muted mb-1">Ticket Owner</label>
                  <div>
                    {ticket.ticketOwnerName ? (
                      <span className="badge bg-light text-dark border">{ticket.ticketOwnerName}</span>
                    ) : (
                      <span className="badge bg-light text-muted border border-dashed">Unassigned</span>
                    )}
                  </div>
                </div>
              </div>

              <hr />

              <div className="mb-3">
                <label className="form-label small text-muted mb-1">Summary</label>
                <h5 className="fw-bold text-dark">{ticket.summary}</h5>
              </div>

              <div>
                <label className="form-label small text-muted mb-1">Description</label>
                <div className="bg-light p-3 rounded text-dark" style={{ whiteSpace: "pre-wrap" }}>
                  {ticket.description}
                </div>
              </div>
            </div>
          </div>

          {/* ── Tabs ──────────────────────────────────────────────────────── */}
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-light py-0">
              <ul className="nav nav-tabs card-header-tabs" role="tablist">
                <li className="nav-item" role="presentation">
                  <button
                    id="tab-comments"
                    className={`nav-link${activeTab === "comments" ? " active" : ""}`}
                    onClick={() => setActiveTab("comments")}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "comments"}
                  >
                    💬 Public Comments
                  </button>
                </li>
                <li className="nav-item" role="presentation">
                  <button
                    id="tab-notes"
                    className={`nav-link${activeTab === "notes" ? " active" : ""}`}
                    onClick={() => setActiveTab("notes")}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "notes"}
                  >
                    🔒 Internal Notes
                  </button>
                </li>
                <li className="nav-item" role="presentation">
                  <button
                    id="tab-attachments"
                    className={`nav-link${activeTab === "attachments" ? " active" : ""}`}
                    onClick={() => setActiveTab("attachments")}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "attachments"}
                  >
                    📎 Attachments
                  </button>
                </li>
              </ul>
            </div>

            <div className="card-body p-4">
              {/* Public Comments tab */}
              {activeTab === "comments" && (
                <div id="panel-comments" role="tabpanel" aria-labelledby="tab-comments">
                  {commentsLoading ? (
                    <div className="text-muted small text-center py-3">Loading comments…</div>
                  ) : comments.length === 0 ? (
                    <p className="text-muted small mb-3">No public comments yet.</p>
                  ) : (
                    <div className="d-flex flex-column gap-3 mb-4">
                      {comments.map((c) => (
                        <div key={c.id} className="border rounded p-3 bg-white">
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <span className="fw-semibold text-dark">{c.authorName}</span>
                            <span className="small text-muted">{new Date(c.createdAt).toLocaleString()}</span>
                          </div>
                          <div className="small text-muted mb-1">{c.authorRole.replace(/_/g, " ")}</div>
                          <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>{c.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Post comment form */}
                  <form onSubmit={handleCommentSubmit}>
                    {commentError && (
                      <div className="alert alert-danger py-2 mb-2 small">{commentError}</div>
                    )}
                    <div className="mb-2">
                      <textarea
                        id="staff-public-comment-input"
                        className="form-control form-control-sm"
                        rows={3}
                        placeholder="Write a public comment (visible to requester)…"
                        value={commentContent}
                        onChange={(e) => setCommentContent(e.target.value)}
                        disabled={commentSaving}
                        maxLength={2000}
                        aria-label="Public comment content"
                      />
                    </div>
                    <button
                      id="staff-post-comment-btn"
                      type="submit"
                      className="btn btn-sm btn-primary"
                      disabled={commentSaving || !commentContent.trim()}
                    >
                      {commentSaving ? "Posting…" : "Post Comment"}
                    </button>
                  </form>
                </div>
              )}

              {/* Internal Notes tab */}
              {activeTab === "notes" && (
                <div
                  id="panel-notes"
                  role="tabpanel"
                  aria-labelledby="tab-notes"
                  // Amber tint — AC-04 visually distinct internal notes
                  style={{ background: "#FFFBF0", borderRadius: "0.375rem", padding: "1rem" }}
                >
                  <div
                    className="d-flex align-items-center gap-2 mb-3 px-2 py-1 rounded"
                    style={{ background: "#FFF4E0", border: "1px solid #F0C060", color: "#8A5A00" }}
                  >
                    <span>🔒</span>
                    <span className="small fw-semibold">Internal Notes — visible to IT Staff and Administrators only</span>
                  </div>

                  {notesLoading ? (
                    <div className="text-muted small text-center py-3">Loading notes…</div>
                  ) : notes.length === 0 ? (
                    <p className="text-muted small mb-3">No internal notes yet.</p>
                  ) : (
                    <div className="d-flex flex-column gap-3 mb-4">
                      {notes.map((n) => (
                        <div
                          key={n.id}
                          className="rounded p-3"
                          style={{
                            background: "#FFF4E0",
                            border: "1px solid #F0C060",
                            color: "#3D2B00",
                          }}
                        >
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <span className="fw-semibold">{n.authorName}</span>
                            <span className="small" style={{ color: "#8A5A00" }}>
                              {new Date(n.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="small mb-1" style={{ color: "#8A5A00" }}>
                            {n.authorRole.replace(/_/g, " ")}
                          </div>
                          <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>{n.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Post note form */}
                  <form onSubmit={handleNoteSubmit}>
                    {noteError && (
                      <div className="alert alert-danger py-2 mb-2 small">{noteError}</div>
                    )}
                    <div className="mb-2">
                      <textarea
                        id="staff-internal-note-input"
                        className="form-control form-control-sm"
                        rows={3}
                        placeholder="Write an internal note (staff/admin only)…"
                        value={noteContent}
                        onChange={(e) => setNoteContent(e.target.value)}
                        disabled={noteSaving}
                        maxLength={2000}
                        aria-label="Internal note content"
                        style={{ borderColor: "#F0C060" }}
                      />
                    </div>
                    <button
                      id="staff-post-note-btn"
                      type="submit"
                      className="btn btn-sm"
                      style={{ background: "#F0C060", color: "#3D2B00", fontWeight: 600 }}
                      disabled={noteSaving || !noteContent.trim()}
                    >
                      {noteSaving ? "Saving…" : "Add Internal Note"}
                    </button>
                  </form>
                </div>
              )}

              {/* Attachments tab */}
              {activeTab === "attachments" && (
                <div id="panel-attachments" role="tabpanel" aria-labelledby="tab-attachments">
                  {downloadError && (
                    <div className="alert alert-danger py-2 mb-3 small">{downloadError}</div>
                  )}
                  {attachmentsLoading ? (
                    <div className="text-muted small text-center py-3">Loading attachments…</div>
                  ) : attachments.length === 0 ? (
                    <p className="text-muted small">No attachments found.</p>
                  ) : (
                    <div className="list-group list-group-flush">
                      {attachments.map((att) => (
                        <div
                          key={att.id}
                          className="list-group-item d-flex justify-content-between align-items-center px-0"
                        >
                          <div>
                            <div className="fw-semibold text-dark">{att.fileName}</div>
                            <div className="small text-muted">
                              {formatBytes(att.sizeBytes)} · Uploaded {new Date(att.uploadedAt).toLocaleDateString()}
                              {att.removedAt && (
                                <span className="ms-2 text-danger">(Removed: {att.removedReason})</span>
                              )}
                            </div>
                          </div>
                          {!att.removedAt && (
                            <button
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => handleDownload(att)}
                            >
                              ↓ Download
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Operations Panel ────────────────────────────────────── */}
        <div className="col-12 col-lg-4">
          <div className="card border-0 shadow-sm sticky-lg-top" style={{ top: "1rem" }}>
            <div className="card-header bg-light fw-bold py-3">Ticket Operations</div>
            <div className="card-body p-3 d-flex flex-column gap-4">

              {/* Owner */}
              <div>
                <label htmlFor="staff-owner-select" className="form-label small fw-semibold mb-1">
                  Ticket Owner
                </label>
                <select
                  id="staff-owner-select"
                  className="form-select form-select-sm"
                  value={ticket.ticketOwnerId ?? ""}
                  onChange={handleOwnerChange}
                  disabled={ownerSaving}
                  aria-label="Select ticket owner"
                >
                  <option value="">— Unassigned —</option>
                  {staffUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role.replace(/_/g, " ")})
                    </option>
                  ))}
                </select>
                {ownerSaving && <div className="small text-muted mt-1">Saving…</div>}
                {ownerError && <div className="small text-danger mt-1">{ownerError}</div>}
              </div>

              {/* IT Priority */}
              <div>
                <label htmlFor="staff-priority-select" className="form-label small fw-semibold mb-1">
                  IT Priority
                </label>
                <select
                  id="staff-priority-select"
                  className="form-select form-select-sm"
                  value={ticket.itPriority ?? ""}
                  onChange={handlePriorityChange}
                  disabled={prioritySaving}
                  aria-label="Select IT priority"
                >
                  <option value="" disabled>— Select Priority —</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
                {prioritySaving && <div className="small text-muted mt-1">Saving…</div>}
                {priorityError && <div className="small text-danger mt-1">{priorityError}</div>}
              </div>

              {/* Status Transition */}
              <div>
                <label htmlFor="staff-status-select" className="form-label small fw-semibold mb-1">
                  Change Status
                </label>
                <div className="mb-2">
                  <span className={`badge ${getStatusBadgeClass(ticket.currentStatus)} me-1`}>
                    {STATUS_LABELS[ticket.currentStatus] ?? ticket.currentStatus}
                  </span>
                  {allowedNext.length > 0 && (
                    <span className="small text-muted">→ select new status</span>
                  )}
                </div>
                {allowedNext.length > 0 ? (
                  <select
                    id="staff-status-select"
                    className="form-select form-select-sm"
                    value=""
                    onChange={handleStatusChange}
                    disabled={statusSaving}
                    aria-label="Select new ticket status"
                  >
                    <option value="" disabled>— Transition to… —</option>
                    {allowedNext.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s] ?? s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="small text-muted fst-italic">
                    No further transitions available from this status.
                  </div>
                )}
                {statusSaving && <div className="small text-muted mt-1">Saving…</div>}
                {statusError && <div className="small text-danger mt-1">{statusError}</div>}
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
