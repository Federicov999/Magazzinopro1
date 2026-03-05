"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import "./scarico.css";

const TIPI = {
  cucina:    { label: "Scarico cucina",  icon: "🍳", desc: "Uso in preparazione",   color: "blue", dot: "storico-dot-blue", qtyClass: "riepilogo-qty-blue", totalClass: "totale-blue", btnClass: "btn-cucina",    toastClass: "",          toastText: "Scarico registrato!",    toastIcon: "🍳", dbType: "unload"     },
  spreco:    { label: "Spreco / Scarto", icon: "🗑",  desc: "Prodotto da buttare",   color: "red",  dot: "storico-dot-red",  qtyClass: "riepilogo-qty-red",  totalClass: "totale-red",  btnClass: "btn-spreco",    toastClass: "spreco",    toastText: "Spreco registrato.",     toastIcon: "🗑",  dbType: "waste"      },
  rettifica: { label: "Rettifica",       icon: "⚖️",  desc: "Correzione inventario", color: "gold", dot: "storico-dot-gold", qtyClass: "riepilogo-qty-gold", totalClass: "totale-gold", btnClass: "btn-rettifica", toastClass: "rettifica", toastText: "Rettifica registrata.", toastIcon: "⚖️", dbType: "adjustment" },
};

const rigaVuota = () => ({ id: Date.now() + Math.random(), prodottoId: "", qty: "", motivo: "" });

