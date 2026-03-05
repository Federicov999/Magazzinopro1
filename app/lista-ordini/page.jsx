"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import "./lista-ordini.css";

const STATO_CONFIG = {
  draft:     { label: "Bozza",     icon: "✏️",  badgeClass: "stato-bozza",     dot: "⚪" },
  pending:   { label: "Inviato",   icon: "📤",  badgeClass: "stato-inviato",   dot: "🔵" },
  received:  { label: "Ricevuto",  icon: "✅",  badgeClass: "stato-ricevuto",  dot: "🟢" },
  cancelled: { label: "Annullato", icon: "❌",  badgeClass: "stato-annullato", dot: "⚫" },
};

const PRIORITA_LABEL = { bassa: "🟢 Bassa", normale: "🟡 Normale", alta: "🔴 Alta" };

function formataData(str) {
  if (!str) return "—";
  return new Date(str).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function iniziali(nome) {
  return (nome || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ListaOrdiniPage() {
  const [activeNav, setActiveNav] = useState("lista");
  const [ordini,    setOrdini]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [espanso,   setEspanso]   = useState(null);
  const [filtroStato, setFiltro]  = useState("tutti");
  const [ricerca,   setRicerca]   = useState("");
  const [toast,     setToast]     = useState(null);

  useEffect(() => { caricaOrdini(); }, []);

  const caricaOrdini = async () => {
    const { data, error } = await supabase
      .from("purchase_orders")
      .select(`
        *,
        suppliers(id, name),
        purchase_order_items(
          id, quantity_ordered, quantity_received, unit_cost,
          products(id, name, unit, categories(color))
        )
      `)
      .order("order_date", { ascending: false });
    if (!error) setOrdini(data || []);
    setLoading(false);
  };

  const getEmoji = (item) => item?.products?.categories?.color?.split("|")[1] || "📦";

  const totaleOrdine = (o) =>
    (o.purchase_order_items || []).reduce((acc, i) => acc + i.quantity_ordered * i.unit_cost, 0);

  // ── KPI ───────────────────────────────────────────────────────────────────
  const contaBozze     = ordini.filter(o => o.status === "draft").length;
  const contaInviati   = ordini.filter(o => o.status === "pending").length;
  const contaRicevuti  = ordini.filter(o => o.status === "received").length;

  // ── Filtra ────────────────────────────────────────────────────────────────
  const ordiniFiltrati = useMemo(() => {
    return ordini.filter(o => {
      const matchStato = filtroStato === "tutti" || o.status === filtroStato;
      const nome       = o.suppliers?.name || "";
      const matchRic   = nome.toLowerCase().includes(ricerca.toLowerCase()) ||
                         (o.id?.toString() || "").includes(ricerca);
      return matchStato && matchRic;
    });
  }, [ordini, filtroStato, ricerca]);

  // ── Cambia stato ──────────────────────────────────────────────────────────
  const cambiaStato = async (id, nuovoStato) => {
    const update = { status: nuovoStato };
    if (nuovoStato === "received") update.expected_date = new Date().toISOString();

    const { error } = await supabase
      .from("purchase_orders")
      .update(update)
      .eq("id", id);

    if (!error) {
      // Se ricevuto → aggiorna current_stock dei prodotti
      if (nuovoStato === "received") {
        const ordine = ordini.find(o => o.id === id);
        for (const item of ordine?.purchase_order_items || []) {
          const { data: pData } = await supabase
            .from("products").select("current_stock").eq("id", item.products?.id).single();
          const nuovaScorta = (pData?.current_stock || 0) + item.quantity_ordered;

          await supabase.from("products")
            .update({ current_stock: nuovaScorta })
            .eq("id", item.products?.id);

          await supabase.from("stock_movements").insert({
            product_id:    item.products?.id,
            type:          "load",
            quantity:      item.quantity_ordered,
            stock_before:  pData?.current_stock || 0,
            stock_after:   nuovaScorta,
            unit_cost:     item.unit_cost,
            notes:         `Ricezione ordine #${id}`,
            movement_date: new Date().toISOString(),
          });
        }
      }

      await caricaOrdini();
      const msgs = {
        pending:   { text: "Ordine segnato come inviato!", icon: "📤" },
        received:  { text: "Merce ricevuta e scorte aggiornate!", icon: "✅" },
        draft:     { text: "Ordine riportato in bozza.", icon: "✏️" },
        cancelled: { text: "Ordine annullato.", icon: "❌" },
      };
      setToast(msgs[nuovoStato]);
      setTimeout(() => setToast(null), 2800);
      setEspanso(null);
    }
  };

  // ── Duplica ordine ────────────────────────────────────────────────────────
  const duplicaOrdine = async (ordine) => {
    const { data: nuovo, error } = await supabase
      .from("purchase_orders")
      .insert({
        supplier_id:  ordine.supplier_id,
        status:       "draft",
        order_date:   new Date().toISOString(),
        total_amount: ordine.total_amount,
        notes:        `Duplicato da ordine #${ordine.id}`,
      })
      .select()
      .single();

    if (!error && nuovo) {
      const items = (ordine.purchase_order_items || []).map(i => ({
        order_id:          nuovo.id,
        product_id:        i.products?.id,
        quantity_ordered:  i.quantity_ordered,
        quantity_received: 0,
        unit_cost:         i.unit_cost,
      }));
      await supabase.from("purchase_order_items").insert(items);
      await caricaOrdini();
      setToast({ text: "Ordine duplicato come bozza!", icon: "📋" });
      setTimeout(() => setToast(null), 2800);
    }
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

        <div className="page-header">
          <div>
            <h1 className="page-title">Lista ordini</h1>
            <p className="page-subtitle">
              {loading ? "Caricamento..." : `${ordini.length} ordini totali`}
            </p>
          </div>
          <button className="btn-primary">+ Nuovo ordine</button>
        </div>

        {/* KPI */}
        <div className="kpi-row">
          {[
            { stato: "tutti",    icon: "📋", val: ordini.length, label: "Tutti gli ordini" },
            { stato: "draft",    icon: "✏️",  val: contaBozze,   label: "In bozza" },
            { stato: "pending",  icon: "📤",  val: contaInviati, label: "Inviati" },
            { stato: "received", icon: "✅",  val: contaRicevuti,label: "Ricevuti" },
          ].map(k => (
            <div key={k.stato}
              className={`kpi-card ${filtroStato === k.stato ? "active-filter" : ""}`}
              onClick={() => setFiltro(k.stato)}>
              <div className="kpi-icon">{k.icon}</div>
              <div>
                <div className="kpi-val">{k.val}</div>
                <div className="kpi-label">{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* TOOLBAR */}
        <div className="toolbar">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input className="search-input" placeholder="Cerca fornitore o numero ordine..."
              value={ricerca} onChange={e => setRicerca(e.target.value)} />
          </div>
          <select className="filter-select" value={filtroStato}
            onChange={e => setFiltro(e.target.value)}>
            <option value="tutti">Tutti gli stati</option>
            <option value="draft">✏️ Bozza</option>
            <option value="pending">📤 Inviato</option>
            <option value="received">✅ Ricevuto</option>
            <option value="cancelled">❌ Annullato</option>
          </select>
          <span className="total-badge">{ordiniFiltrati.length} risultati</span>
        </div>

        {/* LISTA */}
        {loading ? (
          <div className="empty-state">
            <div className="empty-icon">⏳</div>
            <div className="empty-text">Caricamento ordini...</div>
          </div>
        ) : ordiniFiltrati.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div className="empty-text">Nessun ordine trovato</div>
          </div>
        ) : (
          <div className="ordini-list">
            {ordiniFiltrati.map(o => {
              const sc     = STATO_CONFIG[o.status] || STATO_CONFIG.draft;
              const aperto = espanso === o.id;
              const totale = totaleOrdine(o);
              const items  = o.purchase_order_items || [];

              return (
                <div key={o.id} className={`ordine-card ${o.status}`}>

                  {/* HEADER CARD */}
                  <div className="ordine-header" onClick={() => setEspanso(aperto ? null : o.id)}>

                    <div className="ordine-num">#{o.id}</div>

                    <div className="fornitore-avatar">{iniziali(o.suppliers?.name)}</div>

                    <div className="ordine-main">
                      <div className="ordine-fornitore">{o.suppliers?.name || "—"}</div>
                      <div className="ordine-meta">
                        <span>📅 {formataData(o.order_date)}</span>
                        {o.expected_date && <span>🚚 Consegna: {formataData(o.expected_date)}</span>}
                        <span>📦 {items.length} prodotti</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      <span className={`stato-badge ${sc.badgeClass}`}>{sc.icon} {sc.label}</span>
                      <div className="ordine-importo">
                        <div className="importo-val">€ {totale.toFixed(2)}</div>
                      </div>
                    </div>

                    <span style={{ fontSize: 14, color: "rgba(200,140,40,0.4)", marginLeft: 8, transition: "transform 0.2s", transform: aperto ? "rotate(180deg)" : "rotate(0deg)" }}>
                      ▾
                    </span>
                  </div>

                  {/* DETTAGLIO ESPANSO */}
                  {aperto && (
                    <div className="ordine-detail">

                      <div className="prodotti-inline">
                        {items.map((item, i) => (
                          <div className="prodotto-chip" key={i}>
                            {getEmoji(item)} {item.products?.name}
                            <span className="prodotto-chip-qty">
                              {item.quantity_ordered} {item.products?.unit}
                            </span>
                          </div>
                        ))}
                      </div>

                      {o.notes && <div className="ordine-note">📝 {o.notes}</div>}

                      <div className="detail-actions">
                        {o.status === "draft" && <>
                          <button className="btn-stato btn-invia"
                            onClick={() => cambiaStato(o.id, "pending")}>
                            📤 Segna come inviato
                          </button>
                          <button className="btn-stato btn-annulla"
                            onClick={() => cambiaStato(o.id, "cancelled")}>
                            ❌ Annulla
                          </button>
                        </>}
                        {o.status === "pending" && <>
                          <button className="btn-stato btn-ricevi"
                            onClick={() => cambiaStato(o.id, "received")}>
                            ✅ Segna come ricevuto
                          </button>
                          <button className="btn-stato btn-riapri"
                            onClick={() => cambiaStato(o.id, "draft")}>
                            ↩ Riporta in bozza
                          </button>
                          <button className="btn-stato btn-annulla"
                            onClick={() => cambiaStato(o.id, "cancelled")}>
                            ❌ Annulla
                          </button>
                        </>}
                        {(o.status === "received" || o.status === "cancelled") && <>
                          <button className="btn-stato btn-duplica"
                            onClick={() => duplicaOrdine(o)}>
                            📋 Duplica ordine
                          </button>
                        </>}
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* TOAST */}
      {toast && (
        <div className="toast">
          <span className="toast-icon">{toast.icon}</span>
          <div><div className="toast-text">{toast.text}</div></div>
        </div>
      )}

    </div>
  );
}