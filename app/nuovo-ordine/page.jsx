"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import "./nuovo-ordine.css";

function iniziali(nome) {
  return nome.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function getScortaStatus(scorta, soglia) {
  if (scorta === 0)           return { cls: "scorta-danger",  label: "Esaurito" };
  if (scorta <= soglia * 0.5) return { cls: "scorta-danger",  label: `${scorta} rimasti` };
  if (scorta <= soglia)       return { cls: "scorta-warning", label: `${scorta} rimasti` };
  return                             { cls: "scorta-ok",      label: `${scorta} ok` };
}

// ─────────────────────────────────────────────────────────────────────────────
export default function NuovoOrdinePage() {
  const [activeNav, setActiveNav]   = useState("ordini");
  const [step, setStep]             = useState(1);

  const [fornitori, setFornitori]   = useState([]);
  const [prodotti,  setProdotti]    = useState([]);
  const [loading,   setLoading]     = useState(true);
  const [saving,    setSaving]      = useState(false);

  // Step 1
  const [fornitoreId, setFornitore] = useState(null);

  // Step 2
  const [ricerca,        setRicerca]  = useState("");
  const [righe,          setRighe]    = useState({});   // { prodottoId: qty }
  const [soloSottoSoglia, setSoglia]  = useState(false);

  // Step 3
  const [dataConsegna, setData]     = useState("");
  const [priorita,     setPriorita] = useState("normale");
  const [note,         setNote]     = useState("");

  const [toast, setToast]           = useState(null);

  // ── Carica dati ────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([caricaFornitori(), caricaProdotti()]);
  }, []);

  const caricaFornitori = async () => {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id, name, contact_name, notes")
      .eq("active", true)
      .order("name");
    if (!error) setFornitori(data || []);
  };

  const caricaProdotti = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, unit, current_stock, min_stock, ideal_stock, cost_per_unit, supplier_id, categories(color)")
      .eq("active", true)
      .order("name");
    if (!error) setProdotti(data || []);
    setLoading(false);
  };

  const fornitore    = fornitori.find(f => f.id === fornitoreId);
  const getEmoji     = (p) => p?.categories?.color?.split("|")[1] || "📦";

  // ── Prodotti filtrati ──────────────────────────────────────────────────
  const prodottiFiltrati = useMemo(() => {
    return prodotti.filter(p => {
      const matchFor = fornitoreId ? p.supplier_id === fornitoreId : true;
      const matchRic = p.name.toLowerCase().includes(ricerca.toLowerCase());
      const matchSog = soloSottoSoglia ? p.current_stock <= p.min_stock : true;
      return matchFor && matchRic && matchSog;
    });
  }, [prodotti, fornitoreId, ricerca, soloSottoSoglia]);

  const prodottiSottoSoglia = prodotti.filter(p =>
    (!fornitoreId || p.supplier_id === fornitoreId) && p.current_stock <= p.min_stock
  ).length;

  // ── Righe valide + totale ──────────────────────────────────────────────
  const righeValide = Object.entries(righe)
    .filter(([, qty]) => Number(qty) > 0)
    .map(([id, qty]) => ({ prodotto: prodotti.find(p => p.id === Number(id)), qty: Number(qty) }))
    .filter(r => r.prodotto);

  const totaleImporto = righeValide.reduce((acc, r) => acc + r.qty * (r.prodotto.cost_per_unit || 0), 0);

  // ── Gestione selezione prodotti ────────────────────────────────────────
  const toggleProdotto = (prodId) => {
    setRighe(prev => {
      if (prev[prodId]) {
        const n = { ...prev }; delete n[prodId]; return n;
      }
      const p = prodotti.find(x => x.id === prodId);
      const suggerita = p ? Math.max(1, (p.ideal_stock || p.min_stock * 2) - p.current_stock) : 1;
      return { ...prev, [prodId]: suggerita };
    });
  };

  const aggiornaQty = (prodId, val) => {
    setRighe(prev => ({ ...prev, [prodId]: val }));
  };

  // ── Salva ordine su Supabase ───────────────────────────────────────────
  const salvaOrdine = async (status) => {
    if (!fornitoreId || righeValide.length === 0) return;
    setSaving(true);

    try {
      // 1. INSERT purchase_orders
      const { data: ordine, error: errOrdine } = await supabase
        .from("purchase_orders")
        .insert({
          supplier_id:    fornitoreId,
          status,
          order_date:     new Date().toISOString(),
          expected_date:  dataConsegna ? new Date(dataConsegna).toISOString() : null,
          total_amount:   totaleImporto,
          notes:          note || null,
        })
        .select()
        .single();

      if (errOrdine) throw errOrdine;

      // 2. INSERT purchase_order_items
      const items = righeValide.map(r => ({
        order_id:          ordine.id,
        product_id:        r.prodotto.id,
        quantity_ordered:  r.qty,
        quantity_received: 0,
        unit_cost:         r.prodotto.cost_per_unit || 0,
      }));

      await supabase.from("purchase_order_items").insert(items);

      const isBozza = status === "draft";
      setToast({
        fornitore: fornitore.name,
        n: righeValide.length,
        importo: totaleImporto.toFixed(2),
        bozza: isBozza,
      });

      setTimeout(() => {
        setToast(null);
        setStep(1); setFornitore(null); setRighe({});
        setData(""); setPriorita("normale"); setNote(""); setRicerca("");
      }, 3000);

    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
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
            <h1 className="page-title">Nuovo ordine</h1>
            <p className="page-subtitle">Crea un ordine da inviare al fornitore</p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "rgba(240,230,208,0.5)" }}>
            Caricamento dati...
          </div>
        ) : (
          <>
            {/* STEPPER */}
            <div className="stepper">
              {[
                { n: 1, label: "Fornitore", desc: "Scegli a chi ordinare" },
                { n: 2, label: "Prodotti",  desc: "Cosa e quanto ordinare" },
                { n: 3, label: "Dettagli",  desc: "Data e priorità" },
              ].map(s => (
                <div key={s.n}
                  className={`step ${step > s.n ? "done" : step === s.n ? "active" : "pending"}`}
                  onClick={() => step > s.n && setStep(s.n)}
                  style={{ cursor: step > s.n ? "pointer" : "default" }}
                >
                  <div className="step-num">{step > s.n ? "✓" : s.n}</div>
                  <div className="step-info">
                    <div className="step-label">{s.label}</div>
                    <div className="step-desc">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="two-col-layout">

              {/* ── COLONNA SINISTRA ── */}
              <div>

                {/* STEP 1: FORNITORE */}
                {step === 1 && (
                  <div className="card">
                    <div className="card-header">
                      <div className="card-header-icon icon-gold">🚚</div>
                      <div>
                        <div className="card-title">Seleziona fornitore</div>
                        <div className="card-subtitle">Clicca sul fornitore a cui vuoi fare l'ordine</div>
                      </div>
                    </div>
                    <div className="card-body">
                      <div className="fornitori-grid">
                        {fornitori.map(f => (
                          <div key={f.id}
                            className={`fornitore-card ${fornitoreId === f.id ? "selected" : ""}`}
                            onClick={() => setFornitore(f.id)}
                          >
                            <div className="fornitore-avatar-sm">{iniziali(f.name)}</div>
                            <div style={{ flex: 1 }}>
                              <div className="fornitore-nome-sm">{f.name}</div>
                              <div className="fornitore-contatto-sm">
                                {f.contact_name}{f.notes ? ` · ${f.notes}` : ""}
                              </div>
                            </div>
                            <span className="fornitore-check">✓</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: "1.4rem", display: "flex", justifyContent: "flex-end" }}>
                        <button className="btn-primary" style={{ width: "auto", padding: "10px 24px" }}
                          disabled={!fornitoreId}
                          onClick={() => setStep(2)}>
                          Avanti → Scegli prodotti
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: PRODOTTI */}
                {step === 2 && (
                  <div className="card">
                    <div className="card-header">
                      <div className="card-header-icon icon-gold">📦</div>
                      <div>
                        <div className="card-title">Seleziona prodotti</div>
                        <div className="card-subtitle">
                          {fornitore?.name} · clicca per aggiungere, modifica la quantità
                        </div>
                      </div>
                    </div>
                    <div className="card-body">

                      <div className="fornitore-selected-bar">
                        <span style={{ fontSize: 18 }}>🚚</span>
                        <span className="fornitore-selected-nome">{fornitore?.name}</span>
                        <span className="fornitore-selected-note">{fornitore?.notes}</span>
                        <button className="btn-cambia" onClick={() => setStep(1)}>Cambia</button>
                      </div>

                      {prodottiSottoSoglia > 0 && (
                        <div className="scorte-hint">
                          ⚠️ {prodottiSottoSoglia} prodotti di questo fornitore sono sotto scorta minima
                          <button
                            style={{ marginLeft: "auto", fontSize: 11, background: "none", border: "none", color: "#c8923a", cursor: "pointer", padding: 0 }}
                            onClick={() => setSoglia(s => !s)}
                          >
                            {soloSottoSoglia ? "Mostra tutti" : "Mostra solo quelli"}
                          </button>
                        </div>
                      )}

                      <div className="prod-search-wrap">
                        <span className="prod-search-icon">🔍</span>
                        <input className="prod-search-input" placeholder="Cerca prodotto..."
                          value={ricerca} onChange={e => setRicerca(e.target.value)} />
                      </div>

                      <div className="prodotti-list">
                        {prodottiFiltrati.length === 0 && (
                          <div style={{ textAlign: "center", padding: "2rem", color: "rgba(240,230,208,0.2)", fontSize: 13 }}>
                            Nessun prodotto trovato
                          </div>
                        )}
                        {prodottiFiltrati.map(p => {
                          const inOrdine = !!righe[p.id];
                          const status   = getScortaStatus(p.current_stock, p.min_stock);
                          return (
                            <div key={p.id} className={`prod-row ${inOrdine ? "in-order" : ""}`}>
                              <span className="prod-emoji">{getEmoji(p)}</span>
                              <div className="prod-info" onClick={() => toggleProdotto(p.id)}>
                                <div className="prod-nome">{p.name}</div>
                                <div className="prod-detail">
                                  {p.cost_per_unit ? `€${p.cost_per_unit}/${p.unit}` : p.unit}
                                </div>
                              </div>
                              <span className={`prod-scorta ${status.cls}`}>{status.label}</span>

                              {inOrdine ? (
                                <>
                                  <input
                                    className="prod-qty-input"
                                    type="number" min="0.1" step="0.1"
                                    value={righe[p.id]}
                                    onChange={e => aggiornaQty(p.id, e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                  />
                                  <span style={{ fontSize: 10, color: "rgba(240,230,208,0.3)", minWidth: 24 }}>{p.unit}</span>
                                  <button className="prod-add-btn added" onClick={() => toggleProdotto(p.id)}>✓</button>
                                </>
                              ) : (
                                <button className="prod-add-btn" onClick={() => toggleProdotto(p.id)}>+</button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.4rem" }}>
                        <button className="btn-secondary" style={{ width: "auto", padding: "9px 18px" }}
                          onClick={() => setStep(1)}>← Indietro</button>
                        <button className="btn-primary" style={{ width: "auto", padding: "10px 24px" }}
                          disabled={righeValide.length === 0}
                          onClick={() => setStep(3)}>
                          Avanti → Dettagli ordine
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: DETTAGLI */}
                {step === 3 && (
                  <div className="card">
                    <div className="card-header">
                      <div className="card-header-icon icon-blue">📋</div>
                      <div>
                        <div className="card-title">Dettagli ordine</div>
                        <div className="card-subtitle">Data di consegna e priorità</div>
                      </div>
                    </div>
                    <div className="card-body">

                      <div className="fornitore-selected-bar">
                        <span style={{ fontSize: 18 }}>🚚</span>
                        <span className="fornitore-selected-nome">{fornitore?.name}</span>
                        <span className="fornitore-selected-note">
                          {righeValide.length} prodotti · € {totaleImporto.toFixed(2)}
                        </span>
                        <button className="btn-cambia" onClick={() => setStep(2)}>Modifica</button>
                      </div>

                      <div className="two-col">
                        <div className="field">
                          <label>Data consegna richiesta</label>
                          <input type="date" value={dataConsegna} onChange={e => setData(e.target.value)} />
                        </div>
                        <div className="field">
                          <label>Priorità</label>
                          <select value={priorita} onChange={e => setPriorita(e.target.value)}>
                            <option value="bassa">🟢 Bassa — nessuna urgenza</option>
                            <option value="normale">🟡 Normale — entro questa settimana</option>
                            <option value="alta">🔴 Alta — il prima possibile</option>
                          </select>
                        </div>
                      </div>

                      <div className="field">
                        <label>Note per il fornitore</label>
                        <textarea rows={3} placeholder="Es. Consegnare entro le 9, citofono 3..."
                          value={note} onChange={e => setNote(e.target.value)} />
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-start" }}>
                        <button className="btn-secondary" style={{ width: "auto", padding: "9px 18px" }}
                          onClick={() => setStep(2)}>← Indietro</button>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* ── RIEPILOGO ORDINE ── */}
              <div className="riepilogo">
                <div className="card">
                  <div className="card-header">
                    <div className="card-header-icon icon-gold">📊</div>
                    <div>
                      <div className="card-title">Riepilogo ordine</div>
                      <div className="card-subtitle">{fornitore ? fornitore.name : "Nessun fornitore"}</div>
                    </div>
                  </div>

                  {righeValide.length === 0 ? (
                    <div className="ordine-empty">
                      {step === 1 ? "Seleziona un fornitore" : "Aggiungi prodotti all'ordine"}
                    </div>
                  ) : (
                    <div className="ordine-righe">
                      {righeValide.map(r => (
                        <div className="ordine-riga" key={r.prodotto.id}>
                          <span className="ordine-emoji">{getEmoji(r.prodotto)}</span>
                          <div className="ordine-info">
                            <div className="ordine-nome">{r.prodotto.name}</div>
                            <div className="ordine-qty">{r.qty} {r.prodotto.unit}</div>
                          </div>
                          <div className="ordine-costo">
                            {r.prodotto.cost_per_unit
                              ? `€ ${(r.qty * r.prodotto.cost_per_unit).toFixed(2)}`
                              : "—"}
                          </div>
                          <button className="btn-rimuovi-riga"
                            onClick={() => toggleProdotto(r.prodotto.id)}>×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="totale-section">
                    <div className="totale-row">
                      <span className="totale-label">Prodotti</span>
                      <span className="totale-val">{righeValide.length} voci</span>
                    </div>
                    {dataConsegna && (
                      <div className="totale-row">
                        <span className="totale-label">Consegna</span>
                        <span className="totale-val">
                          {new Date(dataConsegna).toLocaleDateString("it-IT")}
                        </span>
                      </div>
                    )}
                    {priorita !== "normale" && (
                      <div className="totale-row">
                        <span className="totale-label">Priorità</span>
                        <span className="totale-val">{priorita === "alta" ? "🔴 Alta" : "🟢 Bassa"}</span>
                      </div>
                    )}
                    <div className="totale-row big" style={{ marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid rgba(200,140,40,0.1)" }}>
                      <span className="totale-label">Totale stimato</span>
                      <span className="totale-val">€ {totaleImporto.toFixed(2)}</span>
                    </div>
                  </div>

                  {step === 3 && (
                    <div className="actions-col">
                      <button className="btn-primary"
                        disabled={righeValide.length === 0 || saving}
                        onClick={() => salvaOrdine("pending")}>
                        {saving ? "Salvataggio..." : "📤 Invia ordine al fornitore"}
                      </button>
                      <button className="btn-secondary"
                        disabled={saving}
                        onClick={() => salvaOrdine("draft")}>
                        💾 Salva in bozza
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </>
        )}
      </main>

      {/* TOAST */}
      {toast && (
        <div className="toast">
          <span className="toast-icon">{toast.bozza ? "💾" : "📤"}</span>
          <div>
            <div className="toast-text">
              {toast.bozza ? "Bozza salvata!" : "Ordine inviato con successo!"}
            </div>
            <div className="toast-sub">
              {toast.fornitore} · {toast.n} prodotti · € {toast.importo}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}