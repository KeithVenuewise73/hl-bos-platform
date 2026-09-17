"use client";

import { useEffect, useState, type ReactNode } from "react";

import type { Agency } from "@/lib/api";
import { signOut } from "@/lib/auth";

export interface NavItem {
  key: string;
  label: string;
  icon: string;
  group: string;
}

export default function Shell({
  email,
  agencies,
  agency,
  onAgency,
  nav,
  active,
  onNavigate,
  children,
}: {
  email: string | null;
  agencies: Agency[];
  agency: Agency | null;
  onAgency: (tenantId: string) => void;
  nav: NavItem[];
  active: string;
  onNavigate: (key: string) => void;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = document.documentElement.getAttribute("data-theme");
    if (saved === "dark" || saved === "light") setTheme(saved);
  }, []);

  function flip() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("hlbos-cockpit-theme", next);
    } catch {
      // A browser that refuses storage still gets the theme for this session.
    }
  }

  const groups = [...new Set(nav.map((n) => n.group))];

  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">
          <div className="brand-mark">HL</div>
          <div>
            <div className="brand-name">Cockpit</div>
            <div className="brand-sub">Barbershop transformation</div>
          </div>
        </div>

        {groups.map((g) => (
          <div key={g}>
            <div className="nav-group">{g}</div>
            {nav
              .filter((n) => n.group === g)
              .map((n) => (
                <button
                  key={n.key}
                  className={`nav-item${active === n.key ? " active" : ""}`}
                  onClick={() => onNavigate(n.key)}
                >
                  <span className="nav-ico">{n.icon}</span>
                  {n.label}
                </button>
              ))}
          </div>
        ))}
      </nav>

      <div className="main">
        <div className="topbar">
          <div className="row">
            {/*
              The agency selector is not cosmetic. Every audit RPC takes a
              tenant id and checks the permission on THAT tenant, so which
              agency is selected decides what the whole console can do.
            */}
            {agencies.length > 1 ? (
              <select
                value={agency?.tenant_id ?? ""}
                onChange={(e) => onAgency(e.target.value)}
                style={{ maxWidth: 260 }}
              >
                {agencies.map((a) => (
                  <option key={a.tenant_id} value={a.tenant_id}>
                    {a.name}
                  </option>
                ))}
              </select>
            ) : (
              <strong style={{ fontSize: 14 }}>{agency?.name ?? "No agency"}</strong>
            )}
          </div>
          <div className="row">
            <span className="dim" style={{ fontSize: 12.5 }}>
              {email}
            </span>
            <button className="btn sm" onClick={flip} aria-label="Switch theme">
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <button className="btn sm" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
