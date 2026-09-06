import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCategories,
  getRelatedSystems,
  createTicket,
  uploadAttachment,
  Category,
  RelatedSystem,
  Ticket,
} from "../api.js";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  ALLOWED_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ACTIVE_ATTACHMENTS,
} from "../constants.js";
import { useRequester } from "../context/RequesterContext.js";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CreateTicketScreen: React.FC = () => {
  const { selectedRequester } = useRequester();
  const navigate = useNavigate();


  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);

  const [categoryId, setCategoryId] = useState<string>("");
  const [relatedSystemId, setRelatedSystemId] = useState<string>("");
  const [requestedPriority, setRequestedPriority] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [summary, setSummary] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  // Attachments state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string>("");
  const [attachmentUploadErrors, setAttachmentUploadErrors] = useState<
    Array<{ fileName: string; reason: string }>
  >([]);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string>("");
  const [referenceDataLoading, setReferenceDataLoading] = useState<boolean>(true);

  const currentDateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const loadReferenceData = async () => {
    setReferenceDataLoading(true);
    try {
      const [cats, systems] = await Promise.all([
        getCategories(),
        getRelatedSystems(),
      ]);
      setCategories(cats);
      setRelatedSystems(systems);
      if (cats.length > 0 && !categoryId) {
        setCategoryId(cats[0].id.toString());
      }
      if (systems.length > 0 && !relatedSystemId) {
        setRelatedSystemId(systems[0].id.toString());
      }
    } catch {
      setGeneralError("Unable to load reference data. Please refresh.");
    } finally {
      setReferenceDataLoading(false);
    }
  };

  useEffect(() => {
    loadReferenceData();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setAttachmentError("");

    // Check file count limit (BR-23)
    if (selectedFiles.length + files.length > MAX_ACTIVE_ATTACHMENTS) {
      setAttachmentError("A ticket may have at most 5 active attachments");
      e.target.value = "";
      return;
    }

    // Validate each selected file (BR-21, BR-22)
    for (const file of files) {
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      const isValidType =
        ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.type) ||
        ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext);

      if (!isValidType) {
        setAttachmentError("Only JPG, PNG, WEBP, and PDF files are allowed");
        e.target.value = "";
        return;
      }

      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        setAttachmentError("File exceeds the 5 MB limit");
        e.target.value = "";
        return;
      }
    }

    setSelectedFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setAttachmentError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setGeneralError("");
    setAttachmentError("");
    setAttachmentUploadErrors([]);

    // Client-side validation for Summary (min 5 chars) per BR-15, AC-04, UI-03
    const trimmedSummary = summary.trim();
    if (!trimmedSummary || trimmedSummary.length < 5) {
      setFieldErrors((prev) => ({
        ...prev,
        summary: "Summary must be between 5 and 150 characters",
      }));
      return;
    }

    if (!selectedRequester) {
      setGeneralError("No Requester selected. Please select a Requester.");
      return;
    }

    setIsSubmitting(true);

    try {
      const ticket = await createTicket(
        {
          categoryId: parseInt(categoryId, 10),
          relatedSystemId: parseInt(relatedSystemId, 10),
          summary: trimmedSummary,
          description: description.trim(),
          requestedPriority,
        },
        selectedRequester.id
      );

      // Upload selected files sequentially (AC-05, BR-27)
      const uploadErrors: Array<{ fileName: string; reason: string }> = [];
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          try {
            await uploadAttachment(ticket.id, file, selectedRequester.id);
          } catch (err: unknown) {
            const reason = err instanceof Error ? err.message : "Failed to upload attachment";
            uploadErrors.push({ fileName: file.name, reason });
          }
        }
      }

      setAttachmentUploadErrors(uploadErrors);
      setCreatedTicket(ticket);
    } catch (err: any) {
      if (err?.fields) {
        setFieldErrors(err.fields);
      } else if (err instanceof Error) {
        setGeneralError(err.message);
      } else {
        setGeneralError("Unable to connect to TokTickIT API");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAnother = () => {
    setCreatedTicket(null);
    setSummary("");
    setDescription("");
    setSelectedFiles([]);
    setAttachmentError("");
    setAttachmentUploadErrors([]);
    setFieldErrors({});
    setGeneralError("");
  };

  if (createdTicket) {
    return (
      <div className="container py-5 d-flex justify-content-center">
        <div className="zg-card p-4 w-100" style={{ maxWidth: 640 }}>
          <div className="alert alert-success text-center mb-4" role="status">
            <div className="display-6 mb-2">✅</div>
            <h2 className="h4 font-weight-bold mb-2">Ticket Created Successfully!</h2>
            <p className="mb-0">
              Your official Ticket Number is:{" "}
              <strong className="h5 text-success d-block mt-2 font-monospace">
                {createdTicket.ticketNumber}
              </strong>
            </p>
          </div>

          {attachmentUploadErrors.length > 0 && (
            <div className="alert alert-warning mb-4" role="alert">
              <div className="fw-bold mb-1">⚠️ Attachment Warning (BR-27)</div>
              <div className="small mb-2">
                The ticket was created, but the following attachment(s) failed to upload:
              </div>
              <ul className="mb-0 small ps-3">
                {attachmentUploadErrors.map((err, idx) => (
                  <li key={idx}>
                    <strong>{err.fileName}</strong>: {err.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border rounded p-3 mb-4 bg-light">
            <div className="row g-2 small">
              <div className="col-sm-6">
                <strong>Requester:</strong> {selectedRequester?.name}
              </div>
              <div className="col-sm-6">
                <strong>Priority:</strong> {createdTicket.requestedPriority}
              </div>
              <div className="col-12 mt-2">
                <strong>Summary:</strong> {createdTicket.summary}
              </div>
            </div>
          </div>

          <div className="d-flex justify-content-center gap-3">
            <button
              onClick={() => navigate(`/tickets/${createdTicket.id}`)}
              className="btn btn-outline-success px-4 py-2"
            >
              View Ticket Details
            </button>
            <button
              onClick={handleCreateAnother}
              className="btn zg-btn-primary px-4 py-2"
            >
              Create Another Ticket
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4" style={{ maxWidth: 768 }}>
      <div className="zg-card p-4">
        <div className="border-bottom pb-3 mb-4">
          <h1 className="h3 font-weight-bold mb-1">Create Support Ticket</h1>
          <p className="text-muted mb-0 small">
            Submit an IT support request. Required fields are marked with an asterisk (
            <span className="text-danger">*</span>).
          </p>
        </div>

        {generalError && (
          <div className="alert alert-danger mb-4" role="alert">
            {generalError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Read-Only System Fields */}
          <div className="row g-3 mb-4">
            <div className="col-md-6">
              <label htmlFor="ticketNumberReadonly" className="form-label fw-medium text-muted">
                Ticket Number
              </label>
              <input
                id="ticketNumberReadonly"
                type="text"
                className="form-control bg-light zg-field-readonly text-muted"
                value="Generated upon submission"
                readOnly
                tabIndex={-1}
              />
            </div>
            <div className="col-md-6">
              <label htmlFor="ticketDateReadonly" className="form-label fw-medium text-muted">
                Ticket Date
              </label>
              <input
                id="ticketDateReadonly"
                type="text"
                className="form-control bg-light zg-field-readonly text-muted"
                value={currentDateStr}
                readOnly
                tabIndex={-1}
              />
            </div>
          </div>

          {/* Classification Section */}
          <div className="row g-3 mb-4">
            <div className="col-md-4">
              <label htmlFor="categorySelect" className="form-label fw-medium">
                Category <span className="text-danger">*</span>
              </label>
              <select
                id="categorySelect"
                className={`form-select ${fieldErrors.categoryId ? "is-invalid" : ""}`}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={referenceDataLoading || isSubmitting}
                required
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              {fieldErrors.categoryId && (
                <div className="invalid-feedback d-block mt-1">
                  {fieldErrors.categoryId}
                </div>
              )}
            </div>

            <div className="col-md-4">
              <label htmlFor="relatedSystemSelect" className="form-label fw-medium">
                Related System <span className="text-danger">*</span>
              </label>
              <select
                id="relatedSystemSelect"
                className={`form-select ${fieldErrors.relatedSystemId ? "is-invalid" : ""}`}
                value={relatedSystemId}
                onChange={(e) => setRelatedSystemId(e.target.value)}
                disabled={referenceDataLoading || isSubmitting}
                required
              >
                {relatedSystems.map((sys) => (
                  <option key={sys.id} value={sys.id}>
                    {sys.name}
                  </option>
                ))}
              </select>
              {fieldErrors.relatedSystemId && (
                <div className="invalid-feedback d-block mt-1">
                  {fieldErrors.relatedSystemId}
                </div>
              )}
            </div>

            <div className="col-md-4">
              <label htmlFor="prioritySelect" className="form-label fw-medium">
                Requested Priority <span className="text-danger">*</span>
              </label>
              <select
                id="prioritySelect"
                className={`form-select ${fieldErrors.requestedPriority ? "is-invalid" : ""}`}
                value={requestedPriority}
                onChange={(e) =>
                  setRequestedPriority(e.target.value as "LOW" | "MEDIUM" | "HIGH")
                }
                disabled={isSubmitting}
                required
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
              {fieldErrors.requestedPriority && (
                <div className="invalid-feedback d-block mt-1">
                  {fieldErrors.requestedPriority}
                </div>
              )}
            </div>
          </div>

          {/* Ticket Summary */}
          <div className="mb-4">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <label htmlFor="summaryInput" className="form-label fw-medium mb-0">
                Summary <span className="text-danger">*</span>
              </label>
              <span className="small text-muted">
                {summary.length} / 150
              </span>
            </div>
            <input
              id="summaryInput"
              type="text"
              className={`form-control ${fieldErrors.summary ? "is-invalid" : ""}`}
              placeholder="Brief summary of the issue (5–150 characters)"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              disabled={isSubmitting}
              maxLength={150}
              required
            />
            {fieldErrors.summary && (
              <div className="invalid-feedback d-block mt-1">
                {fieldErrors.summary}
              </div>
            )}
          </div>

          {/* Ticket Description */}
          <div className="mb-4">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <label htmlFor="descriptionInput" className="form-label fw-medium mb-0">
                Description <span className="text-danger">*</span>
              </label>
              <span className="small text-muted">
                {description.length} / 2000
              </span>
            </div>
            <textarea
              id="descriptionInput"
              className={`form-control ${fieldErrors.description ? "is-invalid" : ""}`}
              placeholder="Detailed description of the problem (10–2000 characters)"
              rows={5}
              style={{ resize: "vertical" }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              maxLength={2000}
              required
            />
            {fieldErrors.description && (
              <div className="invalid-feedback d-block mt-1">
                {fieldErrors.description}
              </div>
            )}
          </div>

          {/* Attachments Section */}
          <div className="zg-card p-3 mb-4 bg-light border">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <label htmlFor="attachmentFileInput" className="form-label fw-medium mb-0">
                📎 Attachments ({selectedFiles.length}/{MAX_ACTIVE_ATTACHMENTS})
              </label>
              <label
                className={`btn btn-sm zg-btn-primary ${
                  selectedFiles.length >= MAX_ACTIVE_ATTACHMENTS || isSubmitting ? "disabled" : ""
                }`}
                style={{
                  cursor:
                    selectedFiles.length >= MAX_ACTIVE_ATTACHMENTS || isSubmitting
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                + Add File
                <input
                  id="attachmentFileInput"
                  type="file"
                  className="d-none"
                  onChange={handleFileSelect}
                  disabled={selectedFiles.length >= MAX_ACTIVE_ATTACHMENTS || isSubmitting}
                  accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                  aria-label="Upload Attachment"
                  multiple
                />
              </label>
            </div>

            <p className="small text-muted mb-2">
              Allowed formats: JPG, PNG, WEBP, PDF (max 5 MB per file, max 5 attachments).
            </p>

            {attachmentError && (
              <div className="alert alert-danger py-2 mb-2 small" role="alert">
                {attachmentError}
              </div>
            )}

            {selectedFiles.length > 0 && (
              <div className="d-flex flex-column gap-2 mt-2">
                {selectedFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="d-flex align-items-center justify-content-between p-2 bg-white rounded border small"
                  >
                    <div className="d-flex align-items-center gap-2 text-truncate me-2">
                      <span>📄</span>
                      <span className="fw-medium text-truncate">{file.name}</span>
                      <span className="text-muted">({formatFileSize(file.size)})</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm py-0 px-2"
                      onClick={() => handleRemoveFile(idx)}
                      disabled={isSubmitting}
                      aria-label={`Remove ${file.name}`}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="d-flex justify-content-end gap-2">
            <button
              type="button"
              className="btn zg-btn-secondary"
              onClick={() => {
                setSummary("");
                setDescription("");
                setSelectedFiles([]);
                setAttachmentError("");
                setAttachmentUploadErrors([]);
                setFieldErrors({});
                setGeneralError("");
              }}
              disabled={isSubmitting}
            >
              Clear
            </button>
            <button
              type="submit"
              className="btn zg-btn-primary px-4"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting…" : "Submit Ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


