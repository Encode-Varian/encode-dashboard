import { useState } from "react";

const DASHBOARD_PASSWORD = "encode2026";

export default function PasswordGate({ children }) {
  const [password, setPassword] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(() => {
    return localStorage.getItem("encode_dashboard_unlocked") === "true";
  });
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();

    if (password === DASHBOARD_PASSWORD) {
      localStorage.setItem("encode_dashboard_unlocked", "true");
      setIsUnlocked(true);
      setError("");
    } else {
      setError("Incorrect password. Please try again.");
    }
  }

  function handleLogout() {
    localStorage.removeItem("encode_dashboard_unlocked");
    setIsUnlocked(false);
    setPassword("");
  }

  if (isUnlocked) {
    return (
      <div>
        <div className="flex justify-end bg-slate-50 px-6 pt-4">
          <button
            onClick={handleLogout}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-100"
          >
            Lock Dashboard
          </button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#53C8E0]/15 text-2xl font-bold text-[#0E8FA4]">
            E
          </div>

          <h1 className="text-2xl font-bold text-slate-900">
            Encode Dashboard
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Enter the team password to view the dashboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Password
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-[#53C8E0]"
              placeholder="Enter password"
              autoFocus
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-[#53C8E0] px-4 py-3 text-sm font-bold text-white shadow-sm hover:opacity-90"
          >
            Unlock Dashboard
          </button>
        </form>
      </div>
    </div>
  );
}