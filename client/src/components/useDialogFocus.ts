import { useEffect, useRef, type RefObject } from "react";

// Focus handling for the Lab 2 and Lab 3 modals (BR-35, ui-spec section 11), added without changing
// their markup: while `active`, focus moves into the dialog, Tab and Shift+Tab stay inside it,
// Escape closes it (unless closing is blocked, for example while a request is in flight), and on
// close focus returns to the control that opened it.

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => !el.hasAttribute("hidden"));
}

export function useDialogFocus(
  ref: RefObject<HTMLElement>,
  options: { active: boolean; onClose: () => void; canClose?: boolean; initialFocus?: string }
): void {
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!options.active) return;
    const root = ref.current;
    if (!root) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const first = (options.initialFocus && root.querySelector<HTMLElement>(options.initialFocus)) || focusables(root)[0] || root;
    first.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (latest.current.canClose === false) return;
        e.preventDefault();
        latest.current.onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables(root);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === firstItem || !root.contains(current))) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && (current === lastItem || !root.contains(current))) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (opener && opener.isConnected) opener.focus();
    };
    // The dialog's lifetime is `active`; the latest callbacks are read through `latest`.
  }, [options.active, ref]);
}
