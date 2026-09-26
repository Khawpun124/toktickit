import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import {
  AdminUser,
  UserRole,
  CreateUserPayload,
  UpdateUserPayload,
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  resetAdminUserPassword,
} from "../api.js";

// ── Role badge helpers ──────────────────────────────────────────────────────

function getRoleBadgeStyle(role: string) {
  switch (role) {
    case "IT_STAFF":
      return { backgroundColor: "#E6F0FA", color: "#1B5FA8" };
    case "ADMINISTRATOR":
      return { backgroundColor: "#F3E8FF", color: "#6B21A8" };
    default:
      return { backgroundColor: "#E6F4EA", color: "#137333" };
  }
}

function formatRoleLabel(role: string) {
  switch (role) {
    case "IT_STAFF":
      return "IT Staff";
    case "ADMINISTRATOR":
      return "Administrator";
    default:
      return "Requester";
  }
}

// ── Sub-components ──────────────────────────────────────────────────────────

interface RoleBadgeProps {
  role: string;
}

const RoleBadge: React.FC<RoleBadgeProps> = ({ role }) => (
  <span
    className="badge"
    style={{
      ...getRoleBadgeStyle(role),
      fontSize: "0.78rem",
      padding: "0.25rem 0.6rem",
      borderRadius: "12px",
      fontWeight: 600,
    }}
  >
    {formatRoleLabel(role)}
  </span>
);

interface StatusBadgeProps {
  isActive: boolean;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ isActive }) => (
  <span
    className="badge"
    style={{
      backgroundColor: isActive ? "#E6F4EA" : "#F5F5F5",
      color: isActive ? "#137333" : "#5F6368",
      fontSize: "0.78rem",
      padding: "0.25rem 0.6rem",
      borderRadius: "12px",
      fontWeight: 600,
    }}
  >
    {isActive ? "Active" : "Inactive"}
  </span>
);

// ── Password rules checker ──────────────────────────────────────────────────

function checkPasswordRules(pw: string) {
  return {
    minLength: pw.length >= 8,
    hasUpperLower: /[A-Z]/.test(pw) && /[a-z]/.test(pw),
    hasNumber: /[0-9]/.test(pw),
    hasSpecialChar: /[^A-Za-z0-9]/.test(pw),
  };
}

// ── Main Component ──────────────────────────────────────────────────────────

type PanelMode = "create" | "edit" | null;

