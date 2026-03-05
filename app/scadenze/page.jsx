"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import "./scadenze.css";

// ── HELPERS ───────────────────────────────────────────────────────────────────
function diffGiorni(scadenza) {
  const oggi = new Date(); oggi.setHours(0,0,0,0);
  const sc   = new Date(scadenza); sc.setHours(0,0,0,0);
  return Math.round((sc - oggi) / (1000 * 60 * 60 * 24));
}

function getUrgenza(giorni) {
  if (giorni < 0)   return { key: "scaduto", label: "Scaduto",    badgeCls: "giorni-scaduto", fillCls: "fill-scaduto", rowCls: "scaduto" };
  if (giorni === 0) return { key: "oggi",    label: "Scade oggi", badgeCls: "giorni-oggi",    fillCls: "fill-oggi",    rowCls: "oggi"    };
  if (giorni <= 3)  return { key: "urgente", label: `${giorni}g`, badgeCls: "giorni-urgente", fillCls: "fill-urgente", rowCls: "urgente" };
  if (giorni <= 7)  return { key: "presto",  label: `${giorni}g`, badgeCls: "giorni-presto",  fillCls: "fill-presto",  rowCls: "presto"  };
  return                   { key: "normale", label: `${giorni}g`, badgeCls: "giorni-normale", fillCls: "fill-normale", rowCls: "normale" };
}

