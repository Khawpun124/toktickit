// BR-21: Allowed attachment file types, extensions, size limits, and count limits
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];

export const ALLOWED_ATTACHMENT_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const MAX_ACTIVE_ATTACHMENTS = 5;

export const MAX_REMOVAL_REASON_LENGTH = 500;
