import React, { useEffect, useId, useRef, useState } from "react";
import { getStaffUsers, type StaffUserItem } from "../../api.js";
import {
  ACTION_STATUS_LABELS, changeActionStatus, createAction, describeActionError, formatActionTime,
  updateAction, type ActionErrorView, type ActionTaken, type CreateActionStatus,
} from "../../actionsApi.js";
import { AccessibleDialog } from "./AccessibleDialog.js";
import { ActionStatusBadge } from "./ActionStatusBadge.js";
import { ActionStatusPanel } from "./ActionStatusPanel.js";
import {
  emptyForm, firstInvalid, FIELD_ORDER, formFromAction, isDirty, LIMITS, toCreatePayload,
  toUpdatePayload, validateForm, type ActionFormValues, type FieldName, type FormErrors,
} from "./actionForm.js";

// One dialog, three modes (ui-spec section 6): Create "Add Action", View "Action details",
// Edit "Edit Action". A Requester gets View only, with no Edit, Save, or status control rendered.

export type DialogMode = "create" | "view" | "edit";

interface ActionDialogProps {
  ticketId: number;
  initialMode: "create" | "view";
  action?: ActionTaken;
  readOnly: boolean;
  currentUser?: { id: number; name: string };
  onClose: () => void;
  onCreated: (action: ActionTaken) => void;
  onSaved: (action: ActionTaken) => void;
  /** A status change, or the latest version loaded after a conflict. */
  onActionUpdated: (action: ActionTaken) => void;
  onTicketClosed: (ticketStatus?: string) => void;
}

const TITLES: Record<DialogMode, string> = { create: "Add Action", view: "Action details", edit: "Edit Action" };
const CREATE_STATUSES: CreateActionStatus[] = ["PLANNED", "IN_PROGRESS", "COMPLETED"];
const ATTACHMENT_HELP =
  "Describe which file to look for, for example the screenshot added under Attachments. " +
  "Files themselves are added under the Attachments tab.";

const isTerminal = (a?: ActionTaken) => a?.status === "COMPLETED" || a?.status === "CANCELLED";

