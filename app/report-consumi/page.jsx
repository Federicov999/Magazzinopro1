"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import "./report-consumi.css";

function formataData(str) {
  if (!str) return "—";
  return new Date(str).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function esportaCSV(dati) {
  const righe = [
    ["Prodotto", "Categoria", "Scarico cucina", "Sprechi", "Totale", "Unità"].join(";"),
    ...dati.map(d => [d.nome, d.categoria, d.unload, d.waste, d.totale, d.unita].join(";")),
  ].join("\n");
  const blob = new Blob([righe], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `consumi_${new Date().toISOString().split("T")[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

const PERIODI = [
  { key: "7d",  label: "7 giorni" },
  { key: "30d", label: "30 giorni" },
  { key: "90d", label: "3 mesi" },
  { key: "custom", label: "Personalizzato" },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function ReportConsumiPage() {
  const [activeNav, setActiveNav] = useState("report-consumi");

  const [movimenti,  setMovimenti]  = useState([]);
  const [prodotti,   setProdotti]   = useState([]);
  const [categorie,  setCategorie]  = useState([]);
  const [loading,    setLoading]    = useState(true);

  const [periodo,    setPeriodo]    = useState("30d");
  const [dataFrom,   setFrom]       = useState("");
  const [dataTo,     setTo]         = useState("");
  const [catFiltro,  setCat]        = useState("");
  const [tipoFiltro, setTipo]       = useState("tutti"); // tutti | unload | waste
  const [sortBy,     setSort]       = useState("totale"); // totale | nome | waste
  const [ricerca,    setRicerca]    = useState("");

  // ── Carica dati ────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([caricaMovimenti(), caricaCategorie()]);
  }, []);

  const caricaMovimenti = async () => {
    const { data, error } = await supabase
      .from("stock_movements")
      .select("*, products(id, name, unit, categories(name, color))")
      .in("type", ["unload", "waste"])
      .order("movement_date", { ascending: false });
    if (!error) setMovimenti(data || []);
    setLoading(false);
  };

  const caricaCategorie = async () => {
    const { data } = await supabase.from("categories").select("id, name, color").order("name");
    if (data) setCategorie(data);
  };

  // ── Calcola range date ────────────────────────────────────────────────
  const { fromDate, toDate } = useMemo(() => {
    const oggi = new Date(); oggi.setHours(23, 59, 59, 999);
    if (periodo === "custom") {
      return {
        fromDate: dataFrom ? new Date(dataFrom) : null,
        toDate:   dataTo   ? new Date(dataTo + "T23:59:59") : oggi,
      };
    }
    const days = { "7d": 7, "30d": 30, "90d": 90 }[periodo] || 30;
    const from = new Date(); from.setDate(from.getDate() - days); from.setHours(0, 0, 0, 0);
    return { fromDate: from, toDate: oggi };
  }, [periodo, dataFrom, dataTo]);

  // ── Filtra movimenti per periodo ──────────────────────────────────────
  const movimentiFiltrati = useMemo(() => {
    return movimenti.filter(m => {
      const d = new Date(m.movement_date);
      const inRange = (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
      const matchTipo = tipoFiltro === "tutti" || m.type === tipoFiltro;
      const matchCat  = !catFiltro || m.products?.categories?.name === catFiltro;
      return inRange && matchTipo && matchCat;
    });
  }, [movimenti, fromDate, toDate, tipoFiltro, catFiltro]);

  // ── Aggrega per prodotto ──────────────────────────────────────────────
  const consumiPerProdotto = useMemo(() => {
    const map = {};
    movimentiFiltrati.forEach(m => {
      const pid = m.product_id;
      if (!map[pid]) {
        map[pid] = {
          id:        pid,
          nome:      m.products?.name || "—",
          unita:     m.products?.unit || "",
          categoria: m.products?.categories?.name || "—",
          catColore: m.products?.categories?.color?.split("|")[0] || "#888",
          emoji:     m.products?.categories?.color?.split("|")[1] || "📦",
          unload:    0,
          waste:     0,
          totale:    0,
          movimenti: 0,
        };
      }
      const qty = Number(m.quantity);
      if (m.type === "unload") map[pid].unload += qty;
      if (m.type === "waste")  map[pid].waste  += qty;
      map[pid].totale    += qty;
      map[pid].movimenti += 1;
    });

    let arr = Object.values(map);

    if (ricerca) {
      const q = ricerca.toLowerCase();
      arr = arr.filter(d => d.nome.toLowerCase().includes(q) || d.categoria.toLowerCase().includes(q));
    }

    arr.sort((a, b) => {
      if (sortBy === "nome")   return a.nome.localeCompare(b.nome);
      if (sortBy === "waste")  return b.waste - a.waste;
      return b.totale - a.totale;
    });

    return arr;
  }, [movimentiFiltrati, sortBy, ricerca]);

  // ── KPI globali ───────────────────────────────────────────────────────
  const totaleConsumo = movimentiFiltrati.filter(m => m.type === "unload").reduce((a, m) => a + m.quantity, 0);
  const totaleSpreco  = movimentiFiltrati.filter(m => m.type === "waste").reduce((a, m) => a + m.quantity, 0);
  const totMovimenti  = movimentiFiltrati.length;
  const percSpreco    = (totaleConsumo + totaleSpreco) > 0
    ? ((totaleSpreco / (totaleConsumo + totaleSpreco)) * 100).toFixed(1)
    : 0;

  // ── Consumi per categoria (per il grafico a barre) ────────────────────
  const consumiPerCat = useMemo(() => {
    const map = {};
    movimentiFiltrati.forEach(m => {
      const cat = m.products?.categories?.name || "—";
      if (!map[cat]) map[cat] = { nome: cat, colore: m.products?.categories?.color?.split("|")[0] || "#888", emoji: m.products?.categories?.color?.split("|")[1] || "📦", totale: 0 };
      map[cat].totale += m.quantity;
    });
    return Object.values(map).sort((a, b) => b.totale - a.totale).slice(0, 6);
  }, [movimentiFiltrati]);

  const maxCat = consumiPerCat[0]?.totale || 1;

  // ── Andamento giornaliero (ultimi N giorni) ───────────────────────────
  const andamentoGiorni = useMemo(() => {
    const days = periodo === "7d" ? 7 : periodo === "30d" ? 14 : 10;
    const map  = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      map[key] = { data: key, unload: 0, waste: 0 };
    }
    movimentiFiltrati.forEach(m => {
      const key = m.movement_date?.split("T")[0];
      if (map[key]) {
        if (m.type === "unload") map[key].unload += m.quantity;
        if (m.type === "waste")  map[key].waste  += m.quantity;
      }
    });
    return Object.values(map);
  }, [movimentiFiltrati, periodo]);

  const maxGiorno = Math.max(...andamentoGiorni.map(g => g.unload + g.waste), 1);

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
          { id: "ordini",         icon: "📋", label: "Nuovo ordine" },
          { id: "lista",          icon: "📝", label: "Lista ordini" },
        ].map(n => (
          <div key={n.id} className={`nav-item ${activeNav === n.id ? "active" : ""}`}
            onClick={() => setActiveNav(n.id)}>
            <span className="nav-icon">{n.icon}</span>{n.label}
          </div>
        ))}
        <span className="nav-section-label">Report</span>
        {[
          { id: "report-consumi", icon: "📈", label: "Report consumi" },
          { id: "report-valore",  icon: "💰", label: "Valore magazzino" },
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
            <h1 className="page-title">Report consumi</h1>
            <p className="page-subtitle">
              {loading ? "Caricamento..." : `${totMovimenti} movimenti nel periodo selezionato`}
            </p>
          </div>
          <button className="btn-export" onClick={() => esportaCSV(consumiPerProdotto)}>
            ⬇ Esporta CSV
          </button>
        </div>

        {/* SELEZIONE PERIODO */}
        <div className="periodo-bar">
          <div className="periodo-pills">
            {PERIODI.map(p => (
              <button key={p.key}
                className={`periodo-pill ${periodo === p.key ? "active" : ""}`}
                onClick={() => setPeriodo(p.key)}>
                {p.label}
              </button>
            ))}
          </div>
          {periodo === "custom" && (
            <div className="date-range">
              <input type="date" className="date-input" value={dataFrom}
                onChange={e => setFrom(e.target.value)} />
              <span className="date-sep">→</span>
              <input type="date" className="date-input" value={dataTo}
                onChange={e => setTo(e.target.value)} />
            </div>
          )}
          <div className="periodo-info">
            {fromDate && <span>{formataData(fromDate.toISOString())} → {formataData(toDate.toISOString())}</span>}
          </div>
        </div>

        {/* KPI */}
        <div className="kpi-row">
          {[
            { icon: "🍳", val: totaleConsumo.toFixed(1), label: "Totale scaricato", sub: "unità consumate in cucina", cls: "blue" },
            { icon: "🗑",  val: totaleSpreco.toFixed(1),  label: "Totale sprechi",   sub: "unità sprecate/scartate",  cls: "red"  },
            { icon: "📊", val: `${percSpreco}%`,          label: "% spreco",          sub: "sul totale movimentato",   cls: percSpreco > 10 ? "red" : "green" },
            { icon: "📦", val: consumiPerProdotto.length, label: "Prodotti",          sub: "con movimenti nel periodo", cls: "gold" },
          ].map((k, i) => (
            <div className="kpi-card" key={i}>
              <div className="kpi-icon">{k.icon}</div>
              <div>
                <div className={`kpi-val kpi-${k.cls}`}>{k.val}</div>
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-sub">{k.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* GRAFICI */}
        <div className="charts-row">

          {/* Andamento nel tempo */}
          <div className="card chart-card">
            <div className="card-header">
              <div className="card-header-icon icon-blue">📈</div>
              <div>
                <div className="card-title">Andamento consumi</div>
                <div className="card-subtitle">Scarico vs Spreco per giorno</div>
              </div>
            </div>
            <div className="bar-chart">
              {andamentoGiorni.map((g, i) => {
                const unloadH = (g.unload / maxGiorno) * 100;
                const wasteH  = (g.waste  / maxGiorno) * 100;
                const label   = new Date(g.data).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
                return (
                  <div className="bar-col" key={i}>
                    <div className="bar-stack">
                      {g.waste > 0 && (
                        <div className="bar-seg waste" style={{ height: `${wasteH}%` }}
                          title={`Spreco: ${g.waste.toFixed(1)}`} />
                      )}
                      {g.unload > 0 && (
                        <div className="bar-seg unload" style={{ height: `${unloadH}%` }}
                          title={`Scarico: ${g.unload.toFixed(1)}`} />
                      )}
                    </div>
                    <div className="bar-label">{label}</div>
                  </div>
                );
              })}
            </div>
            <div className="chart-legend">
              <span className="legend-item"><span className="legend-dot unload-dot" />Scarico cucina</span>
              <span className="legend-item"><span className="legend-dot waste-dot" />Spreco</span>
            </div>
          </div>

          {/* Consumi per categoria */}
          <div className="card chart-card">
            <div className="card-header">
              <div className="card-header-icon icon-gold">🏷</div>
              <div>
                <div className="card-title">Per categoria</div>
                <div className="card-subtitle">Totale movimentato</div>
              </div>
            </div>
            <div className="cat-chart">
              {consumiPerCat.length === 0 ? (
                <div className="empty-mini">Nessun dato nel periodo</div>
              ) : consumiPerCat.map((c, i) => (
                <div className="cat-row" key={i}>
                  <div className="cat-label">
                    <span>{c.emoji}</span>
                    <span>{c.nome}</span>
                  </div>
                  <div className="cat-bar-wrap">
                    <div className="cat-bar-fill"
                      style={{ width: `${(c.totale / maxCat) * 100}%`, background: c.colore }} />
                  </div>
                  <div className="cat-val">{c.totale.toFixed(1)}</div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* TOOLBAR TABELLA */}
        <div className="toolbar">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input className="search-input" placeholder="Cerca prodotto o categoria..."
              value={ricerca} onChange={e => setRicerca(e.target.value)} />
          </div>

          <select className="filter-select" value={catFiltro}
            onChange={e => setCat(e.target.value)}>
            <option value="">Tutte le categorie</option>
            {categorie.map(c => (
              <option key={c.id} value={c.name}>
                {c.color?.split("|")[1]} {c.name}
              </option>
            ))}
          </select>

          <select className="filter-select" value={tipoFiltro}
            onChange={e => setTipo(e.target.value)}>
            <option value="tutti">Scarico + Spreco</option>
            <option value="unload">🍳 Solo scarico</option>
            <option value="waste">🗑 Solo spreco</option>
          </select>

          <select className="filter-select" value={sortBy}
            onChange={e => setSort(e.target.value)}>
            <option value="totale">Ordina: totale ↓</option>
            <option value="waste">Ordina: spreco ↓</option>
            <option value="nome">Ordina: nome A-Z</option>
          </select>

          <span className="total-badge">{consumiPerProdotto.length} prodotti</span>
        </div>

        {/* TABELLA PRODOTTI */}
        <div className="table-wrap">
          <div className="table-head">
            <span className="th">Prodotto</span>
            <span className="th">Categoria</span>
            <span className="th th-right">Scarico cucina</span>
            <span className="th th-right">Spreco</span>
            <span className="th th-right">Totale</span>
            <span className="th">% spreco</span>
            <span className="th th-right">Movimenti</span>
          </div>

          {loading ? (
            <div className="empty-state">
              <div className="empty-icon">⏳</div>
              <div className="empty-text">Caricamento dati...</div>
            </div>
          ) : consumiPerProdotto.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📈</div>
              <div className="empty-text">Nessun consumo nel periodo selezionato</div>
            </div>
          ) : (
            consumiPerProdotto.map(d => {
              const perc     = d.totale > 0 ? (d.waste / d.totale) * 100 : 0;
              const percCls  = perc > 20 ? "perc-danger" : perc > 10 ? "perc-warning" : "perc-ok";
              return (
                <div className="table-row" key={d.id}>

                  <div className="prodotto-cell">
                    <span className="prodotto-emoji-sm">{d.emoji}</span>
                    <div className="prodotto-nome">{d.nome}</div>
                  </div>

                  <div>
                    <span className="cat-badge" style={{ borderColor: d.catColore, color: d.catColore }}>
                      {d.categoria}
                    </span>
                  </div>

                  <div className="td-right qty-unload">
                    {d.unload.toFixed(1)} <span className="unita">{d.unita}</span>
                  </div>

                  <div className="td-right qty-waste">
                    {d.waste > 0 ? `${d.waste.toFixed(1)}` : "—"}
                    {d.waste > 0 && <span className="unita"> {d.unita}</span>}
                  </div>

                  <div className="td-right qty-totale">
                    {d.totale.toFixed(1)} <span className="unita">{d.unita}</span>
                  </div>

                  <div>
                    <div className="perc-wrap">
                      <span className={`perc-val ${percCls}`}>{perc.toFixed(0)}%</span>
                      <div className="perc-bar-bg">
                        <div className={`perc-bar-fill ${percCls}`}
                          style={{ width: `${Math.min(perc, 100)}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="td-right mov-count">{d.movimenti}</div>

                </div>
              );
            })
          )}
        </div>

      </main>
    </div>
  );
}