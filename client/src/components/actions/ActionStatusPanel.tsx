import React, { useId, useRef, useState } from "react";
import type { ActionTaken } from "../../actionsApi.js";
import { LIMITS, validateStepText } from "./actionForm.js";

// "Change status" row of the Action dialog (ui-spec section 6). Start is one click; Mark completed
// and Cancel action open a step panel with a required Result or reason, then Back and Confirm.

type Step = "complete" | "cancel";

interface ActionStatusPanelProps {
  action: ActionTaken;
  /** The form has unsaved edits: status buttons are disabled with a hint. */
  blockedByEdits: boolean;
  busy: boolean;
  onStart: () => void;
  onConfirm: (step: Step, text: string) => void;
}

export const ActionStatusPanel: React.FC<ActionStatusPanelProps> = ({
  action, blockedByEdits, busy, onStart, onConfirm,
}) => {
  const [step, setStep] = useState<Step | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const hintId = `${id}-hint`;
  const disabled = blockedByEdits || busy;

  if (action.status !== "PLANNED" && action.status !== "IN_PROGRESS") return null;

  const open = (s: Step) => {
    setStep(s);
    setText(s === "complete" ? action.result ?? "" : "");
    setError(undefined);
    setTimeout(() => fieldRef.current?.focus(), 0);
  };

  const confirm = () => {
    if (busy || !step) return;
    const problem = validateStepText(text, step);
    setError(problem);
    if (problem) {
      fieldRef.current?.focus();
      return;
    }
    onConfirm(step, text.trim());
  };

  if (step) {
    const label = step === "complete" ? "Result" : "Reason for cancelling";
    const fieldId = `${id}-text`;
    const errorId = `${id}-error`;
    const countId = `${id}-count`;
    return (
      <section className="border rounded p-3 mt-3 bg-light" aria-labelledby={`${id}-step-title`}>
        <h3 className="h6 fw-bold" id={`${id}-step-title`}>
          {step === "complete" ? "Mark completed" : "Cancel action"}
        </h3>
        <p className="small mb-2">
          {step === "complete" ? "Completed actions become read-only." : "Cancel this action? This cannot be undone."}
        </p>
        <label htmlFor={fieldId} className="form-label fw-semibold">
          {label} <span className="text-danger" aria-hidden="true">*</span>
        </label>
        <textarea
          id={fieldId}
          ref={fieldRef}
          className={`form-control${error ? " is-invalid" : ""}`}
          rows={3}
          maxLength={LIMITS.result}
          value={text}
          onChange={e => {
            setText(e.target.value);
            if (error) setError(validateStepText(e.target.value, step));
          }}
          aria-required="true"
          aria-invalid={error ? "true" : "false"}
          aria-describedby={`${error ? errorId + " " : ""}${countId}`}
        />
        {error && <div id={errorId} className="invalid-feedback d-block">{error}</div>}
        <div id={countId} className="form-text text-end">{text.length}/{LIMITS.result}</div>
        <div className="d-flex flex-wrap gap-2 justify-content-end mt-2">
          <button type="button" className="btn btn-outline-secondary zg-touch" onClick={() => setStep(null)} disabled={busy}>
            Back
          </button>
          <button
            type="button"
            className={`btn zg-touch ${step === "cancel" ? "btn-danger" : "btn-success"}`}
            onClick={confirm}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? "Saving…" : "Confirm"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-3" aria-labelledby={`${id}-title`}>
      <h3 className="h6 fw-bold mb-2" id={`${id}-title`}>Change status</h3>
      <div className="d-flex flex-wrap gap-2">
        {action.status === "PLANNED" && (
          <button
            type="button"
            className="btn btn-outline-secondary zg-touch"
            onClick={() => { if (!disabled) onStart(); }}
            disabled={disabled}
            aria-describedby={blockedByEdits ? hintId : undefined}
          >
            Start
          </button>
        )}
        <button
          type="button"
          className="btn btn-outline-success zg-touch"
          onClick={() => open("complete")}
          disabled={disabled}
          aria-describedby={blockedByEdits ? hintId : undefined}
        >
          Mark completed
        </button>
        <button
          type="button"
          className="btn btn-outline-danger zg-touch"
          onClick={() => open("cancel")}
          disabled={disabled}
          aria-describedby={blockedByEdits ? hintId : undefined}
        >
          Cancel action
        </button>
      </div>
      {blockedByEdits && <div id={hintId} className="form-text">Save or discard your changes first</div>}
    </section>
  );
};