export const ActionDialog: React.FC<ActionDialogProps> = ({
  ticketId, initialMode, action: initialAction, readOnly, currentUser,
  onClose, onCreated, onSaved, onActionUpdated, onTicketClosed,
}) => {
  const uid = useId();
  const [mode, setMode] = useState<DialogMode>(initialMode);
  const [action, setAction] = useState<ActionTaken | undefined>(initialAction);
  const [initial, setInitial] = useState<ActionFormValues>(() =>
    initialAction ? formFromAction(initialAction) : emptyForm(new Date(), currentUser?.id));
  const [values, setValues] = useState<ActionFormValues>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Set<FieldName>>(new Set());
  const [serverErrors, setServerErrors] = useState<FormErrors>({});
  const [alert, setAlert] = useState<ActionErrorView | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; text: string; confirmLabel: string; onConfirm: () => void } | null>(null);
  const [staffUsers, setStaffUsers] = useState<StaffUserItem[]>([]);
  const [staffError, setStaffError] = useState("");

  // Guards against a double click even before React re-renders the disabled button.
  const busyRef = useRef(false);
  // Created when the Add dialog opens; reused by every retry until a create succeeds.
  const clientRequestIdRef = useRef<string>(crypto.randomUUID());
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLElement | null>>>({});

  const editing = mode === "create" || mode === "edit";
  const dirty = editing && isDirty(initial, values);
  const clientErrors = editing ? validateForm(values, mode === "create" ? "create" : "edit") : {};
  const errorFor = (f: FieldName) =>
    serverErrors[f] ?? (submitted || touched.has(f) ? clientErrors[f] : undefined);

  useEffect(() => {
    if (readOnly || !editing) return;
    let alive = true;
    getStaffUsers()
      .then(list => { if (alive) setStaffUsers(list); })
      .catch(() => { if (alive) setStaffError("We couldn't load the staff list. You can still assign the action to yourself."); });
    return () => { alive = false; };
  }, [readOnly, editing]);

  useEffect(() => {
    if (mode === "edit") fieldRefs.current.actionAt?.focus();
  }, [mode]);

  const focusField = (f?: FieldName) => {
    if (f) setTimeout(() => fieldRefs.current[f]?.focus(), 0);
  };

  const setField = <K extends keyof ActionFormValues>(name: K, value: ActionFormValues[K]) => {
    setValues(v => {
      const next = { ...v, [name]: value };
      if (name === "followUpRequired" && !value) next.followUpNote = "";
      return next;
    });
    if (name !== "followUpRequired") {
      setServerErrors(e => ({ ...e, [name]: undefined }));
    } else {
      setServerErrors(e => ({ ...e, followUpNote: undefined }));
    }
  };

  const touch = (f: FieldName) => setTouched(t => (t.has(f) ? t : new Set(t).add(f)));

  const applyLatest = (latest: ActionTaken) => {
    const form = formFromAction(latest);
    setAction(latest);
    setInitial(form);
    setValues(form);
    setServerErrors({});
    setAlert(null);
    setSubmitted(false);
    setTouched(new Set());
    if (isTerminal(latest)) setMode("view");
    onActionUpdated(latest);
  };

  const handleError = (err: unknown) => {
    const view = describeActionError(err, "save");
    if (view.kind === "validation") {
      const known: FormErrors = {};
      const other: string[] = [];
      for (const [key, message] of Object.entries(view.fields ?? {})) {
        if ((FIELD_ORDER as string[]).includes(key)) known[key as FieldName] = message;
        else other.push(message);
      }
      setServerErrors(known);
      setAlert({ ...view, message: other.length ? other.join(" ") : view.message });
      focusField(firstInvalid(known));
      return;
    }
    setAlert(view);
    if (view.kind === "ticketClosed") {
      setSaveBlocked(true);
      onTicketClosed(view.ticketStatus);
    }
  };

  const run = async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setAlert(null);
    setStatusMessage("");
    try {
      await work();
    } catch (err) {
      handleError(err);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const save = () => {
    if (busyRef.current || saveBlocked) return;
    setSubmitted(true);
    const errors = validateForm(values, mode === "create" ? "create" : "edit");
    if (Object.keys(errors).length > 0) {
      focusField(firstInvalid(errors));
      return;
    }
    if (mode === "create") {
      void run(async () => {
        const created = await createAction(ticketId, toCreatePayload(values, clientRequestIdRef.current));
        clientRequestIdRef.current = crypto.randomUUID();
        onCreated(created);
      });
    } else if (action && dirty) {
      void run(async () => {
        const saved = await updateAction(action.id, toUpdatePayload(initial, values, action.version));
        onSaved(saved);
      });
    }
  };

  const changeStatus = (status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED", result?: string) => {
    if (!action) return;
    void run(async () => {
      const updated = await changeActionStatus(action.id, {
        expectedVersion: action.version,
        status,
        ...(result !== undefined ? { result } : {}),
      });
      const form = formFromAction(updated);
      setAction(updated);
      setInitial(form);
      setValues(form);
      setMode("view");
      setStatusMessage(`Status changed to ${ACTION_STATUS_LABELS[updated.status]}.`);
      onActionUpdated(updated);
    });
  };

  const askToConfirm = (title: string, text: string, confirmLabel: string, onConfirm: () => void) =>
    setConfirmState({ title, text, confirmLabel, onConfirm });

  const requestClose = () => {
    if (busy) return;
    if (dirty) {
      askToConfirm("Discard changes?", "Your changes to this action have not been saved.", "Discard changes", onClose);
    } else {
      onClose();
    }
  };

  const loadLatest = () => {
    const latest = alert?.current;
    if (!latest) return;
    if (dirty) {
      askToConfirm(
        "Load the latest version?",
        "Your unsaved changes will be replaced by the latest saved version.",
        "Load latest version",
        () => applyLatest(latest),
      );
    } else {
      applyLatest(latest);
    }
  };

  // ── Field rendering ──────────────────────────────────────────────────────

  const fieldId = (f: string) => `${uid}-${f}`;
  const described = (f: FieldName, extra: string[] = []) => {
    const ids = [errorFor(f) ? `${fieldId(f)}-error` : "", ...extra].filter(Boolean);
    return ids.length ? ids.join(" ") : undefined;
  };
  const required = <span className="text-danger" aria-hidden="true">*</span>;
  const errorText = (f: FieldName) =>
    errorFor(f) ? <div id={`${fieldId(f)}-error`} className="invalid-feedback d-block">{errorFor(f)}</div> : null;
  const counter = (f: FieldName, value: string, max: number) => (
    <div id={`${fieldId(f)}-count`} className="form-text text-end">{value.length}/{max}</div>
  );
  const controlProps = (f: FieldName, isRequired: boolean, extra: string[] = []) => ({
    id: fieldId(f),
    ref: (el: HTMLElement | null) => { fieldRefs.current[f] = el; },
    "aria-required": isRequired ? ("true" as const) : undefined,
    "aria-invalid": errorFor(f) ? ("true" as const) : ("false" as const),
    "aria-describedby": described(f, extra),
    // A field counts as visited only when the user moves to another control of this dialog.
    // Focus leaving the dialog (a confirmation opening, the dialog closing) changes nothing.
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      const next = e.relatedTarget as Node | null;
      if (next && e.currentTarget.closest("[role='dialog']")?.contains(next)) touch(f);
    },
  });

  const assigneeOptions = (() => {
    const list = staffUsers.map(u => ({ id: u.id, label: `${u.name} (${u.role === "ADMINISTRATOR" ? "Administrator" : "IT Staff"})` }));
    if (currentUser && !list.some(o => o.id === currentUser.id)) list.unshift({ id: currentUser.id, label: currentUser.name });
    if (action && !list.some(o => o.id === action.assignee.id)) {
      list.push({ id: action.assignee.id, label: `${action.assignee.name}${action.assignee.isActive ? "" : " (inactive)"}` });
    }
    return list;
  })();

  const renderForm = () => {
    const resultRequired = mode === "create" && values.status === "COMPLETED";
    return (
      <form noValidate onSubmit={e => { e.preventDefault(); save(); }} id={`${uid}-form`}>
        <div className="mb-3">
          <label htmlFor={fieldId("actionAt")} className="form-label fw-semibold">Action Date/Time {required}</label>
          <input
            type="datetime-local"
            className={`form-control${errorFor("actionAt") ? " is-invalid" : ""}`}
            value={values.actionAt}
            onChange={e => setField("actionAt", e.target.value)}
            data-autofocus={mode === "create" ? true : undefined}
            {...controlProps("actionAt", true, [`${fieldId("actionAt")}-help`])}
          />
          {errorText("actionAt")}
          <div id={`${fieldId("actionAt")}-help`} className="form-text">Shown in your time zone.</div>
        </div>

        <div className="mb-3">
          <label htmlFor={fieldId("description")} className="form-label fw-semibold">Description {required}</label>
          <textarea
            className={`form-control${errorFor("description") ? " is-invalid" : ""}`}
            rows={3}
            maxLength={LIMITS.description}
            value={values.description}
            onChange={e => setField("description", e.target.value)}
            {...controlProps("description", true, [`${fieldId("description")}-count`])}
          />
          {errorText("description")}
          {counter("description", values.description, LIMITS.description)}
        </div>

        <div className="mb-3">
          {mode === "create" ? (
            <>
              <label htmlFor={fieldId("status")} className="form-label fw-semibold">Status {required}</label>
              <select
                className={`form-select${errorFor("status") ? " is-invalid" : ""}`}
                value={values.status}
                onChange={e => setField("status", e.target.value as CreateActionStatus)}
                {...controlProps("status", true)}
              >
                {CREATE_STATUSES.map(s => <option key={s} value={s}>{ACTION_STATUS_LABELS[s]}</option>)}
              </select>
              {errorText("status")}
            </>
          ) : (
            <>
              <div className="form-label fw-semibold" id={fieldId("status-label")}>Status</div>
              <div aria-labelledby={fieldId("status-label")} role="group">
                {action && <ActionStatusBadge status={action.status} />}
              </div>
            </>
          )}
        </div>

        <div className="mb-3">
          <label htmlFor={fieldId("assigneeId")} className="form-label fw-semibold">Assigned to {required}</label>
          <select
            className={`form-select${errorFor("assigneeId") ? " is-invalid" : ""}`}
            value={values.assigneeId}
            onChange={e => setField("assigneeId", e.target.value)}
            {...controlProps("assigneeId", true, staffError ? [`${fieldId("assigneeId")}-staff`] : [])}
          >
            {!values.assigneeId && <option value="">Choose a person</option>}
            {assigneeOptions.map(o => <option key={o.id} value={String(o.id)}>{o.label}</option>)}
          </select>
          {errorText("assigneeId")}
          {staffError && <div id={`${fieldId("assigneeId")}-staff`} className="form-text">{staffError}</div>}
        </div>

        <div className="mb-3">
          <div className="form-label fw-semibold" id={fieldId("performedBy")}>Performed by</div>
          <div className="zg-readonly-field" aria-labelledby={fieldId("performedBy")} role="group">
            {action ? action.performedBy.name : currentUser?.name ?? ""}
          </div>
        </div>

        <div className="mb-3">
          <label htmlFor={fieldId("result")} className="form-label fw-semibold">
            Result {resultRequired && required}
          </label>
          <textarea
            className={`form-control${errorFor("result") ? " is-invalid" : ""}`}
            rows={3}
            maxLength={LIMITS.result}
            value={values.result}
            onChange={e => setField("result", e.target.value)}
            {...controlProps("result", resultRequired, [`${fieldId("result")}-count`])}
          />
          {errorText("result")}
          {counter("result", values.result, LIMITS.result)}
        </div>

        <div className="mb-3">
          <div className="form-check form-switch">
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              id={fieldId("followUpRequired")}
              checked={values.followUpRequired}
              onChange={e => setField("followUpRequired", e.target.checked)}
            />
            <label className="form-check-label fw-semibold" htmlFor={fieldId("followUpRequired")}>Follow-up required?</label>
          </div>
          {values.followUpRequired && (
            <div className="mt-2">
              <label htmlFor={fieldId("followUpNote")} className="form-label fw-semibold">Follow-up Note {required}</label>
              <textarea
                className={`form-control${errorFor("followUpNote") ? " is-invalid" : ""}`}
                rows={2}
                maxLength={LIMITS.followUpNote}
                value={values.followUpNote}
                onChange={e => setField("followUpNote", e.target.value)}
                {...controlProps("followUpNote", true, [`${fieldId("followUpNote")}-count`])}
              />
              {errorText("followUpNote")}
              {counter("followUpNote", values.followUpNote, LIMITS.followUpNote)}
            </div>
          )}
        </div>

        <div className="mb-1">
          <label htmlFor={fieldId("attachmentNotes")} className="form-label fw-semibold">Attachment Notes</label>
          <textarea
            className={`form-control${errorFor("attachmentNotes") ? " is-invalid" : ""}`}
            rows={2}
            maxLength={LIMITS.attachmentNotes}
            value={values.attachmentNotes}
            onChange={e => setField("attachmentNotes", e.target.value)}
            {...controlProps("attachmentNotes", false, [`${fieldId("attachmentNotes")}-help`, `${fieldId("attachmentNotes")}-count`])}
          />
          {errorText("attachmentNotes")}
          <div id={`${fieldId("attachmentNotes")}-help`} className="form-text">{ATTACHMENT_HELP}</div>
          {counter("attachmentNotes", values.attachmentNotes, LIMITS.attachmentNotes)}
        </div>
      </form>
    );
  };

  const renderView = (a: ActionTaken) => {
    const rows: [string, React.ReactNode][] = [
      ["Action Date/Time", formatActionTime(a.actionAt)],
      ["Description", a.description],
      ["Status", <ActionStatusBadge status={a.status} />],
      ["Assigned to", `${a.assignee.name}${a.assignee.isActive ? "" : " (inactive)"}`],
      ["Performed by", a.performedBy.name],
      ["Result", a.result ?? "—"],
      ["Follow-up required?", a.followUpRequired ? "Yes" : "No"],
    ];
    if (a.followUpRequired) rows.push(["Follow-up Note", a.followUpNote ?? "—"]);
    rows.push(["Attachment Notes", a.attachmentNotes ?? "—"]);
    return (
      <dl className="mb-0">
        {rows.map(([label, value]) => (
          <div className="mb-3" key={label}>
            <dt className="small text-muted fw-semibold mb-1">{label}</dt>
            <dd className="zg-readonly-field mb-0">{value}</dd>
          </div>
        ))}
      </dl>
    );
  };

  const canChange = !readOnly && !!action && !isTerminal(action) && mode !== "create";

  const footer = editing ? (
    <>
      <button type="button" className="btn btn-outline-secondary zg-touch" onClick={requestClose} disabled={busy}>
        Cancel
      </button>
      <button
        type="button"
        onClick={save}
        className="btn btn-success zg-touch"
        disabled={busy || saveBlocked || (mode === "edit" && !dirty)}
        aria-busy={busy}
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </>
  ) : (
    <>
      <button type="button" className="btn btn-outline-secondary zg-touch" onClick={requestClose}>
        Close
      </button>
      {canChange && (
        <button type="button" className="btn btn-success zg-touch" onClick={() => { setStatusMessage(""); setMode("edit"); }} disabled={busy}>
          Edit
        </button>
      )}
    </>
  );

  return (
    <>
      <AccessibleDialog titleId={`${uid}-title`} title={TITLES[mode]} onRequestClose={requestClose} footer={footer}>
        {alert && (
          <div className="alert alert-danger" role="alert">
            <div>{alert.message}</div>
            {alert.kind === "stale" && alert.current && (
              <button type="button" className="btn btn-sm btn-outline-danger mt-2 zg-touch" onClick={loadLatest}>
                Load latest version
              </button>
            )}
          </div>
        )}
        <div role="status" className="small text-success fw-semibold">{statusMessage}</div>
        {!readOnly && action && isTerminal(action) && (
          <p className="small text-muted fst-italic">Completed and cancelled actions cannot be changed.</p>
        )}

        {editing ? renderForm() : action && renderView(action)}

        {canChange && action && (
          <ActionStatusPanel
            key={action.version}
            action={action}
            blockedByEdits={dirty}
            busy={busy}
            onStart={() => changeStatus("IN_PROGRESS")}
            onConfirm={(step, text) => changeStatus(step === "complete" ? "COMPLETED" : "CANCELLED", text)}
          />
        )}
      </AccessibleDialog>

      {confirmState && (
        <AccessibleDialog
          compact
          titleId={`${uid}-confirm-title`}
          title={confirmState.title}
          onRequestClose={() => setConfirmState(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline-secondary zg-touch" onClick={() => setConfirmState(null)} data-autofocus>
                Keep editing
              </button>
              <button
                type="button"
                className="btn btn-danger zg-touch"
                onClick={() => { const next = confirmState.onConfirm; setConfirmState(null); next(); }}
              >
                {confirmState.confirmLabel}
              </button>
            </>
          }
        >
          <p className="mb-0">{confirmState.text}</p>
        </AccessibleDialog>
      )}
    </>
  );
};
