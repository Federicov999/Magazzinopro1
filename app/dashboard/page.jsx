"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import "./dashboard.css";

const typeIcon  = { load: "📦", unload: "🍳", waste: "🗑", adjustment: "🔧" };
const typeClass = { load: "type-load", unload: "type-unload", waste: "type-waste", adjustment: "type-unload" };
const qtyClass  = { load: "qty-positive", unload: "qty-negative", waste: "qty-waste", adjustment: "qty-negative" };
const typeLabel = { load: "Carico", unload: "Scarico cucina", waste: "Spreco", adjustment: "Rettifica" };

export default function Dashboard() {
  const [activeNav, setActiveNav] = useState("dashboard");
  const [kpi, setKpi] = useState({ totProdotti: 0, valMagazzino: "0", scorteBasse: 0, movimentiOggi: 0 });
  const [alerts, setAlerts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [scorteBasse, setScorteBasse] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      // Prodotti attivi
      const { data: products } = await supabase
        .from("products")
        .select("*, categories(id, name, color)")
        .eq("active", true);

      if (products) {
        const totProdotti = products.length;
        const valMagazzino = products
          .reduce((sum, p) => sum + (p.current_stock * (p.cost_per_unit || 0)), 0)
          .toFixed(2);

        const sottosoglia = products.filter(p => p.current_stock <= p.min_stock);
        const scorteBasseList = sottosoglia.map(p => {
          const pct = p.ideal_stock > 0
            ? Math.round((p.current_stock / p.ideal_stock) * 100)
            : 0;
          const cat = p.categories;
          const emoji = cat?.color?.split("|")[1] || "📦";
          const catName = cat?.name || "—";
          return {
            id: p.id,
            name: p.name,
            category: `${emoji} ${catName}`,
            current: p.current_stock,
            min: p.min_stock,
            unit: p.unit,
            pct: Math.min(pct, 100),
          };
        });

        // Alert
        const alertList = sottosoglia.map(p => {
          const pct = p.ideal_stock > 0
            ? Math.round((p.current_stock / p.ideal_stock) * 100)
            : 0;
          return {
            id: p.id,
            name: p.name,
            detail: `Scorta: ${p.current_stock} ${p.unit} — Min: ${p.min_stock} ${p.unit}`,
            type: pct < 25 ? "danger" : "warning",
            category: p.categories?.name || "—",
          };
        });

        setAlerts(alertList);
        setScorteBasse(scorteBasseList);
        setKpi(prev => ({ ...prev, totProdotti, valMagazzino, scorteBasse: sottosoglia.length }));
      }

      // Movimenti di oggi
      const oggi = new Date().toISOString().split("T")[0];
      const { data: movOggi } = await supabase
        .from("stock_movements")
        .select("id")
        .gte("movement_date", oggi + "T00:00:00")
        .lte("movement_date", oggi + "T23:59:59");

      setKpi(prev => ({ ...prev, movimentiOggi: movOggi?.length || 0 }));

      // Ultimi 6 movimenti
      const { data: movRecenti } = await supabase
        .from("stock_movements")
        .select("*, products(name, unit)")
        .order("movement_date", { ascending: false })
        .limit(6);

      if (movRecenti) {
        setMovements(movRecenti.map(m => ({
          id: m.id,
          name: m.products?.name || "—",
          type: m.type,
          qty: (m.type === "load" ? "+" : "-") + m.quantity + " " + (m.products?.unit || ""),
          time: new Date(m.movement_date).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
          notes: m.notes || "",
        })));
      }
    } catch (err) {
      console.error("Errore caricamento dashboard:", err);
    }
    setLoading(false);
  }

  const today = new Date().toLocaleDateString("it-IT", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  return (
    <div className="dashboard-root">

      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">🍽</div>
          <div>
            <div className="logo-text">Magazzino Pro</div>
            <span className="logo-sub">Gestionale</span>
          </div>
        </div>

        <span className="nav-section-label">Principale</span>
        {[
          { id: "dashboard", icon: "📊", label: "Dashboard" },
          { id: "movimenti", icon: "↕️",  label: "Movimenti" },
          { id: "scorte",    icon: "⚠️",  label: "Scorte basse" },
        ].map(n => (
          <div key={n.id} className={`nav-item ${activeNav === n.id ? "active" : ""}`} onClick={() => setActiveNav(n.id)}>
            <span className="nav-icon">{n.icon}</span>{n.label}
          </div>
        ))}

        <span className="nav-section-label">Anagrafiche</span>
        {[
          { id: "prodotti",  icon: "🥩", label: "Prodotti" },
          { id: "categorie", icon: "🏷", label: "Categorie" },
          { id: "fornitori", icon: "🚚", label: "Fornitori" },
        ].map(n => (
          <div key={n.id} className={`nav-item ${activeNav === n.id ? "active" : ""}`} onClick={() => setActiveNav(n.id)}>
            <span className="nav-icon">{n.icon}</span>{n.label}
          </div>
        ))}

        <span className="nav-section-label">Ordini</span>
        {[
          { id: "ordini", icon: "📋", label: "Ordini fornitori" },
          { id: "report", icon: "📈", label: "Report" },
        ].map(n => (
          <div key={n.id} className={`nav-item ${activeNav === n.id ? "active" : ""}`} onClick={() => setActiveNav(n.id)}>
            <span className="nav-icon">{n.icon}</span>{n.label}
          </div>
        ))}

        <div className="sidebar-bottom">
          <div className="user-info">
            <div className="user-avatar">M</div>
            <div>
              <div className="user-name">Magazzino Pro</div>
              <div className="user-role">Responsabile</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="main-content">

        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-date">{today}</p>
          </div>
          <button className="refresh-btn" onClick={loadDashboard}>⟳ Aggiorna</button>
        </div>

        {loading ? (
          <p style={{ padding: "2rem", color: "#888" }}>Caricamento dati...</p>
        ) : (
          <>
            {/* KPI */}
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-top"><span className="kpi-label">Prodotti totali</span><div className="kpi-icon gold">🥩</div></div>
                <div className="kpi-value">{kpi.totProdotti}</div>
                <div className="kpi-sub">in magazzino</div>
                <span className="kpi-badge badge-ok">● Aggiornato</span>
              </div>

              <div className="kpi-card">
                <div className="kpi-top"><span className="kpi-label">Valore magazzino</span><div className="kpi-icon gold">💶</div></div>
                <div className="kpi-value">€{kpi.valMagazzino}</div>
                <div className="kpi-sub">stima corrente</div>
                <span className="kpi-badge badge-ok">● In linea</span>
              </div>

              <div className="kpi-card">
                <div className="kpi-top"><span className="kpi-label">Scorte basse</span><div className="kpi-icon red">⚠️</div></div>
                <div className="kpi-value">{kpi.scorteBasse}</div>
                <div className="kpi-sub">prodotti sotto soglia</div>
                <span className={`kpi-badge ${kpi.scorteBasse > 0 ? "badge-danger" : "badge-ok"}`}>
                  {kpi.scorteBasse > 0 ? "● Attenzione" : "● OK"}
                </span>
              </div>

              <div className="kpi-card">
                <div className="kpi-top"><span className="kpi-label">Movimenti oggi</span><div className="kpi-icon blue">↕️</div></div>
                <div className="kpi-value">{kpi.movimentiOggi}</div>
                <div className="kpi-sub">carichi e scarichi</div>
                <span className="kpi-badge badge-warning">● Attivo</span>
              </div>
            </div>

            {/* Alert + Movimenti */}
            <div className="two-col">
              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">🔴 Alert scorte <span className="panel-count">{alerts.length}</span></span>
                  <span className="panel-link">Vedi tutti →</span>
                </div>
                <div className="alert-list">
                  {alerts.length === 0 && <p style={{ padding: "1rem", color: "#888" }}>Nessuna scorta bassa 🎉</p>}
                  {alerts.map(a => (
                    <div className="alert-item" key={a.id}>
                      <div className={`alert-dot ${a.type === "danger" ? "dot-danger" : "dot-warning"}`} />
                      <div className="alert-info">
                        <div className="alert-name">{a.name}</div>
                        <div className="alert-detail">{a.detail}</div>
                      </div>
                      <button className="alert-action">Ordina</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">↕️ Ultimi movimenti</span>
                  <span className="panel-link">Vedi tutti →</span>
                </div>
                <div className="movement-list">
                  {movements.length === 0 && <p style={{ padding: "1rem", color: "#888" }}>Nessun movimento registrato</p>}
                  {movements.map(m => (
                    <div className="movement-item" key={m.id}>
                      <div className={`movement-type ${typeClass[m.type]}`}>{typeIcon[m.type]}</div>
                      <div className="movement-info">
                        <div className="movement-name">{m.name}</div>
                        <div className="movement-meta">{typeLabel[m.type]}{m.notes ? ` · ${m.notes}` : ""}</div>
                      </div>
                      <div>
                        <div className={`movement-qty ${qtyClass[m.type]}`}>{m.qty}</div>
                        <div className="movement-time">{m.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Prodotti sotto soglia */}
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">📉 Prodotti sotto scorta minima <span className="panel-count">{scorteBasse.length}</span></span>
                <span className="panel-link">Gestisci →</span>
              </div>
              <div className="stock-table">
                {scorteBasse.length === 0 && <p style={{ padding: "1rem", color: "#888" }}>Tutte le scorte sono nella norma 🎉</p>}
                {scorteBasse.map(p => (
                  <div className="stock-row" key={p.id}>
                    <div style={{ flex: 1 }}>
                      <div className="stock-name">{p.name}</div>
                      <div className="stock-category">{p.category}</div>
                    </div>
                    <div className="stock-bar-wrap">
                      <div className="stock-bar-bg">
                        <div className={`stock-bar-fill ${p.pct < 25 ? "bar-danger" : "bar-warning"}`} style={{ width: `${p.pct}%` }} />
                      </div>
                    </div>
                    <div className="stock-qty">{p.current} / {p.min} {p.unit}</div>
                    <div className="stock-status">
                      <span className={`kpi-badge ${p.pct < 25 ? "badge-danger" : "badge-warning"}`}>
                        {p.pct < 25 ? "● Critico" : "● Basso"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}