export default function ScaricoPage() {
  const [activeNav, setActiveNav]     = useState("scarico");
  const [tipoAttivo, setTipo]         = useState("cucina");
  const [turno, setTurno]             = useState("pranzo");
  const [dataOra, setDataOra]         = useState(new Date().toISOString().slice(0, 16));
  const [operatore, setOperatore]     = useState("");
  const [righe, setRighe]             = useState([rigaVuota()]);
  const [prodotti, setProdotti]       = useState([]);
  const [storico, setStorico]         = useState([]);
  const [scorteAllarme, setScorteAllarme] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [toast, setToast]             = useState(null);

  const tipo = TIPI[tipoAttivo];

  // ── Carica prodotti e storico da Supabase ──────────────────────────────
  useEffect(() => {
    Promise.all([caricaProdotti(), caricaStorico()]);
  }, []);

  const caricaProdotti = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*, categories(id, name, color)")
      .eq("active", true)
      .order("name");
    if (!error) setProdotti(data || []);
    setLoading(false);
  };

  const caricaStorico = async () => {
    const { data, error } = await supabase
      .from("stock_movements")
      .select("*, products(name, unit)")
      .in("type", ["unload", "waste", "adjustment"])
      .order("movement_date", { ascending: false })
      .limit(10);
    if (!error) setStorico(data || []);
  };

  // ── Gestione righe ─────────────────────────────────────────────────────
  const aggiungiRiga = () => setRighe(p => [...p, rigaVuota()]);

  const rimuoviRiga = (id) => {
    if (righe.length === 1) return;
    setRighe(p => p.filter(r => r.id !== id));
  };

  const aggiornaRiga = (id, campo, valore) => {
    setRighe(p => p.map(r => r.id === id ? { ...r, [campo]: valore } : r));
    setTimeout(() => controllaScorte(), 50);
  };

  const controllaScorte = () => {
    const allarmi = [];
    righe.forEach(r => {
      const prod = prodotti.find(p => p.id === Number(r.prodottoId));
      if (prod && Number(r.qty) > prod.current_stock) {
        allarmi.push(prod.name);
      }
    });
    setScorteAllarme(allarmi);
  };

  // ── Calcoli ────────────────────────────────────────────────────────────
  const righeValide = righe.filter(r => r.prodottoId && r.qty && Number(r.qty) > 0);
  const totaleVoci  = righeValide.reduce((acc, r) => acc + Number(r.qty), 0);

  // ── Salva scarico su Supabase ──────────────────────────────────────────
  const salvaScari = async () => {
    if (righeValide.length === 0 || scorteAllarme.length > 0) return;
    setSaving(true);

    try {
      for (const riga of righeValide) {
        const prod = prodotti.find(p => p.id === Number(riga.prodottoId));
        if (!prod) continue;

        const qty        = Number(riga.qty);
        const stockBefore = prod.current_stock;
        const stockAfter  = stockBefore - qty;

        // 1. INSERT stock_movements
        await supabase.from("stock_movements").insert({
          product_id:    prod.id,
          type:          tipo.dbType,
          quantity:      qty,
          stock_before:  stockBefore,
          stock_after:   stockAfter,
          notes:         riga.motivo || (tipoAttivo === "cucina" ? turno : ""),
          movement_date: dataOra ? new Date(dataOra).toISOString() : new Date().toISOString(),
        });

        // 2. UPDATE current_stock
        await supabase
          .from("products")
          .update({ current_stock: stockAfter })
          .eq("id", prod.id);
      }

      // Ricarica dati aggiornati
      await Promise.all([caricaProdotti(), caricaStorico()]);

      setRighe([rigaVuota()]);
      setScorteAllarme([]);
      setToast({ n: righeValide.length, tipo: tipoAttivo });
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // ── Helper scorta ──────────────────────────────────────────────────────
  const getScortaStatus = (prod, qty) => {
    if (!prod) return null;
    const dopo = prod.current_stock - Number(qty || 0);
    if (dopo < 0)    return { cls: "scorta-danger",  label: `⚠ Supera scorta (${prod.current_stock} ${prod.unit})` };
    if (dopo < 0.5)  return { cls: "scorta-danger",  label: `Rimane: ${dopo.toFixed(1)} ${prod.unit}` };
    if (dopo < 2)    return { cls: "scorta-warning", label: `Rimane: ${dopo.toFixed(1)} ${prod.unit}` };
    return               { cls: "scorta-ok",      label: `Rimane: ${dopo.toFixed(1)} ${prod.unit}` };
  };

  const getProdottoEmoji = (prod) => prod?.categories?.color?.split("|")[1] || "📦";

  // ── Mappa tipo DB → chiave TIPI ────────────────────────────────────────
  const dbTypeToKey = { unload: "cucina", waste: "spreco", adjustment: "rettifica" };

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
            <h1 className="page-title">Scarico merce</h1>
            <p className="page-subtitle">Registra l'utilizzo in cucina, sprechi o rettifiche inventario</p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "rgba(240,230,208,0.5)" }}>
            Caricamento prodotti...
          </div>
        ) : (
          <>
            {/* TAB TIPO */}
            <div className="tipo-tabs">
              {Object.entries(TIPI).map(([key, t]) => (
                <div
                  key={key}
                  className={`tipo-tab ${tipoAttivo === key ? `active ${key}` : ""}`}
                  onClick={() => { setTipo(key); setRighe([rigaVuota()]); setScorteAllarme([]); }}
                >
                  <div className="tipo-tab-icon">{t.icon}</div>
                  <div className="tipo-tab-label">{t.label}</div>
                  <div className="tipo-tab-desc">{t.desc}</div>
                </div>
              ))}
            </div>

            <div className="two-col-layout">

              {/* ── FORM ── */}
              <div>

                {/* Dati turno */}
                <div className="card" style={{ marginBottom: "1rem" }}>
                  <div className="card-header">
                    <div className={`card-header-icon icon-${tipo.color}`}>{tipo.icon}</div>
                    <div>
                      <div className="card-title">{tipo.label}</div>
                      <div className="card-subtitle">Dati operatore e turno</div>
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="two-col">
                      <div className="field">
                        <label>Operatore</label>
                        <input type="text" value={operatore} onChange={e => setOperatore(e.target.value)} placeholder="Nome chef / operatore" />
                      </div>
                      <div className="field">
                        <label>Data e ora</label>
                        <input type="datetime-local" value={dataOra} onChange={e => setDataOra(e.target.value)} />
                      </div>
                    </div>
                    {tipoAttivo === "cucina" && (
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Turno</label>
                        <select value={turno} onChange={e => setTurno(e.target.value)}>
                          <option value="colazione">☀️ Colazione</option>
                          <option value="pranzo">🍽 Pranzo</option>
                          <option value="cena">🌙 Cena</option>
                          <option value="prep">🔪 Preparazione</option>
                        </select>
                      </div>
                    )}
                    {tipoAttivo === "spreco" && (
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Motivo principale</label>
                        <select>
                          <option>Scadenza superata</option>
                          <option>Deterioramento</option>
                          <option>Errore preparazione</option>
                          <option>Temperatura non rispettata</option>
                          <option>Altro</option>
                        </select>
                      </div>
                    )}
                    {tipoAttivo === "rettifica" && (
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Motivo rettifica</label>
                        <select>
                          <option>Conteggio errato</option>
                          <option>Inventario periodico</option>
                          <option>Furto / ammanchi</option>
                          <option>Errore di sistema</option>
                          <option>Altro</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Avviso scorte insufficienti */}
                {scorteAllarme.length > 0 && (
                  <div className="alert-scorta">
                    ⚠️ <span>Scorta insufficiente per: <strong>{scorteAllarme.join(", ")}</strong></span>
                  </div>
                )}

                {/* Prodotti */}
                <div className="card">
                  <div className="card-header">
                    <div className={`card-header-icon icon-${tipo.color}`}>{tipo.icon}</div>
                    <div>
                      <div className="card-title">Prodotti da scaricare</div>
                      <div className="card-subtitle">Inserisci quantità utilizzate</div>
                    </div>
                  </div>
                  <div className="card-body">

                    <div className="righe-header">
                      <span className="col-label">Prodotto</span>
                      <span className="col-label">Quantità</span>
                      <span className="col-label">Motivo / Note</span>
                      <span></span>
                    </div>

                    {righe.map((riga) => {
                      const prod   = prodotti.find(p => p.id === Number(riga.prodottoId));
                      const status = getScortaStatus(prod, riga.qty);
                      return (
                        <div key={riga.id}>
                          <div className="riga">
                            <select value={riga.prodottoId}
                              onChange={e => aggiornaRiga(riga.id, "prodottoId", e.target.value)}>
                              <option value="">Scegli prodotto...</option>
                              {prodotti.map(p => (
                                <option key={p.id} value={p.id}>
                                  {getProdottoEmoji(p)} {p.name} ({p.current_stock} {p.unit})
                                </option>
                              ))}
                            </select>

                            <div style={{ position: "relative" }}>
                              <input type="number" min="0.1" step="0.1" placeholder="0"
                                value={riga.qty}
                                onChange={e => aggiornaRiga(riga.id, "qty", e.target.value)}
                                style={{ paddingRight: prod ? "36px" : "10px" }}
                              />
                              {prod && <span style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", fontSize: "10px", color: "rgba(240,230,208,0.3)", pointerEvents: "none" }}>{prod.unit}</span>}
                            </div>

                            <input type="text" placeholder="Motivo opzionale..."
                              value={riga.motivo}
                              onChange={e => aggiornaRiga(riga.id, "motivo", e.target.value)}
                            />

                            <button className="btn-remove-riga" onClick={() => rimuoviRiga(riga.id)}>×</button>
                          </div>

                          {prod && riga.qty && status && (
                            <div style={{ paddingLeft: "2px", marginTop: "-4px", marginBottom: "6px" }}>
                              <span className={`scorta-disponibile ${status.cls}`}>{status.label}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <button className="btn-add-riga" onClick={aggiungiRiga}>
                      + Aggiungi prodotto
                    </button>
                  </div>
                </div>
              </div>

              {/* ── RIEPILOGO + STORICO ── */}
              <div className="riepilogo">

                <div className="card" style={{ marginBottom: "1rem" }}>
                  <div className="card-header">
                    <div className="card-header-icon icon-gold">📊</div>
                    <div>
                      <div className="card-title">Riepilogo scarico</div>
                      <div className="card-subtitle">{tipo.label}</div>
                    </div>
                  </div>

                  {righeValide.length === 0 ? (
                    <div className="riepilogo-empty">Aggiungi prodotti allo scarico</div>
                  ) : (
                    <div className="riepilogo-list">
                      {righeValide.map(r => {
                        const prod = prodotti.find(p => p.id === Number(r.prodottoId));
                        return (
                          <div className="riepilogo-riga" key={r.id}>
                            <span className="riepilogo-nome">{getProdottoEmoji(prod)} {prod?.name}</span>
                            <span className={tipo.qtyClass}>−{r.qty} {prod?.unit}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="totale-section">
                    <div className="totale-row">
                      <span className="totale-label">Voci totali</span>
                      <span className="totale-val">{righeValide.length} prodotti</span>
                    </div>
                    <div className="totale-row big">
                      <span className="totale-label">Tipo operazione</span>
                      <span className={`totale-val ${tipo.totalClass}`}>{tipo.icon} {tipo.label}</span>
                    </div>
                  </div>

                  <div className="actions-row">
                    <button className="btn-secondary" onClick={() => { setRighe([rigaVuota()]); setScorteAllarme([]); }}>
                      Azzera
                    </button>
                    <button
                      className={`btn-submit ${tipo.btnClass}`}
                      disabled={righeValide.length === 0 || scorteAllarme.length > 0 || saving}
                      onClick={salvaScari}
                    >
                      {saving ? "Salvataggio..." : `${tipo.icon} Registra`}
                    </button>
                  </div>
                </div>

                {/* Storico */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-header-icon icon-gold">🕐</div>
                    <div>
                      <div className="card-title">Scarichi recenti</div>
                      <div className="card-subtitle">Ultimi 10 movimenti</div>
                    </div>
                  </div>
                  {storico.length === 0 ? (
                    <div className="riepilogo-empty">Nessun movimento registrato</div>
                  ) : (
                    storico.map(s => {
                      const tipoKey = dbTypeToKey[s.type] || "cucina";
                      const t = TIPI[tipoKey];
                      const ora = new Date(s.movement_date).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
                      return (
                        <div className="storico-item" key={s.id}>
                          <div className={t?.dot || "storico-dot-blue"} />
                          <div className="storico-info">
                            <div className="storico-prodotto">{s.products?.name}</div>
                            <div className="storico-meta">{t?.label} · {s.notes || "—"} · {ora}</div>
                          </div>
                          <div className={`storico-qty-${t?.color || "blue"}`}>−{s.quantity} {s.products?.unit}</div>
                        </div>
                      );
                    })
                  )}
                </div>

              </div>
            </div>
          </>
        )}
      </main>

      {/* TOAST */}
      {toast && (
        <div className={`toast ${TIPI[toast.tipo].toastClass}`}>
          <span className="toast-icon">{TIPI[toast.tipo].toastIcon}</span>
          <div>
            <div className="toast-text">{TIPI[toast.tipo].toastText}</div>
            <div className="toast-sub">{toast.n} prodotti scaricati</div>
          </div>
        </div>
      )}

    </div>
  );
}