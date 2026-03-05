"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import "./movimenti.css";

const TIPO_CONFIG = {
  load:       { label: "Carico",    icon: "📦", qtyClass: "qty-pos",   badgeClass: "tipo-load",       segno: "+" },
  unload:     { label: "Scarico",   icon: "🍳", qtyClass: "qty-neg",   badgeClass: "tipo-unload",     segno: "−" },
  waste:      { label: "Spreco",    icon: "🗑",  qtyClass: "qty-waste", badgeClass: "tipo-waste",      segno: "−" },
  adjustment: { label: "Rettifica", icon: "⚖️", qtyClass: "qty-adj",   badgeClass: "tipo-adjustment", segno: "±" },
};

const PER_PAGINA = 8;

function formataData(str) {
  const d = new Date(str);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function etichettaGiorno(str) {
  const oggi = new Date().toISOString().split("T")[0];
  const ieri = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  if (str === oggi) return "Oggi";
  if (str === ieri) return "Ieri";
  return formataData(str);
}

function esportaCSV(dati) {
  const righe = [
    ["Tipo", "Prodotto", "SKU", "Quantità", "Unità", "Operatore", "Note", "Data", "Ora"].join(";"),
    ...dati.map(m => {
      const tc = TIPO_CONFIG[m.type];
      const data = new Date(m.movement_date);
      return [
        tc?.label,
        m.products?.name,
        m.products?.sku || "",
        m.quantity,
        m.products?.unit,
        m.notes || "",
        "",
        data.toLocaleDateString("it-IT"),
        data.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
      ].join(";");
    }),
  ].join("\n");

  const blob = new Blob([righe], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `movimenti_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
export default function MovimentiPage() {
  const [activeNav, setActiveNav] = useState("movimenti");
  const [movimenti, setMovimenti] = useState([]);
  const [prodotti,  setProdotti]  = useState([]);
  const [loading,   setLoading]   = useState(true);

  // Filtri
  const [ricerca,    setRicerca]  = useState("");
  const [tipoFiltro, setTipo]     = useState("all");
  const [prodFiltro, setProd]     = useState("");
  const [dataFrom,   setFrom]     = useState("");
  const [dataTo,     setTo]       = useState("");
  const [sortDir,    setSort]     = useState("desc");
  const [pagina,     setPagina]   = useState(1);

  useEffect(() => {
    Promise.all([caricaMovimenti(), caricaProdotti()]);
  }, []);

  const caricaMovimenti = async () => {
    const { data, error } = await supabase
      .from("stock_movements")
      .select("*, products(id, name, sku, unit, categories(color))")
      .order("movement_date", { ascending: false });
    if (!error) setMovimenti(data || []);
    setLoading(false);
  };

  const caricaProdotti = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, sku, categories(color)")
      .eq("active", true)
      .order("name");
    if (!error) setProdotti(data || []);
  };

  const getEmoji = (m) => m?.products?.categories?.color?.split("|")[1] || "📦";

  // ── Filtra + ordina ────────────────────────────────────────────────────
  const filtrati = useMemo(() => {
    let res = [...movimenti];

    if (ricerca) {
      const q = ricerca.toLowerCase();
      res = res.filter(m =>
        m.products?.name?.toLowerCase().includes(q) ||
        m.products?.sku?.toLowerCase().includes(q)  ||
        m.notes?.toLowerCase().includes(q)
      );
    }
    if (tipoFiltro !== "all") res = res.filter(m => m.type === tipoFiltro);
    if (prodFiltro)           res = res.filter(m => m.product_id === Number(prodFiltro));
    if (dataFrom)             res = res.filter(m => m.movement_date >= dataFrom);
    if (dataTo)               res = res.filter(m => m.movement_date <= dataTo + "T23:59:59");

    res.sort((a, b) => {
      const cmp = a.movement_date.localeCompare(b.movement_date);
      return sortDir === "desc" ? -cmp : cmp;
    });

    return res;
  }, [movimenti, ricerca, tipoFiltro, prodFiltro, dataFrom, dataTo, sortDir]);

  // ── Paginazione ────────────────────────────────────────────────────────
  const totPagine   = Math.max(1, Math.ceil(filtrati.length / PER_PAGINA));
  const pagCorretta = Math.min(pagina, totPagine);
  const slice       = filtrati.slice((pagCorretta - 1) * PER_PAGINA, pagCorretta * PER_PAGINA);

  const reset = () => { setRicerca(""); setTipo("all"); setProd(""); setFrom(""); setTo(""); setPagina(1); };

  // ── KPI ────────────────────────────────────────────────────────────────
  const kpiCarichi    = filtrati.filter(m => m.type === "load").length;
  const kpiScarichi   = filtrati.filter(m => m.type === "unload").length;
  const kpiSprechi    = filtrati.filter(m => m.type === "waste").length;
  const kpiRettifiche = filtrati.filter(m => m.type === "adjustment").length;

  // ── Raggruppa per giorno ───────────────────────────────────────────────
  const righeConSeparatore = [];
  let ultimoGiorno = null;
  slice.forEach(m => {
    const giorno = m.movement_date?.split("T")[0];
    if (giorno !== ultimoGiorno) {
      righeConSeparatore.push({ type: "sep", data: giorno });
      ultimoGiorno = giorno;
    }
    righeConSeparatore.push({ type: "row", m });
  });

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
          { id: "ordini", icon: "📋", label: "Ordini fornitori" },
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

        <div className="page-header">
          <div>
            <h1 className="page-title">Registro movimenti</h1>
            <p className="page-subtitle">{loading ? "Caricamento..." : `${filtrati.length} movimenti trovati`}</p>
          </div>
          <button className="btn-export" onClick={() => esportaCSV(filtrati)}>⬇ Esporta CSV</button>
        </div>

        {/* KPI */}
        <div className="kpi-row">
          {[
            { icon: "📦", val: kpiCarichi,    label: "Carichi" },
            { icon: "🍳", val: kpiScarichi,   label: "Scarichi cucina" },
            { icon: "🗑",  val: kpiSprechi,    label: "Sprechi" },
            { icon: "⚖️", val: kpiRettifiche, label: "Rettifiche" },
          ].map((k, i) => (
            <div className="kpi-mini" key={i}>
              <div className="kpi-mini-icon">{k.icon}</div>
              <div>
                <div className="kpi-mini-val">{k.val}</div>
                <div className="kpi-mini-label">{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* FILTRI */}
        <div className="filtri-bar">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input className="search-input" placeholder="Cerca prodotto, note..."
              value={ricerca} onChange={e => { setRicerca(e.target.value); setPagina(1); }} />
          </div>

          <select className="filter-select" value={prodFiltro}
            onChange={e => { setProd(e.target.value); setPagina(1); }}>
            <option value="">Tutti i prodotti</option>
            {prodotti.map(p => (
              <option key={p.id} value={p.id}>
                {p.categories?.color?.split("|")[1] || "📦"} {p.name}
              </option>
            ))}
          </select>

          <input className="date-input" type="date" value={dataFrom}
            onChange={e => { setFrom(e.target.value); setPagina(1); }} title="Data inizio" />
          <span style={{ color: "rgba(240,230,208,0.2)", fontSize: 12 }}>→</span>
          <input className="date-input" type="date" value={dataTo}
            onChange={e => { setTo(e.target.value); setPagina(1); }} title="Data fine" />

          <div className="filtri-right">
            <span className="badge-filtri">{filtrati.length} risultati</span>
            <button className="btn-reset" onClick={reset}>✕ Reset</button>
          </div>
        </div>

        {/* TIPO PILLS */}
        <div className="tipo-pills">
          {[
            { key: "all",        label: "Tutti" },
            { key: "load",       label: "📦 Carichi" },
            { key: "unload",     label: "🍳 Scarichi" },
            { key: "waste",      label: "🗑 Sprechi" },
            { key: "adjustment", label: "⚖️ Rettifiche" },
          ].map(t => (
            <div key={t.key}
              className={`tipo-pill ${t.key} ${tipoFiltro === t.key ? "active" : ""}`}
              onClick={() => { setTipo(t.key); setPagina(1); }}>
              {t.label}
            </div>
          ))}
        </div>

        {/* TABELLA */}
        <div className="table-wrap">
          <div className="table-head">
            <span className="th">Tipo</span>
            <span className="th">Prodotto</span>
            <span className="th">Quantità</span>
            <span className="th col-utente">Scorta dopo</span>
            <span className="th col-fornitore">Note</span>
            <span className="th" onClick={() => setSort(s => s === "desc" ? "asc" : "desc")}
              style={{ cursor: "pointer" }}>
              Data <span className="sort-icon">{sortDir === "desc" ? "↓" : "↑"}</span>
            </span>
            <span className="th"></span>
          </div>

          {loading ? (
            <div className="empty-state">
              <div className="empty-icon">⏳</div>
              <div className="empty-text">Caricamento movimenti...</div>
            </div>
          ) : filtrati.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">↕️</div>
              <div className="empty-text">Nessun movimento trovato con i filtri applicati</div>
            </div>
          ) : (
            righeConSeparatore.map((item, i) => {
              if (item.type === "sep") {
                return (
                  <div className="day-separator" key={`sep-${item.data}-${i}`}>
                    {etichettaGiorno(item.data)}
                  </div>
                );
              }
              const { m } = item;
              const tc   = TIPO_CONFIG[m.type];
              const data = new Date(m.movement_date);
              const ora  = data.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
              return (
                <div className="table-row" key={m.id}>

                  {/* Tipo */}
                  <div>
                    <span className={`tipo-badge ${tc?.badgeClass}`}>
                      {tc?.icon} {tc?.label}
                    </span>
                  </div>

                  {/* Prodotto */}
                  <div className="prodotto-cell">
                    <span className="prodotto-emoji-sm">{getEmoji(m)}</span>
                    <div>
                      <div className="prodotto-nome">{m.products?.name}</div>
                      <div className="prodotto-sku">{m.products?.sku || "—"}</div>
                    </div>
                  </div>

                  {/* Quantità */}
                  <div className={`qty-cell ${tc?.qtyClass}`}>
                    {tc?.segno}{m.quantity} {m.products?.unit}
                  </div>

                  {/* Scorta dopo */}
                  <div className="td-text col-utente">
                    {m.stock_after != null ? `${m.stock_after} ${m.products?.unit}` : "—"}
                  </div>

                  {/* Note */}
                  <div className="td-text col-fornitore">
                    {m.notes || "—"}
                  </div>

                  {/* Data */}
                  <div>
                    <div className="data-cell">{formataData(m.movement_date)}</div>
                    <div className="data-ora">{ora}</div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 11, color: "rgba(200,140,40,0.4)", cursor: "pointer" }}
                      title="Dettaglio">•••</span>
                  </div>
                </div>
              );
            })
          )}

          {/* PAGINAZIONE */}
          {!loading && filtrati.length > 0 && (
            <div className="pagination">
              <span className="pag-info">
                {(pagCorretta - 1) * PER_PAGINA + 1}–{Math.min(pagCorretta * PER_PAGINA, filtrati.length)} di {filtrati.length}
              </span>
              <div className="pag-btns">
                <button className="pag-btn" disabled={pagCorretta === 1}
                  onClick={() => setPagina(p => p - 1)}>‹</button>
                {Array.from({ length: totPagine }, (_, i) => i + 1)
                  .filter(n => n === 1 || n === totPagine || Math.abs(n - pagCorretta) <= 1)
                  .map(n => (
                    <button key={n} className={`pag-btn ${pagCorretta === n ? "active" : ""}`}
                      onClick={() => setPagina(n)}>{n}</button>
                  ))}
                <button className="pag-btn" disabled={pagCorretta === totPagine}
                  onClick={() => setPagina(p => p + 1)}>›</button>
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}