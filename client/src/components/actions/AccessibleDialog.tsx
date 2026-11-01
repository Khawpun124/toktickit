import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Modal dialog for Lab 4 (ui-spec section 11, BR-35, AC-29): role="dialog" with aria-modal and
// a labelled title; focus moves in on open, Tab and Shift+Tab stay inside, Escape asks the owner
// to close (so it can confirm unsaved changes first), focus returns to the opener on close, and
// the page behind does not scroll. Below 768 px it is a full-screen sheet with a sticky footer.

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

// Dialogs can be stacked (an Action dialog and its confirmation), so the page scroll lock is
// counted and released only when the last one closes, whatever order they unmount in.
let scrollLocks = 0;
let overflowBeforeLock = "";

function lockPageScroll() {
  if (scrollLocks++ === 0) {
    overflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}

function unlockPageScroll() {
  if (--scrollLocks === 0) document.body.style.overflow = overflowBeforeLock;
}

interface AccessibleDialogProps {
  titleId: string;
  title: React.ReactNode;
  onRequestClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Smaller centered dialog for confirmations. */
  compact?: boolean;
}

export const AccessibleDialog: React.FC<AccessibleDialogProps> = ({
  titleId, title, onRequestClose, children, footer, compact = false,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onRequestClose);
  closeRef.current = onRequestClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    lockPageScroll();

    const content = contentRef.current;
    const first = content?.querySelector<HTMLElement>("[data-autofocus]") ?? content?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? content)?.focus();

    return () => {
      unlockPageScroll();
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeRef.current();
      return;
    }
    if (e.key !== "Tab" || !contentRef.current) return;
    const items = Array.from(contentRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === firstItem || active === contentRef.current)) {
      e.preventDefault();
      lastItem.focus();
    } else if (!e.shiftKey && active === lastItem) {
      e.preventDefault();
      firstItem.focus();
    }
  };

  return createPortal(
    <>
      <div className="modal-backdrop show zg-action-backdrop" />
      <div className="modal d-block zg-action-modal" role="presentation">
        <div className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${compact ? "zg-action-dialog--compact" : "modal-fullscreen-md-down zg-action-dialog"}`}>
          <div
            ref={contentRef}
            className="modal-content zg-actions-scope"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={onKeyDown}
          >
            <div className="modal-header">
              <h2 className="modal-title h5 mb-0" id={titleId}>{title}</h2>
              <button type="button" className="btn-close zg-touch" aria-label="Close" onClick={() => closeRef.current()} />
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer zg-action-footer">{footer}</div>}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};
