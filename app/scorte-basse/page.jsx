"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import "./scorte-basse.css";

function getStatus(scorta, soglia) {
  if (scorta === 0)             return { key: "esaurito", label: "Esaurito",  pct: 0 };
  const pct = (scorta / soglia) * 100;
  if (pct <= 40)                return { key: "critico",  label: "Critico",   pct };
  return                               { key: "basso",    label: "Basso",     pct };
}

export default function ScorteBassePage() {
  const [activeNav, setActiveNav] = useState("scorte");
  const [prodotti, setProdotti]   = useState([]);
  const [fornitori, setFornitori] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [ricerca, setRicerca]     = useState("");
  const [filtroStato, setFiltro]  = useState("tutti");
  const [modale, setModale]       = useState(null);
  const [qtyOrdine, setQtyOrdine] = useState("");
  const [fornOrdine, setFornOrdine] = useState("");
  const [toast, setToast]         = useState(null);
  const [ordini, setOrdini]       = useState({});
  const [saving, setSaving]       = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);

    const [{ data: prods }, { data: forns }] = await Promise.all([
      supabase.from("products")
        .select("*, categories(name, color), suppliers(id, name, notes)")
        .eq("active", true)
        .order("name"),
      supabase.from("suppliers").select("id, name").eq("active", true).order("name"),
    ]);

    if (prods) {
      const sottosoglia = prods.filter(p => p.current_stock <= p.min_stock);
      setProdotti(sottosoglia.map(p => ({
        id:        p.id,
        nome:      p.name,
        sku:       p.sku || "",
        emoji:     p.categories?.color?.split("|")[1] || "📦",
        categoria: p.categories?.name || "—",
        catColore: p.categories?.color?.split("|")[0] || "#c8923a",
        unita:     p.unit || "kg",
        scorta:    p.current_stock || 0,
        soglia:    p.min_stock || 0,
        ideale:    p.ideal_stock || 0,
        fornitoreId: p.supplier_id,
        fornitore: p.suppliers?.name || "—",
        fornNote:  p.suppliers?.notes || "",
      })));
    }

    if (forns) setFornitori(forns);
    setLoading(false);
  }

  const contaEsauriti = prodotti.filter(p => p.scorta === 0).length;
  const contaCritici  = prodotti.filter(p => p.scorta > 0 && getStatus(p.scorta, p.soglia).key === "critico").length;

  const prodottiFiltrati = useMemo(() => {
    return prodotti.filter(p => {
      const st = getStatus(p.scorta, p.soglia);
      const matchRic  = p.nome.toLowerCase().includes(ricerca.toLowerCase()) ||
                        p.categoria.toLowerCase().includes(ricerca.toLowerCase());
      const matchFilt = filtroStato === "tutti" || st.key === filtroStato;
      return matchRic && matchFilt;
    }).sort((a, b) => getStatus(a.scorta, a.soglia).pct - getStatus(b.scorta, b.soglia).pct);
  }, [prodotti, ricerca, filtroStato]);

  const apriModale = (p) => {
    setModale(p);
    setQtyOrdine(Math.max(1, p.ideale - p.scorta).toFixed(1));
    setFornOrdine(p.fornitoreId || "");
  };

  const confermaOrdine = async () => {
    if (!modale || !qtyOrdine || Number(qtyOrdine) <= 0) return;
    setSaving(true);

    const fornSelezionato = fornitori.find(f => f.id === Number(fornOrdine));

    // Crea un ordine draft in purchase_orders
    const { data: ordine } = await supabase.from("purchase_orders").insert({
      supplier_id: Number(fornOrdine) || null,
      status:      "draft",
      order_date:  new Date().toISOString(),
      notes:       `Ordine rapido da Scorte basse`,
    }).select().single();

    if (ordine) {
      await supabase.from("purchase_order_items").insert({
        order_id:         ordine.id,
        product_id:       modale.id,
        quantity_ordered: Number(qtyOrdine),
        unit_cost:        null,
      });
    }

    setOrdini(prev => ({ ...prev, [modale.id]: true }));
    setToast({ nome: modale.nome, qty: qtyOrdine, unita: modale.unita, fornitore: fornSelezionato?.name || "—" });
    setTimeout(() => setToast(null), 3500);
    setSaving(false);
    setModale(null);
  };

  const ordinaTutti = async () => {
    // Crea un unico ordine draft con tutti i prodotti filtrati
    const { data: ordine } = await supabase.from("purchase_orders").insert({
      supplier_id: null,
      status:      "draft",
      order_date:  new Date().toISOString(),
      notes:       `Ordine multiplo da Scorte basse — ${prodottiFiltrati.length} prodotti`,
    }).select().single();

    if (ordine) {
      const items = prodottiFiltrati.map(p => ({
        order_id:         ordine.id,
        product_id:       p.id,
        quantity_ordered: Math.max(1, p.ideale - p.scorta),
        unit_cost:        null,
      }));
      await supabase.from("purchase_order_items").insert(items);
    }

    const nuovi = {};
    prodottiFiltrati.forEach(p => { nuovi[p.id] = true; });
    setOrdini(prev => ({ ...prev, ...nuovi }));
    setToast({ tutti: true, n: prodottiFiltrati.length });
    setTimeout(() => setToast(null), 3500);
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
            <div><div className="user-name">Magazzino Pro</div><div className="user-role">Responsabile</div></div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="main-content">

        <div className="page-header">
          <div>
            <h1 className="page-title">Scorte basse</h1>
            <p className="page-subtitle">{prodotti.length} prodotti sotto la soglia minima</p>
          </div>
          <button className="btn-ordina-tutti" onClick={ordinaTutti} disabled={prodottiFiltrati.length === 0}>
            📦 Ordina tutto
          </button>
        </div>

        {contaEsauriti > 0 && (
          <div className="alert-banner">
            <span className="banner-icon">🚨</span>
            <div className="banner-text">
              <div className="banner-title">{contaEsauriti} prodotti completamente esauriti</div>
              <div className="banner-sub">Richiedono un ordine urgente prima del prossimo servizio</div>
            </div>
            <button className="banner-action" onClick={() => setFiltro("esaurito")}>
              Mostra esauriti
            </button>
          </div>
        )}

        <div className="kpi-row">
          {[
            { key: "tutti",    icon: "⚠️", val: prodotti.length, label: "Sotto soglia",   cls: "gold" },
            { key: "esaurito", icon: "🔴", val: contaEsauriti,   label: "Esauriti",       cls: "red" },
            { key: "critico",  icon: "🟠", val: contaCritici,    label: "Critici (<40%)", cls: "orange" },
          ].map(k => (
            <div key={k.key} className={`kpi-card ${filtroStato === k.key ? "active" : ""}`}
              onClick={() => setFiltro(k.key)}>
              <div className="kpi-icon">{k.icon}</div>
              <div>
                <div className={`kpi-val ${k.cls}`}>{k.val}</div>
                <div className="kpi-label">{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="toolbar">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input className="search-input" placeholder="Cerca prodotto o categoria..."
              value={ricerca} onChange={e => setRicerca(e.target.value)} />
          </div>
          <select className="filter-select" value={filtroStato} onChange={e => setFiltro(e.target.value)}>
            <option value="tutti">Tutti</option>
            <option value="esaurito">🔴 Esauriti</option>
            <option value="critico">🟠 Critici</option>
            <option value="basso">🟡 Bassi</option>
          </select>
          <span className="total-badge">{prodottiFiltrati.length} prodotti</span>
        </div>

        {loading ? (
          <p style={{ padding: "2rem", color: "#888" }}>Caricamento scorte...</p>
        ) : prodottiFiltrati.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">✅</div>
            <div className="empty-text">Nessun prodotto sotto soglia!</div>
            <div className="empty-sub">Tutte le scorte sono nella norma</div>
          </div>
        ) : (
          <div className="prodotti-grid">
            {prodottiFiltrati.map(p => {
              const status      = getStatus(p.scorta, p.soglia);
              const giàOrdinato = !!ordini[p.id];
              const mancante    = Math.max(0, p.ideale - p.scorta).toFixed(1);
              return (
                <div key={p.id} className={`prodotto-card ${status.key}`}>
                  <div className={`urgenza-bar ${status.key}`} />
                  <div className="card-body">
                    <div className="card-top">
                      <div className="prodotto-emoji-wrap" style={{ background: `${p.catColore}18` }}>
                        {p.emoji}
                      </div>
                      <div className="prodotto-info">
                        <div className="prodotto-nome">{p.nome}</div>
                        <div className="prodotto-cat" style={{ color: p.catColore }}>{p.categoria}</div>
                        <div className="prodotto-sku">{p.sku}</div>
                      </div>
                      <span className={`stato-badge badge-${status.key}`}>{status.label}</span>
                    </div>

                    <div className="scorta-section">
                      <div className="scorta-row">
                        <span className={`scorta-attuale text-${status.key}`}>
                          {p.scorta === 0 ? "0" : p.scorta} {p.unita}
                        </span>
                        <span className="scorta-info">soglia min: {p.soglia} {p.unita}</span>
                      </div>
                      <div className="bar-bg">
                        <div className={`bar-fill fill-${status.key}`}
                          style={{ width: `${Math.min(status.pct, 100)}%` }} />
                      </div>
                      <div className="scorta-dettagli">
                        <div className="scorta-detail-item">
                          <span className="detail-label">Scorta ideale</span>
                          <span className="detail-val">{p.ideale} {p.unita}</span>
                        </div>
                        <div className="scorta-detail-item">
                          <span className="detail-label">Mancante</span>
                          <span className="detail-val" style={{ color: "#e09040" }}>{mancante} {p.unita}</span>
                        </div>
                        <div className="scorta-detail-item">
                          <span className="detail-label">Copertura</span>
                          <span className="detail-val">{Math.round(status.pct)}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="fornitore-row">
                      <div className="fornitore-dot" />
                      <span className="fornitore-nome-sm">{p.fornitore}</span>
                      {p.fornNote && <span className="fornitore-note-sm">{p.fornNote}</span>}
                    </div>

                    <div className="card-actions">
                      {giàOrdinato ? (
                        <button className="btn-ordine-rapido"
                          style={{ background: "rgba(60,180,100,0.2)", color: "#60c878" }} disabled>
                          ✅ Ordine creato
                        </button>
                      ) : (
                        <button className="btn-ordine-rapido" onClick={() => apriModale(p)}>
                          📦 Ordine rapido
                        </button>
                      )}
                      <button className="btn-dettaglio">···</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* MODALE ORDINE RAPIDO */}
      {modale && (
        <div className="modal-overlay" onClick={() => setModale(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-emoji">{modale.emoji}</span>
              <div>
                <div className="modal-title">Ordine rapido</div>
                <div className="modal-sub">{modale.nome}</div>
              </div>
            </div>

            <div className="modal-scorta-info">
              <div className="info-box">
                <div className="info-box-label">Scorta attuale</div>
                <div className={`info-box-val ${modale.scorta === 0 ? "val-red" : "val-gold"}`}>
                  {modale.scorta} {modale.unita}
                </div>
              </div>
              <div className="info-box">
                <div className="info-box-label">Soglia min.</div>
                <div className="info-box-val val-gold">{modale.soglia} {modale.unita}</div>
              </div>
              <div className="info-box">
                <div className="info-box-label">Scorta ideale</div>
                <div className="info-box-val val-green">{modale.ideale} {modale.unita}</div>
              </div>
            </div>

            <div className="field">
              <label>Quantità da ordinare</label>
              <div className="input-unit-wrap">
                <input type="number" min="0.1" step="0.1"
                  value={qtyOrdine} onChange={e => setQtyOrdine(e.target.value)} />
                <span className="input-unit">{modale.unita}</span>
              </div>
            </div>

            <div className="field">
              <label>Fornitore</label>
              <select value={fornOrdine} onChange={e => setFornOrdine(e.target.value)}>
                <option value="">Seleziona fornitore...</option>
                {fornitori.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            <div className="modal-actions">
              <button className="btn-annulla-modal" onClick={() => setModale(null)}>Annulla</button>
              <button className="btn-conferma" onClick={confermaOrdine}
                disabled={!qtyOrdine || Number(qtyOrdine) <= 0 || saving}>
                {saving ? "Creazione..." : "📦 Crea ordine"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div className="toast">
          <span className="toast-icon">📦</span>
          <div>
            <div className="toast-text">
              {toast.tutti ? `${toast.n} ordini creati con successo!` : `Ordine creato per ${toast.nome}!`}
            </div>
            {!toast.tutti && (
              <div className="toast-sub">{toast.qty} {toast.unita} → {toast.fornitore}</div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}