export const UserManagementScreen: React.FC = () => {
  const { user: authUser, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // List state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  // Panel state
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Form fields
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("REQUESTER");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formPassword, setFormPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Form errors
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset password panel
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  // ── Fetch users ───────────────────────────────────────────────────────────

  const fetchUsers = useCallback(
    async (s?: string, r?: string) => {
      setListLoading(true);
      setListError(null);
      try {
        const data = await getAdminUsers(s ?? search, r ?? roleFilter);
        setUsers(data);
      } catch (err: any) {
        if (err.status === 403) {
          // Handled by forbidden check below
        } else {
          setListError(err.message ?? "Unable to load users");
        }
      } finally {
        setListLoading(false);
      }
    },
    [search, roleFilter]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      navigate("/");
      return;
    }
    if (authUser.role !== "ADMINISTRATOR") {
      // Forbidden state — rendered below
      setListLoading(false);
      return;
    }
    fetchUsers();
  }, [authUser, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search / filter
  useEffect(() => {
    if (!authUser || authUser.role !== "ADMINISTRATOR") return;
    const t = setTimeout(() => {
      fetchUsers(search, roleFilter);
    }, 300);
    return () => clearTimeout(t);
  }, [search, roleFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Panel helpers ─────────────────────────────────────────────────────────

  const openCreatePanel = () => {
    setSelectedUser(null);
    setFormName("");
    setFormEmail("");
    setFormRole("REQUESTER");
    setFormIsActive(true);
    setFormPassword("");
    setShowPassword(false);
    setEmailError(null);
    setFormError(null);
    setFormSuccess(null);
    setPanelMode("create");
  };

  const openEditPanel = (u: AdminUser) => {
    setSelectedUser(u);
    setFormName(u.name);
    setFormEmail(u.email);
    setFormRole(u.role);
    setFormIsActive(u.isActive);
    setFormPassword("");
    setShowPassword(false);
    setEmailError(null);
    setFormError(null);
    setFormSuccess(null);
    setResetPassword("");
    setShowResetPassword(false);
    setResetError(null);
    setResetSuccess(null);
    setPanelMode("edit");
  };

  const closePanel = () => {
    setPanelMode(null);
    setSelectedUser(null);
  };

  // ── Submit create ─────────────────────────────────────────────────────────

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setFormError(null);
    setFormSuccess(null);

    if (!formName.trim() || !formEmail.trim() || !formPassword.trim()) {
      setFormError("All fields are required.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateUserPayload = {
        name: formName.trim(),
        email: formEmail.trim(),
        role: formRole,
        isActive: formIsActive,
        initialPassword: formPassword,
      };
      await createAdminUser(payload);
      setFormSuccess("User created successfully.");
      await fetchUsers(search, roleFilter);
      // Keep panel open showing success
    } catch (err: any) {
      if (err.status === 400 && err.message?.toLowerCase().includes("email")) {
        setEmailError(err.message);
      } else if (err.status === 400) {
        setFormError(err.message ?? "Validation error.");
      } else {
        setFormError(err.message ?? "Unable to create user.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Submit edit ───────────────────────────────────────────────────────────

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setEmailError(null);
    setFormError(null);
    setFormSuccess(null);

    setSubmitting(true);
    try {
      const payload: UpdateUserPayload = {
        name: formName.trim(),
        email: formEmail.trim(),
        role: formRole,
        isActive: formIsActive,
      };
      const updated = await updateAdminUser(selectedUser.id, payload);
      setSelectedUser(updated);
      setFormSuccess("User updated successfully.");
      await fetchUsers(search, roleFilter);
    } catch (err: any) {
      if (err.status === 400 && err.message?.toLowerCase().includes("email")) {
        setEmailError(err.message);
      } else if (err.status === 403) {
        setFormError(err.message ?? "Action not allowed.");
      } else if (err.status === 400) {
        setFormError(err.message ?? "Validation error.");
      } else {
        setFormError(err.message ?? "Unable to update user.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Submit reset password ─────────────────────────────────────────────────

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setResetError(null);
    setResetSuccess(null);

    if (!resetPassword.trim()) {
      setResetError("New initial password is required.");
      return;
    }

    setResetting(true);
    try {
      await resetAdminUserPassword(selectedUser.id, resetPassword);
      setResetSuccess("Password reset successfully. User will be required to change it on next login.");
      setResetPassword("");
    } catch (err: any) {
      setResetError(err.message ?? "Unable to reset password.");
    } finally {
      setResetting(false);
    }
  };

  // ── Forbidden check ───────────────────────────────────────────────────────

  if (authLoading || (!authUser && listLoading)) {
    return (
      <div className="min-vh-100 d-flex justify-content-center align-items-center">
        <div className="spinner-border text-success" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (authUser && authUser.role !== "ADMINISTRATOR") {
    return (
      <div className="container py-5 text-center">
        <div
          className="mx-auto p-4 rounded-3"
          style={{ maxWidth: 480, border: "1px solid #f8d7da", backgroundColor: "#fff5f5" }}
        >
          <div style={{ fontSize: "3rem" }}>🚫</div>
          <h2 className="h4 mt-3 mb-2" style={{ color: "#842029" }}>
            403 Forbidden
          </h2>
          <p className="mb-3" style={{ color: "#842029" }}>
            Access denied. You do not have permission to view User Management.
          </p>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate(-1)}>
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  const passwordRules = checkPasswordRules(formPassword);
  const panelOpen = panelMode !== null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-vh-100" style={{ backgroundColor: "var(--zg-bg, #F6F8F7)" }}>
      {/* Page header */}
      <div
        className="py-3 px-4 border-bottom"
        style={{ backgroundColor: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
      >
        <div className="container-fluid">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div>
              <h1 className="h4 mb-0 fw-bold" style={{ color: "var(--zg-primary, #1A7A4A)" }}>
                User Management
              </h1>
              <p className="mb-0 text-muted small">Create and manage TokTickIT user accounts</p>
            </div>
            <button
              id="create-user-btn"
              className="btn btn-success"
              onClick={openCreatePanel}
              style={{ backgroundColor: "var(--zg-primary, #1A7A4A)", borderColor: "var(--zg-primary, #1A7A4A)" }}
            >
              + Create User
            </button>
          </div>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="container-fluid py-4">
        <div className="row g-4 align-items-start">
          {/* ── LEFT: User list ── */}
          <div className={panelOpen ? "col-12 col-lg-7" : "col-12"}>
            {/* Search & filter bar */}
            <div className="card border-0 shadow-sm mb-3" style={{ borderRadius: 12 }}>
              <div className="card-body py-3">
                <div className="row g-2">
                  <div className="col-12 col-md-8">
                    <input
                      id="user-search-input"
                      type="search"
                      className="form-control"
                      placeholder="Search by name or email…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      aria-label="Search users"
                    />
                  </div>
                  <div className="col-12 col-md-4">
                    <select
                      id="user-role-filter"
                      className="form-select"
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                      aria-label="Filter by role"
                    >
                      <option value="">All Roles</option>
                      <option value="REQUESTER">Requester</option>
                      <option value="IT_STAFF">IT Staff</option>
                      <option value="ADMINISTRATOR">Administrator</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* List */}
            {listLoading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-success" role="status">
                  <span className="visually-hidden">Loading users…</span>
                </div>
              </div>
            ) : listError ? (
              <div className="alert alert-danger">{listError}</div>
            ) : users.length === 0 ? (
              <div className="text-center py-5 text-muted">
                {search || roleFilter ? "No users match your search." : "No users found."}
              </div>
            ) : (
              <div className="card border-0 shadow-sm" style={{ borderRadius: 12, overflow: "hidden" }}>
                <div className="table-responsive">
                  <table className="table table-hover mb-0 align-middle">
                    <thead style={{ backgroundColor: "#F8FAF9" }}>
                      <tr>
                        <th className="ps-4 py-3 fw-semibold text-muted small border-0">Name</th>
                        <th className="py-3 fw-semibold text-muted small border-0 d-none d-sm-table-cell">Email</th>
                        <th className="py-3 fw-semibold text-muted small border-0">Role</th>
                        <th className="py-3 fw-semibold text-muted small border-0">Status</th>
                        <th className="py-3 fw-semibold text-muted small border-0 pe-4">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr
                          key={u.id}
                          style={{
                            backgroundColor:
                              selectedUser?.id === u.id ? "rgba(26,122,74,0.05)" : undefined,
                            cursor: "default",
                          }}
                        >
                          <td className="ps-4 py-3">
                            <div className="fw-semibold text-dark">{u.name}</div>
                            <div className="d-sm-none text-muted small">{u.email}</div>
                          </td>
                          <td className="py-3 d-none d-sm-table-cell text-muted small">{u.email}</td>
                          <td className="py-3">
                            <RoleBadge role={u.role} />
                          </td>
                          <td className="py-3">
                            <StatusBadge isActive={u.isActive} />
                          </td>
                          <td className="py-3 pe-4">
                            <button
                              id={`edit-user-${u.id}-btn`}
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => openEditPanel(u)}
                              style={{ borderRadius: 8 }}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: Slide-over panel (desktop) / full-screen modal (mobile) ── */}
          {panelOpen && (
            <>
              {/* Desktop slide-over */}
              <div className="col-lg-5 d-none d-lg-block">
                <div
                  className="card border-0 shadow"
                  style={{ borderRadius: 16, position: "sticky", top: 80 }}
                >
                  <PanelContent
                    mode={panelMode!}
                    selectedUser={selectedUser}
                    authUser={authUser}
                    formName={formName}
                    formEmail={formEmail}
                    formRole={formRole}
                    formIsActive={formIsActive}
                    formPassword={formPassword}
                    showPassword={showPassword}
                    emailError={emailError}
                    formError={formError}
                    formSuccess={formSuccess}
                    submitting={submitting}
                    resetPassword={resetPassword}
                    showResetPassword={showResetPassword}
                    resetError={resetError}
                    resetSuccess={resetSuccess}
                    resetting={resetting}
                    passwordRules={passwordRules}
                    onChangeName={setFormName}
                    onChangeEmail={(v) => { setFormEmail(v); setEmailError(null); }}
                    onChangeRole={setFormRole}
                    onChangeIsActive={setFormIsActive}
                    onChangePassword={setFormPassword}
                    onToggleShowPassword={() => setShowPassword((p) => !p)}
                    onChangeResetPassword={setResetPassword}
                    onToggleShowResetPassword={() => setShowResetPassword((p) => !p)}
                    onSubmitCreate={handleCreate}
                    onSubmitEdit={handleEdit}
                    onSubmitReset={handleResetPassword}
                    onClose={closePanel}
                  />
                </div>
              </div>

              {/* Mobile full-screen modal overlay */}
              <div
                className="d-lg-none"
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 1050,
                  backgroundColor: "rgba(0,0,0,0.45)",
                  display: "flex",
                  alignItems: "flex-end",
                }}
                onClick={(e) => { if (e.target === e.currentTarget) closePanel(); }}
              >
                <div
                  className="bg-white w-100"
                  style={{
                    borderRadius: "20px 20px 0 0",
                    maxHeight: "92vh",
                    overflowY: "auto",
                    padding: "0 0 env(safe-area-inset-bottom)",
                  }}
                >
                  <PanelContent
                    mode={panelMode!}
                    selectedUser={selectedUser}
                    authUser={authUser}
                    formName={formName}
                    formEmail={formEmail}
                    formRole={formRole}
                    formIsActive={formIsActive}
                    formPassword={formPassword}
                    showPassword={showPassword}
                    emailError={emailError}
                    formError={formError}
                    formSuccess={formSuccess}
                    submitting={submitting}
                    resetPassword={resetPassword}
                    showResetPassword={showResetPassword}
                    resetError={resetError}
                    resetSuccess={resetSuccess}
                    resetting={resetting}
                    passwordRules={passwordRules}
                    onChangeName={setFormName}
                    onChangeEmail={(v) => { setFormEmail(v); setEmailError(null); }}
                    onChangeRole={setFormRole}
                    onChangeIsActive={setFormIsActive}
                    onChangePassword={setFormPassword}
                    onToggleShowPassword={() => setShowPassword((p) => !p)}
                    onChangeResetPassword={setResetPassword}
                    onToggleShowResetPassword={() => setShowResetPassword((p) => !p)}
                    onSubmitCreate={handleCreate}
                    onSubmitEdit={handleEdit}
                    onSubmitReset={handleResetPassword}
                    onClose={closePanel}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Panel content (shared between desktop slide-over and mobile modal) ───────

interface PanelContentProps {
  mode: PanelMode;
  selectedUser: AdminUser | null;
  authUser: any;
  formName: string;
  formEmail: string;
  formRole: UserRole;
  formIsActive: boolean;
  formPassword: string;
  showPassword: boolean;
  emailError: string | null;
  formError: string | null;
  formSuccess: string | null;
  submitting: boolean;
  resetPassword: string;
  showResetPassword: boolean;
  resetError: string | null;
  resetSuccess: string | null;
  resetting: boolean;
  passwordRules: ReturnType<typeof checkPasswordRules>;
  onChangeName: (v: string) => void;
  onChangeEmail: (v: string) => void;
  onChangeRole: (v: UserRole) => void;
  onChangeIsActive: (v: boolean) => void;
  onChangePassword: (v: string) => void;
  onToggleShowPassword: () => void;
  onChangeResetPassword: (v: string) => void;
  onToggleShowResetPassword: () => void;
  onSubmitCreate: (e: React.FormEvent) => void;
  onSubmitEdit: (e: React.FormEvent) => void;
  onSubmitReset: (e: React.FormEvent) => void;
  onClose: () => void;
}

const PanelContent: React.FC<PanelContentProps> = ({
  mode,
  selectedUser,
  authUser,
  formName,
  formEmail,
  formRole,
  formIsActive,
  formPassword,
  showPassword,
  emailError,
  formError,
  formSuccess,
  submitting,
  resetPassword,
  showResetPassword,
  resetError,
  resetSuccess,
  resetting,
  passwordRules,
  onChangeName,
  onChangeEmail,
  onChangeRole,
  onChangeIsActive,
  onChangePassword,
  onToggleShowPassword,
  onChangeResetPassword,
  onToggleShowResetPassword,
  onSubmitCreate,
  onSubmitEdit,
  onSubmitReset,
  onClose,
}) => {
  const isSelf = selectedUser?.id === authUser?.id;

  return (
    <div className="p-4">
      {/* Panel header */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h2 className="h5 fw-bold mb-0" style={{ color: "var(--zg-primary, #1A7A4A)" }}>
          {mode === "create" ? "Create New User" : "Edit User"}
        </h2>
        <button
          id="close-panel-btn"
          type="button"
          className="btn-close"
          aria-label="Close"
          onClick={onClose}
        />
      </div>

      {/* Success alert */}
      {formSuccess && (
        <div id="user-form-success" className="alert alert-success py-2 small mb-3">
          {formSuccess}
        </div>
      )}

      {/* Form-level error (self-deactivation, last-admin, etc.) */}
      {formError && (
        <div id="user-form-error" className="alert alert-danger py-2 small mb-3">
          {formError}
        </div>
      )}

      {/* User form */}
      <form onSubmit={mode === "create" ? onSubmitCreate : onSubmitEdit} noValidate>
        {/* Full Name */}
        <div className="mb-3">
          <label htmlFor="user-form-name" className="form-label fw-semibold small">
            Full Name
          </label>
          <input
            id="user-form-name"
            type="text"
            className="form-control"
            value={formName}
            onChange={(e) => onChangeName(e.target.value)}
            placeholder="e.g. Jane Smith"
            required
          />
        </div>

        {/* Email Address */}
        <div className="mb-3">
          <label htmlFor="user-form-email" className="form-label fw-semibold small">
            Email Address
          </label>
          <input
            id="user-form-email"
            type="email"
            className={`form-control ${emailError ? "is-invalid" : ""}`}
            value={formEmail}
            onChange={(e) => onChangeEmail(e.target.value)}
            placeholder="e.g. jane.smith@example.com"
            required
          />
          {emailError && (
            <div id="user-form-email-error" className="invalid-feedback d-block small">
              {emailError}
            </div>
          )}
        </div>

        {/* Role */}
        <div className="mb-3">
          <label htmlFor="user-form-role" className="form-label fw-semibold small">
            Role
          </label>
          <select
            id="user-form-role"
            className="form-select"
            value={formRole}
            onChange={(e) => onChangeRole(e.target.value as UserRole)}
          >
            <option value="REQUESTER">Requester</option>
            <option value="IT_STAFF">IT Staff</option>
            <option value="ADMINISTRATOR">Administrator</option>
          </select>
        </div>

        {/* Active toggle */}
        <div className="mb-3">
          <div className="form-check form-switch">
            <input
              id="user-form-active"
              className="form-check-input"
              type="checkbox"
              role="switch"
              checked={formIsActive}
              onChange={(e) => onChangeIsActive(e.target.checked)}
            />
            <label htmlFor="user-form-active" className="form-check-label fw-semibold small">
              Active
            </label>
          </div>
          {mode === "edit" && isSelf && !formIsActive && (
            <div id="user-form-error" className="text-danger small mt-1">
              You cannot deactivate your own account.
            </div>
          )}
        </div>

        {/* Initial password (create mode only) */}
        {mode === "create" && (
          <div className="mb-3">
            <label htmlFor="user-form-password" className="form-label fw-semibold small">
              Initial Password
            </label>
            <div className="input-group">
              <input
                id="user-form-password"
                type={showPassword ? "text" : "password"}
                className="form-control"
                value={formPassword}
                onChange={(e) => onChangePassword(e.target.value)}
                placeholder="Set temporary password"
                required
              />
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={onToggleShowPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
            <div className="form-text small text-muted mt-1">
              User will be required to change this password at first login.
            </div>
            {/* Password rules */}
            {formPassword.length > 0 && (
              <ul className="list-unstyled mt-2 mb-0" style={{ fontSize: "0.8rem" }}>
                <PasswordRule ok={passwordRules.minLength} label="At least 8 characters" />
                <PasswordRule ok={passwordRules.hasUpperLower} label="Upper and lowercase letters" />
                <PasswordRule ok={passwordRules.hasNumber} label="At least one number" />
                <PasswordRule ok={passwordRules.hasSpecialChar} label="At least one special character" />
              </ul>
            )}
          </div>
        )}

        {/* Save button */}
        <button
          id="user-form-submit-btn"
          type="submit"
          className="btn btn-success w-100"
          disabled={submitting}
          style={{ backgroundColor: "var(--zg-primary, #1A7A4A)", borderColor: "var(--zg-primary, #1A7A4A)" }}
        >
          {submitting
            ? mode === "create"
              ? "Creating…"
              : "Saving…"
            : mode === "create"
            ? "Create User"
            : "Save Changes"}
        </button>
      </form>

      {/* Edit-only: Reset Initial Password section */}
      {mode === "edit" && selectedUser && (
        <div className="mt-4 pt-4 border-top">
          <h3 className="h6 fw-bold mb-3" style={{ color: "#495057" }}>
            Set New Initial Password
          </h3>
          <p className="text-muted small mb-3">
            This will set a new temporary password. The user will be required to change it at next login.
          </p>

          {resetSuccess && (
            <div id="reset-password-success" className="alert alert-success py-2 small mb-3">
              {resetSuccess}
            </div>
          )}
          {resetError && (
            <div id="reset-password-error" className="alert alert-danger py-2 small mb-3">
              {resetError}
            </div>
          )}

          <form onSubmit={onSubmitReset} noValidate>
            <div className="mb-3">
              <label htmlFor="user-reset-password" className="form-label fw-semibold small">
                New Initial Password
              </label>
              <div className="input-group">
                <input
                  id="user-reset-password"
                  type={showResetPassword ? "text" : "password"}
                  className="form-control"
                  value={resetPassword}
                  onChange={(e) => onChangeResetPassword(e.target.value)}
                  placeholder="New temporary password"
                />
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={onToggleShowResetPassword}
                  aria-label={showResetPassword ? "Hide password" : "Show password"}
                >
                  {showResetPassword ? "🙈" : "👁"}
                </button>
              </div>
            </div>
            <button
              id="reset-password-btn"
              type="submit"
              className="btn btn-warning w-100"
              disabled={resetting || !resetPassword.trim()}
            >
              {resetting ? "Resetting…" : "Reset Password"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

// ── Password rule item ────────────────────────────────────────────────────────

const PasswordRule: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <li style={{ color: ok ? "#137333" : "#5F6368" }}>
    {ok ? "✓" : "✗"} {label}
  </li>
);