function formataData(str) {
  return new Date(str).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

const GROUP_LABELS = {
  scaduto: "⛔ Già scaduti",
  oggi:    "🚨 Scade oggi",
  urgente: "🔴 Entro 3 giorni",
  presto:  "🟡 Entro 7 giorni",
  normale: "🟢 Oltre 7 giorni",
};

// ─────────────────────────────────────────────────────────────────────────────
export default function ScadenzePage() {
  const [activeNav, setActiveNav] = useState("scadenze");
  const [lotti,     setLotti]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [giorni,    setGiorni]    = useState(14);
  const [filtro,    setFiltro]    = useState("tutti");
  const [ricerca,   setRicerca]   = useState("");
  const [toast,     setToast]     = useState(null);

  // ── Carica batch_lots con join su products + categories ──────────────────
  useEffect(() => { caricaLotti(); }, []);

  const caricaLotti = async () => {
    const { data, error } = await supabase
      .from("batch_lots")
      .select("*, products(id, name, unit, categories(name, color))")
      .not("expiry_date", "is", null)
      .order("expiry_date", { ascending: true });
    if (!error) setLotti(data || []);
    setLoading(false);
  };

  const getEmoji    = (l) => l.products?.categories?.color?.split("|")[1] || "📦";
  const getCatColor = (l) => l.products?.categories?.color?.split("|")[0] || "#888";

  // ── KPI ───────────────────────────────────────────────────────────────────
  const scaduti   = lotti.filter(l => diffGiorni(l.expiry_date) < 0).length;
  const oggi_n    = lotti.filter(l => diffGiorni(l.expiry_date) === 0).length;
  const urgenti   = lotti.filter(l => { const d = diffGiorni(l.expiry_date); return d > 0 && d <= 3; }).length;
  const inFinestra= lotti.filter(l => diffGiorni(l.expiry_date) <= giorni).length;

  // ── Lista filtrata ────────────────────────────────────────────────────────
  const lottiFiltrati = useMemo(() => {
    return lotti
      .filter(l => {
        const g   = diffGiorni(l.expiry_date);
        const urg = getUrgenza(g);
        const inFin     = g <= giorni;
        const matchFilt = filtro === "tutti" ? inFin : urg.key === filtro;
        const matchRic  = (l.products?.name || "").toLowerCase().includes(ricerca.toLowerCase()) ||
                          (l.lot_number     || "").toLowerCase().includes(ricerca.toLowerCase()) ||
                          (l.products?.categories?.name || "").toLowerCase().includes(ricerca.toLowerCase());
        return matchFilt && matchRic;
      })
      .sort((a, b) => diffGiorni(a.expiry_date) - diffGiorni(b.expiry_date));
  }, [lotti, giorni, filtro, ricerca]);

  // ── Raggruppa per urgenza ─────────────────────────────────────────────────
  const righeConGruppo = useMemo(() => {
    const out = [];
    let lastKey = null;
    lottiFiltrati.forEach(l => {
      const urg = getUrgenza(diffGiorni(l.expiry_date));
      if (urg.key !== lastKey) {
        out.push({ type: "sep", key: urg.key });
        lastKey = urg.key;
      }
      out.push({ type: "row", l });
    });
    return out;
  }, [lottiFiltrati]);

  // ── Azioni ────────────────────────────────────────────────────────────────
  const registraScarto = async (l) => {
    const prod = l.products;
    if (!prod) return;

    // Leggi current_stock
    const { data: pData } = await supabase
      .from("products").select("current_stock").eq("id", prod.id).single();
    const stockBefore = pData?.current_stock ?? 0;
    const stockAfter  = Math.max(0, stockBefore - l.quantity);

    await supabase.from("stock_movements").insert({
      product_id:    prod.id,
      type:          "waste",
      quantity:      l.quantity,
      stock_before:  stockBefore,
      stock_after:   stockAfter,
      notes:         `Scarto lotto ${l.lot_number} — scaduto`,
      movement_date: new Date().toISOString(),
    });
    await supabase.from("products").update({ current_stock: stockAfter }).eq("id", prod.id);
    await supabase.from("batch_lots").delete().eq("id", l.id);

    setToast({ icon: "🗑", text: `Scarto registrato: ${prod.name}`, sub: `${l.quantity} ${prod.unit} — lotto ${l.lot_number}`, danger: true });
    setTimeout(() => setToast(null), 3000);
    caricaLotti();
  };

  const segnaConsumato = async (l) => {
    const prod = l.products;
    if (!prod) return;

    const { data: pData } = await supabase
      .from("products").select("current_stock").eq("id", prod.id).single();
    const stockBefore = pData?.current_stock ?? 0;
    const stockAfter  = Math.max(0, stockBefore - l.quantity);

    await supabase.from("stock_movements").insert({
      product_id:    prod.id,
      type:          "unload",
      quantity:      l.quantity,
      stock_before:  stockBefore,
      stock_after:   stockAfter,
      notes:         `Consumato lotto ${l.lot_number} — in scadenza`,
      movement_date: new Date().toISOString(),
    });
    await supabase.from("products").update({ current_stock: stockAfter }).eq("id", prod.id);
    await supabase.from("batch_lots").delete().eq("id", l.id);

    setToast({ icon: "✅", text: `${prod.name} segnato come consumato`, sub: `Lotto ${l.lot_number}`, danger: false });
    setTimeout(() => setToast(null), 3000);
    caricaLotti();
  };

  return (
    <div className="page-root">

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">🍽</div>
          <div><div className="logo-text">Magazzino Pro</div><span className="logo-sub">Gestionale</span></div>
        </div>
        <span className="nav-section-label">Principale</span>
        {[
          { id: "dashboard", icon: "📊", label: "Dashboard" },
          { id: "carico",    icon: "📦", label: "Carico merce" },
          { id: "scarico",   icon: "🍳", label: "Scarico cucina" },
          { id: "movimenti", icon: "↕️", label: "Registro movimenti" },
          { id: "scorte",    icon: "⚠️", label: "Scorte basse" },
          { id: "scadenze",  icon: "📅", label: "Scadenze" },
        ].map(n => (
          <div key={n.id} className={`nav-item ${activeNav === n.id ? "active" : ""}`}
            onClick={() => setActiveNav(n.id)}>
            <span className="nav-icon">{n.icon}</span>{n.label}
          </div>
        ))}
        <span className="nav-section-label">Anagrafiche</span>
        {[
          { id: "prodotti",  icon: "🥩", label: "Prodotti" },
          { id: "categorie", icon: "🏷", label: "Categorie" },
          { id: "fornitori", icon: "🚚", label: "Fornitori" },
        ].map(n => (
          <div key={n.id} className={`nav-item ${activeNav === n.id ? "active" : ""}`}
            onClick={() => setActiveNav(n.id)}>
            <span className="nav-icon">{n.icon}</span>{n.label}
          </div>
        ))}
        <span className="nav-section-label">Ordini</span>
        {[
          { id: "ordini", icon: "📋", label: "Nuovo ordine" },
          { id: "lista",  icon: "📝", label: "Lista ordini" },
          { id: "report", icon: "📈", label: "Report" },
        ].map(n => (
          <div key={n.id} className={`nav-item ${activeNav === n.id ? "active" : ""}`}
            onClick={() => setActiveNav(n.id)}>
            <span className="nav-icon">{n.icon}</span>{n.label}
          </div>
        ))}
        <div className="sidebar-bottom">
          <div className="user-info">
            <div className="user-avatar">M</div>
            <div><div className="user-name">Mario Rossi</div><div className="user-role">Responsabile</div></div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="main-content">

        {/* HEADER */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Scadenze</h1>
            <p className="page-subtitle">
              {loading ? "Caricamento..." : `${inFinestra} lotti in scadenza entro ${giorni} giorni`}
            </p>
          </div>

          <div className="giorni-control">
            <span className="giorni-label">Mostra entro</span>
            <span className="giorni-val">{giorni}</span>
            <span className="giorni-label">giorni</span>
            <input className="giorni-slider" type="range" min="3" max="60" value={giorni}
              onChange={e => setGiorni(Number(e.target.value))} />
            <div className="giorni-presets">
              {[3, 7, 14, 30].map(g => (
                <button key={g} className={`preset-btn ${giorni === g ? "active" : ""}`}
                  onClick={() => setGiorni(g)}>{g}g</button>
              ))}
            </div>
          </div>
        </div>

        {/* BANNER SCADUTI */}
        {scaduti > 0 && (
          <div className="alert-banner">
            <span className="banner-icon">⛔</span>
            <div>
              <div className="banner-title">{scaduti} lotti già scaduti in magazzino</div>
              <div className="banner-sub">Devono essere rimossi immediatamente per sicurezza alimentare</div>
            </div>
            <button className="banner-action" onClick={() => setFiltro("scaduto")}>
              Mostra scaduti
            </button>
          </div>
        )}

        {/* KPI */}
        <div className="kpi-row">
          {[
            { key: "scaduto", icon: "⛔", val: scaduti,    label: "Già scaduti",      cls: "red"   },
            { key: "oggi",    icon: "🚨", val: oggi_n,     label: "Scadono oggi",     cls: "red"   },
            { key: "urgente", icon: "🔴", val: urgenti,    label: "Entro 3 giorni",   cls: "orange" },
            { key: "tutti",   icon: "📅", val: inFinestra, label: `Entro ${giorni}g`, cls: "white" },
          ].map(k => (
            <div key={k.key}
              className={`kpi-card ${filtro === k.key ? "active" : ""}`}
              onClick={() => setFiltro(k.key)}>
              <div className="kpi-icon">{k.icon}</div>
              <div>
                <div className={`kpi-val ${k.cls}`}>{k.val}</div>
                <div className="kpi-label">{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* TOOLBAR */}
        <div className="toolbar">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input className="search-input" placeholder="Cerca prodotto, lotto..."
              value={ricerca} onChange={e => setRicerca(e.target.value)} />
          </div>
          <select className="filter-select" value={filtro}
            onChange={e => setFiltro(e.target.value)}>
            <option value="tutti">Tutti (entro {giorni}g)</option>
            <option value="scaduto">⛔ Già scaduti</option>
            <option value="oggi">🚨 Scadono oggi</option>
            <option value="urgente">🔴 Entro 3 giorni</option>
            <option value="presto">🟡 Entro 7 giorni</option>
            <option value="normale">🟢 Oltre 7 giorni</option>
          </select>
          <span className="total-badge">{lottiFiltrati.length} lotti</span>
        </div>

        {/* TABELLA */}
        <div className="table-wrap">
          <div className="table-head">
            <span className="th">Prodotto</span>
            <span className="th col-lotto">Lotto</span>
            <span className="th">Scadenza</span>
            <span className="th col-scorta">Quantità</span>
            <span className="th">Giorni rimasti</span>
            <span className="th"></span>
          </div>

          {loading ? (
            <div className="empty-state">
              <div className="empty-icon">⏳</div>
              <div className="empty-text">Caricamento lotti...</div>
            </div>
          ) : lottiFiltrati.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📅</div>
              <div className="empty-text">Nessun prodotto in scadenza</div>
              <div className="empty-sub">entro {giorni} giorni con i filtri applicati</div>
            </div>
          ) : (
            righeConGruppo.map((item, i) => {
              if (item.type === "sep") {
                return (
                  <div className="group-sep" key={`sep-${item.key}-${i}`}>
                    {GROUP_LABELS[item.key]}
                  </div>
                );
              }
              const { l }  = item;
              const g      = diffGiorni(l.expiry_date);
              const urg    = getUrgenza(g);
              const barPct = g <= 0 ? 0 : Math.min((g / giorni) * 100, 100);

              return (
                <div className={`table-row ${urg.rowCls}`} key={l.id}>

                  {/* Prodotto */}
                  <div className="prodotto-cell">
                    <span className="prodotto-emoji">{getEmoji(l)}</span>
                    <div>
                      <div className="prodotto-nome">{l.products?.name}</div>
                      <div className="prodotto-lotto" style={{ color: getCatColor(l) }}>
                        {l.products?.categories?.name || "—"}
                      </div>
                    </div>
                  </div>

                  {/* Lotto */}
                  <div className="td-text col-lotto">{l.lot_number || "—"}</div>

                  {/* Scadenza */}
                  <div className="td-bold">{formataData(l.expiry_date)}</div>

                  {/* Quantità */}
                  <div className="td-text col-scorta">{l.quantity} {l.products?.unit}</div>

                  {/* Giorni rimasti + barra */}
                  <div className="countdown-bar-wrap">
                    <span className={`giorni-badge ${urg.badgeCls}`}>
                      {g < 0 ? `${Math.abs(g)}g fa` : g === 0 ? "Oggi!" : urg.label}
                    </span>
                    <div className="countdown-bar-bg">
                      <div className={`countdown-bar-fill ${urg.fillCls}`}
                        style={{ width: `${barPct}%` }} />
                    </div>
                  </div>

                  {/* Azioni */}
                  <div className="row-actions">
                    {(urg.key === "scaduto" || urg.key === "oggi") ? (
                      <button className="btn-scarica danger" onClick={() => registraScarto(l)}>
                        🗑 Scarta
                      </button>
                    ) : (
                      <button className="btn-scarica warn" onClick={() => segnaConsumato(l)}>
                        ✅ Usa prima
                      </button>
                    )}
                    <button className="btn-nota" title="Note">📝</button>
                  </div>

                </div>
              );
            })
          )}
        </div>

      </main>

      {/* TOAST */}
      {toast && (
        <div className={`toast ${toast.danger ? "danger" : ""}`}>
          <span className="toast-icon">{toast.icon}</span>
          <div>
            <div className="toast-text">{toast.text}</div>
            {toast.sub && <div className="toast-sub">{toast.sub}</div>}
          </div>
        </div>
      )}

    </div>
  );
}