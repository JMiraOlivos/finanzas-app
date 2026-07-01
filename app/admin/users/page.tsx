"use client";

import { useEffect, useState, useCallback } from "react";

type User = {
  id: string; email: string; fullName: string | null;
  role: string; isActive: boolean; companyCount: number;
};
type Company = { companyId: string; companyName: string; canView: boolean; canExport: boolean; canViewMovements: boolean };

const ROLES = ["admin", "finance", "director", "partner", "stakeholder"] as const;
const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", finance: "Finance", director: "Director", partner: "Partner", stakeholder: "Stakeholder",
};

export default function UsersPage() {
  const [users,     setUsers]     = useState<User[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState<User | null>(null);
  const [access,    setAccess]    = useState<Company[]>([]);
  const [showNew,   setShowNew]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [newForm,   setNewForm]   = useState({ email: "", fullName: "", role: "partner", password: "" });
  const [newError,  setNewError]  = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/admin/users");
    setUsers(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function loadAccess(userId: string) {
    const r = await fetch(`/api/admin/users/${userId}/access`);
    setAccess(await r.json());
  }

  async function selectUser(u: User) {
    setSelected(u);
    await loadAccess(u.id);
  }

  async function toggleActive(u: User) {
    await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    await loadUsers();
    if (selected?.id === u.id) setSelected({ ...u, isActive: !u.isActive });
  }

  async function changeRole(u: User, role: string) {
    await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    await loadUsers();
    if (selected?.id === u.id) setSelected({ ...u, role });
  }

  async function saveAccess() {
    if (!selected) return;
    setSaving(true);
    await fetch(`/api/admin/users/${selected.id}/access`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(access),
    });
    setSaving(false);
    await loadUsers();
  }

  function toggleCompanyAccess(companyId: string, field: "canView" | "canExport" | "canViewMovements") {
    setAccess((prev) => prev.map((c) => c.companyId === companyId ? { ...c, [field]: !c[field] } : c));
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setNewError(null);
    setSaving(true);
    const res  = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newForm),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setNewError(data.error); return; }
    setShowNew(false);
    setNewForm({ email: "", fullName: "", role: "partner", password: "" });
    await loadUsers();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-head text-ev-black">Gestión de Usuarios</h1>
          <p className="text-xs font-body text-ev-gray3 mt-1 uppercase tracking-[0.1em]">Solo administradores</p>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="text-sm font-body px-4 py-2 bg-ev-black text-white hover:bg-ev-gray1"
        >
          + Nuevo usuario
        </button>
      </div>

      {/* New user form */}
      {showNew && (
        <form onSubmit={createUser} className="border border-ev-gray7 bg-white p-5 max-w-md space-y-3">
          <p className="text-sm font-body font-medium text-ev-black mb-2">Crear usuario</p>
          {newError && <p className="text-xs text-ev-red font-body">{newError}</p>}
          {[
            { label: "Email", key: "email", type: "email" },
            { label: "Nombre completo", key: "fullName", type: "text" },
            { label: "Contraseña (mín. 8 caracteres)", key: "password", type: "password" },
          ].map(({ label, key, type }) => (
            <div key={key}>
              <label className="block text-xs font-body text-ev-gray3 mb-0.5">{label}</label>
              <input
                type={type}
                required={key !== "fullName"}
                value={(newForm as Record<string, string>)[key]}
                onChange={(e) => setNewForm({ ...newForm, [key]: e.target.value })}
                className="w-full border border-ev-gray6 px-2 py-1.5 text-sm font-body focus:outline-none focus:ring-1 focus:ring-ev-black"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-body text-ev-gray3 mb-0.5">Rol</label>
            <select
              value={newForm.role}
              onChange={(e) => setNewForm({ ...newForm, role: e.target.value })}
              className="w-full border border-ev-gray6 px-2 py-1.5 text-sm font-body focus:outline-none"
            >
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="px-4 py-1.5 text-sm font-body bg-ev-black text-white disabled:opacity-40">
              {saving ? "Guardando…" : "Crear"}
            </button>
            <button type="button" onClick={() => setShowNew(false)} className="px-4 py-1.5 text-sm font-body border border-ev-gray6 hover:bg-ev-beige2">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* User list */}
        <div className="border border-ev-gray7 bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-ev-gray7 bg-ev-beige2">
            <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">Usuarios ({users.length})</p>
          </div>
          {loading ? (
            <div className="p-4 space-y-2">
              {[1,2,3].map((i) => <div key={i} className="h-8 bg-neutral-100 animate-pulse rounded" />)}
            </div>
          ) : (
            <div className="divide-y divide-ev-gray7">
              {users.map((u) => (
                <div
                  key={u.id}
                  onClick={() => selectUser(u)}
                  className={[
                    "px-4 py-3 cursor-pointer hover:bg-ev-beige2 flex items-center justify-between gap-3",
                    selected?.id === u.id ? "bg-ev-beige1" : "",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-body font-medium text-ev-black truncate">{u.fullName ?? u.email}</p>
                    <p className="text-xs font-body text-ev-gray3 truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-body uppercase tracking-widest text-ev-gray3">{ROLE_LABELS[u.role]}</span>
                    <span className={["w-1.5 h-1.5 rounded-full", u.isActive ? "bg-green-500" : "bg-ev-gray6"].join(" ")} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* User detail */}
        {selected && (
          <div className="border border-ev-gray7 bg-white overflow-hidden">
            <div className="px-4 py-2.5 border-b border-ev-gray7 bg-ev-beige2 flex justify-between items-center">
              <p className="text-[10px] font-body uppercase tracking-[0.1em] text-ev-gray3">
                {selected.fullName ?? selected.email}
              </p>
              <button
                onClick={() => toggleActive(selected)}
                className="text-xs font-body text-ev-gray3 underline hover:text-ev-black"
              >
                {selected.isActive ? "Desactivar" : "Activar"}
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Role */}
              <div>
                <label className="block text-xs font-body text-ev-gray3 mb-1">Rol</label>
                <div className="flex gap-1 flex-wrap">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => changeRole(selected, r)}
                      className={[
                        "text-xs font-body px-3 py-1 border",
                        selected.role === r ? "bg-ev-black text-white border-ev-black" : "border-ev-gray6 text-ev-gray2 hover:bg-ev-beige2",
                      ].join(" ")}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
                {(selected.role === "admin" || selected.role === "finance") && (
                  <p className="text-xs font-body text-ev-gray3 mt-1">Este rol tiene acceso a todas las empresas automáticamente.</p>
                )}
              </div>

              {/* Company access */}
              {selected.role !== "admin" && selected.role !== "finance" && (
                <div>
                  <label className="block text-xs font-body text-ev-gray3 mb-2">Acceso a empresas</label>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {access.map((c) => (
                      <div key={c.companyId} className="flex items-center gap-3 py-1">
                        <span className="text-sm font-body text-ev-black flex-1 truncate">{c.companyName}</span>
                        {(["canView", "canExport", "canViewMovements"] as const).map((field) => (
                          <label key={field} className="flex items-center gap-1 text-xs font-body text-ev-gray3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={c[field]}
                              onChange={() => toggleCompanyAccess(c.companyId, field)}
                              className="accent-ev-black"
                            />
                            {field === "canView" ? "Ver" : field === "canExport" ? "Export" : "Movim."}
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={saveAccess}
                    disabled={saving}
                    className="mt-3 px-4 py-1.5 text-sm font-body bg-ev-black text-white disabled:opacity-40"
                  >
                    {saving ? "Guardando…" : "Guardar accesos"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
