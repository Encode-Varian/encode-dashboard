import { useState } from "react";
import PasswordGate from "./PasswordGate";
import RevenueDashboard from "./pages/RevenueDashboard";
import CampDashboard from "./pages/CampDashboard";
import TermDashboard from "./pages/TermDashboard";

export default function App() {
  const [activePage, setActivePage] = useState("revenue");

  const navItems = [
    { id: "revenue", label: "Revenue Dashboard" },
    { id: "camp", label: "Camp Dashboard" },
    { id: "term", label: "Term Dashboard" },
  ];

  return (
    <PasswordGate>
      <div className="min-h-screen bg-slate-50">
        <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  activePage === item.id
                    ? "bg-[#53C8E0] text-white"
                    : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        {activePage === "revenue" && <RevenueDashboard />}
        {activePage === "camp" && <CampDashboard />}
        {activePage === "term" && <TermDashboard />}
      </div>
    </PasswordGate>
  );
}