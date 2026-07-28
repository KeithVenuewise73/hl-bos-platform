"use client";

import { useState, useEffect } from "react";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import type { Nav, Go } from "@/lib/nav";
import Analyze from "@/screens/Analyze";
import CommandCenter from "@/screens/CommandCenter";
import CeoDashboard from "@/screens/CeoDashboard";
import Clients from "@/screens/Clients";
import Engagement from "@/screens/Engagement";

export default function Page() {
  return (
    <WorkspaceProvider>
      <App />
    </WorkspaceProvider>
  );
}

function App() {
  const { ready, reset } = useWorkspace();
  const [nav, setNav] = useState<Nav>({ view: "analyze", tab: "overview" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const t =
      (document.documentElement.getAttribute("data-theme") as "light" | "dark") ??
      "light";
    setTheme(t);
  }, []);

  const go: Go = (next) => {
    setNav((cur) => ({ ...cur, ...next }));
    setMenuOpen(false);
  };

  function toggleTheme() {
    const t = theme === "dark" ? "light" : "dark";
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("hl-bti-theme", t);
    } catch {
      /* ignore */
    }
  }

  const navItem = (view: Nav["view"], icon: string, label: string) => (
    <button
      className={`nav-item${nav.view === view ? " active" : ""}`}
      onClick={() => go({ view })}
    >
      <span className="nav-ico">{icon}</span> {label}
    </button>
  );

  return (
    <div className="app">
      <aside className={`nav${menuOpen ? " open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">BT</div>
          <div>
            <div className="brand-name">HL-BTI Alpha</div>
            <div className="brand-sub">Business Transformation</div>
          </div>
        </div>

        <div className="nav-group">Start here</div>
        {navItem("analyze", "⚡", "Analyze Business")}

        <div className="nav-group">Executive</div>
        {navItem("command", "🏢", "CEO Command Center")}
        {navItem("ceo", "📊", "Executive Dashboard")}

        <div className="nav-group">Engagements</div>
        {navItem("clients", "📋", "Clients")}

        <div className="nav-group">Workspace</div>
        <button
          className="nav-item"
          onClick={() => {
            if (confirm("Reset the Alpha local workspace to its seeded state?"))
              reset();
          }}
        >
          <span className="nav-ico">↺</span> Reset workspace
        </button>

        <div
          className="dim"
          style={{ fontSize: 11, marginTop: 24, padding: "0 8px", lineHeight: 1.5 }}
        >
          Reuses the HL-BTI backend engine (@hl-bos/bti-engine). No platform service is
          duplicated.
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="row">
            <button className="btn sm menu-btn" onClick={() => setMenuOpen((o) => !o)}>
              ☰
            </button>
            <div className="banner">
              🔒 Alpha local workspace — data lives in this browser, not a production
              database.
            </div>
          </div>
          <button className="btn sm" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? "☀ Light" : "🌙 Dark"}
          </button>
        </div>

        {!ready ? (
          <div className="content">
            <div className="dim">Loading workspace…</div>
          </div>
        ) : nav.view === "analyze" ? (
          <Analyze />
        ) : nav.view === "command" ? (
          <CommandCenter go={go} />
        ) : nav.view === "ceo" ? (
          <CeoDashboard go={go} />
        ) : nav.view === "clients" ? (
          <Clients go={go} />
        ) : (
          <Engagement nav={nav} go={go} />
        )}
      </div>
    </div>
  );
}
