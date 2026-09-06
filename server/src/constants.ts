// BR-21: Allowed attachment file types, extensions, size limits, and count limits
export class AttachmentConstants {
  static readonly ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
  ];

  static readonly ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

  static readonly MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

  static readonly MAX_ACTIVE_ATTACHMENTS = 5;

  static readonly MAX_REMOVAL_REASON_LENGTH = 500;
}
