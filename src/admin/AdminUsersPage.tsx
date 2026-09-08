import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import { UserPlus, Copy, Check } from "lucide-react";
import { AdminPageHeader } from "./AdminPageHeader";
import { adminApi, AdminUser } from "./adminApi";
import { formatBalance } from "./format";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      title="Copy password"
      className="text-slate-500 hover:text-white"
    >
      {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
    </button>
  );
}

const swalDarkStyle = {
  background: "#0f172a",
  color: "#f1f5f9",
  confirmButtonColor: "#6366f1",
  cancelButtonColor: "#334155",
};

type StatusFilter = "active" | "deleted" | "all";

/** Shows a copyable username/password pair. Passwords are bcrypt-hashed server-side and can
 * never be retrieved again after this — this dialog (creation or reset) is the only moment
 * the plaintext value exists, so it's built to be copied and shared immediately. */
async function fireCredentialsDialog(title: string, username: string, password: string): Promise<void> {
  await Swal.fire({
    title,
    html: `
      <div class="space-y-2 text-left">
        <div class="flex items-center justify-between gap-3 rounded-lg bg-slate-800 px-3 py-2">
          <div><div class="text-xs text-slate-400">Username</div><div class="font-mono text-base" id="cred-username">${username}</div></div>
          <button id="copy-username" class="rounded-md bg-indigo-500 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-400">Copy</button>
        </div>
        <div class="flex items-center justify-between gap-3 rounded-lg bg-slate-800 px-3 py-2">
          <div><div class="text-xs text-slate-400">Password</div><div class="font-mono text-base" id="cred-password">${password}</div></div>
          <button id="copy-password" class="rounded-md bg-indigo-500 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-400">Copy</button>
        </div>
        <button id="copy-both" class="mt-1 w-full rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Copy both</button>
        <p class="mt-2 text-xs text-slate-500">This password won't be shown again — copy or share it now.</p>
      </div>
    `,
    icon: "success",
    ...swalDarkStyle,
    didOpen: () => {
      const copy = (text: string, btn: HTMLElement) => {
        navigator.clipboard.writeText(text).then(() => {
          const original = btn.textContent;
          btn.textContent = "Copied!";
          setTimeout(() => {
            btn.textContent = original;
          }, 1200);
        });
      };
      document.getElementById("copy-username")?.addEventListener("click", (e) => copy(username, e.currentTarget as HTMLElement));
      document.getElementById("copy-password")?.addEventListener("click", (e) => copy(password, e.currentTarget as HTMLElement));
      document
        .getElementById("copy-both")
        ?.addEventListener("click", (e) => copy(`${username} / ${password}`, e.currentTarget as HTMLElement));
    },
  });
}

export function AdminUsersPage() {
  const [status, setStatus] = useState<StatusFilter>("active");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", startingBalance: "100" });
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    adminApi
      .listUsers(status)
      .then(setUsers)
      .finally(() => setLoading(false));
  };

  useEffect(load, [status]);

  const submitCreate = async () => {
    setCreating(true);
    try {
      const { credentials } = await adminApi.createUser({
        fullName: form.fullName || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        startingBalance: Number(form.startingBalance) || 0,
      });
      setShowCreate(false);
      setForm({ fullName: "", phone: "", email: "", startingBalance: "100" });
      load();
      await fireCredentialsDialog("Player created", credentials.username, credentials.password);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const message =
        status === 409
          ? "That email or phone number is already used by another player."
          : (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Could not create player.";
      await Swal.fire({ title: "Couldn't create player", text: message, icon: "error", ...swalDarkStyle });
    } finally {
      setCreating(false);
    }
  };

  const resetPassword = async (user: AdminUser) => {
    const confirm = await Swal.fire({
      title: `Reset password for ${user.username}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Reset",
      ...swalDarkStyle,
    });
    if (!confirm.isConfirmed) return;
    const credentials = await adminApi.resetPassword(user._id);
    await fireCredentialsDialog("Password reset", credentials.username, credentials.password);
  };

  const toggleDisabled = async (user: AdminUser) => {
    await adminApi.disableUser(user._id, !user.disabled);
    load();
  };

  const softDelete = async (user: AdminUser) => {
    const confirm = await Swal.fire({
      title: `Delete ${user.username}?`,
      text: "This can be undone by an admin action, but the account will be logged out immediately.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      ...swalDarkStyle,
    });
    if (!confirm.isConfirmed) return;
    await adminApi.deleteUser(user._id);
    load();
  };

  const purge = async (user: AdminUser) => {
    const confirm = await Swal.fire({
      title: `Permanently purge ${user.username}?`,
      text: "This removes all their data and cannot be undone.",
      icon: "error",
      showCancelButton: true,
      confirmButtonText: "Purge",
      ...swalDarkStyle,
    });
    if (!confirm.isConfirmed) return;
    await adminApi.purgeUser(user._id);
    load();
  };

  return (
    <div>
      <AdminPageHeader
        title="Players"
        description="Generate accounts, manage balances, and moderate players."
        actions={
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-400"
          >
            <UserPlus size={16} />
            Generate player
          </button>
        }
      />

      {showCreate && (
        <div className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-4">
          <input
            placeholder="Full name (optional)"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
          <input
            placeholder="Phone (optional)"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
          <input
            placeholder="Email (optional)"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
          <input
            type="number"
            placeholder="Starting balance"
            value={form.startingBalance}
            onChange={(e) => setForm({ ...form, startingBalance: e.target.value })}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
          <button
            onClick={submitCreate}
            disabled={creating}
            className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50 sm:col-span-4"
          >
            {creating ? "Creating..." : "Create player"}
          </button>
        </div>
      )}

      <div className="mb-4 flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1 w-fit">
        {(["active", "deleted", "all"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
              status === s ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Username</th>
              <th className="px-3 py-2">Password</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Balance</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id} className="border-t border-slate-800 hover:bg-slate-900/80">
                <td className="px-3 py-2">
                  <Link to={`/admin/users/${u._id}`} className="text-indigo-400 hover:underline">
                    {u.username}
                  </Link>
                  {u.online && <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </td>
                <td className="px-3 py-2">
                  {u.password ? (
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-slate-300">{u.password}</span>
                      <CopyButton text={u.password} />
                    </span>
                  ) : (
                    <span className="text-slate-600">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-300">{u.fullName ?? "-"}</td>
                <td className="px-3 py-2 text-slate-400">{u.email ?? "-"}</td>
                <td className="px-3 py-2 text-amber-400">{formatBalance(u.balance)}</td>
                <td className="px-3 py-2">
                  {u.deletedAt ? (
                    <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-xs text-rose-400">deleted</span>
                  ) : u.disabled ? (
                    <span className="rounded-full bg-slate-700/50 px-2 py-0.5 text-xs text-slate-400">disabled</span>
                  ) : (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">active</span>
                  )}
                </td>
                <td className="space-x-2 px-3 py-2 text-right">
                  {!u.deletedAt && (
                    <>
                      <button onClick={() => resetPassword(u)} className="text-xs text-slate-400 hover:text-white">
                        Reset pw
                      </button>
                      <button onClick={() => toggleDisabled(u)} className="text-xs text-slate-400 hover:text-white">
                        {u.disabled ? "Enable" : "Disable"}
                      </button>
                      <button onClick={() => softDelete(u)} className="text-xs text-rose-400 hover:text-rose-300">
                        Delete
                      </button>
                    </>
                  )}
                  {u.deletedAt && (
                    <button onClick={() => purge(u)} className="text-xs text-rose-400 hover:text-rose-300">
                      Purge
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  No players found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
