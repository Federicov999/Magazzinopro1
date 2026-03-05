"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import "./carico.css";

const rigaVuota = () => ({ id: Date.now() + Math.random(), prodottoId: "", qty: "", costoUnit: "", scadenza: "" });

export default function CaricoPage() {
  const [activeNav, setActiveNav]   = useState("carico");
  const [prodotti, setProdotti]     = useState([]);
  const [fornitori, setFornitori]   = useState([]);
  const [storico, setStorico]       = useState([]);
  const [fornitoreId, setFornitore] = useState("");
  const [dataConsegna, setData]     = useState(new Date().toISOString().split("T")[0]);
  const [numDocumento, setNumDoc]   = useState("");
  const [note, setNote]             = useState("");
  const [righe, setRighe]           = useState([rigaVuota()]);
  const [toast, setToast]           = useState(null);
  const [saving, setSaving]         = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const { data: prods } = await supabase
      .from("products")
      .select("*, categories(name, color)")
      .eq("active", true)
      .order("name");

    const { data: forns } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("active", true)
      .order("name");

    const { data: movs } = await supabase
      .from("stock_movements")
      .select("*, products(name, unit)")
      .eq("type", "load")
      .order("movement_date", { ascending: false })
      .limit(6);

    if (prods) setProdotti(prods);
    if (forns) setFornitori(forns);
    if (movs) setStorico(movs.map(m => ({
      id: m.id,
      prodotto: m.products?.name || "—",
      qty: m.quantity,
      unita: m.products?.unit || "",
      fornitore: m.notes || "—",
      ora: new Date(m.movement_date).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
    })));
  }

  // ── Gestione righe ──────────────────────────────────────────────────────
  const aggiungiRiga = () => setRighe(p => [...p, rigaVuota()]);

  const rimuoviRiga = (id) => {
    if (righe.length === 1) return;
    setRighe(p => p.filter(r => r.id !== id));
  };

  const aggiornaRiga = (id, campo, valore) => {
    setRighe(p => p.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [campo]: valore };
      if (campo === "prodottoId") {
        const prod = prodotti.find(p => p.id === Number(valore));
        if (prod) updated.costoUnit = prod.cost_per_unit || "";
      }
      return updated;
    }));
  };

  // ── Calcoli ─────────────────────────────────────────────────────────────
  const righeValide = righe.filter(r => r.prodottoId && r.qty && Number(r.qty) > 0);

  const totaleImporto = righeValide.reduce((acc, r) =>
    acc + (Number(r.qty) || 0) * (Number(r.costoUnit) || 0), 0);

  // ── Salva carico su Supabase ────────────────────────────────────────────
  const salvaCarico = async () => {
    if (righeValide.length === 0) return;
    setSaving(true);

    try {
      const forn = fornitori.find(f => f.id === Number(fornitoreId));
      const noteCarico = [forn?.name, numDocumento, note].filter(Boolean).join(" · ");

      for (const riga of righeValide) {
        const prod = prodotti.find(p => p.id === Number(riga.prodottoId));
        if (!prod) continue;

        const qty = Number(riga.qty);
        const stockBefore = prod.current_stock;
        const stockAfter  = stockBefore + qty;

        // 1. INSERT stock_movement
        await supabase.from("stock_movements").insert({
          product_id:    prod.id,
          type:          "load",
          quantity:      qty,
          stock_before:  stockBefore,
          stock_after:   stockAfter,
          unit_cost:     Number(riga.costoUnit) || null,
          notes:         noteCarico || null,
          movement_date: new Date().toISOString(),
        });

        // 2. UPDATE current_stock
        await supabase.from("products")
          .update({ current_stock: stockAfter })
          .eq("id", prod.id);

        // 3. Se c'è scadenza → INSERT batch_lot
        if (riga.scadenza) {
          await supabase.from("batch_lots").insert({
            product_id:    prod.id,
            lot_number:    numDocumento || `DDT-${Date.now()}`,
            quantity:      qty,
            expiry_date:   riga.scadenza,
            purchase_date: dataConsegna,
          });
        }
      }

      // Aggiorna storico e reset form
      await loadData();
      setRighe([rigaVuota()]);
      setNumDoc("");
      setNote("");
      setFornitore("");

      setToast({ prodotti: righeValide.length, importo: totaleImporto.toFixed(2) });
      setTimeout(() => setToast(null), 3500);

    } catch (err) {
      console.error("Errore salvataggio carico:", err);
      alert("Errore durante il salvataggio. Riprova.");
    }

    setSaving(false);
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
            <div><div className="user-name">Magazzino Pro</div><div className="user-role">Responsabile</div></div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="main-content">

        <div className="page-header">
          <div>
            <h1 className="page-title">Carico merce</h1>
            <p className="page-subtitle">Registra l'arrivo di prodotti in magazzino</p>
          </div>
        </div>

        <div className="two-col-layout">

          {/* ── COLONNA SINISTRA: FORM ── */}
          <div>

            {/* Dati documento */}
            <div className="card" style={{ marginBottom: "1rem" }}>
              <div className="card-header">
                <div className="card-header-icon icon-gold">📋</div>
                <div>
                  <div className="card-title">Dati documento</div>
                  <div className="card-subtitle">Fornitore e riferimento consegna</div>
                </div>
              </div>
              <div className="card-body">
                <div className="two-col">
                  <div className="field">
                    <label>Fornitore</label>
                    <select value={fornitoreId} onChange={e => setFornitore(e.target.value)}>
                      <option value="">Seleziona fornitore...</option>
                      {fornitori.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Data consegna</label>
                    <input type="date" value={dataConsegna} onChange={e => setData(e.target.value)} />
                  </div>
                </div>
                <div className="two-col">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>N° documento / DDT</label>
                    <input type="text" placeholder="Es. DDT-2024-0042" value={numDocumento}
                      onChange={e => setNumDoc(e.target.value)} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Note</label>
                    <input type="text" placeholder="Note opzionali..." value={note}
                      onChange={e => setNote(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            {/* Prodotti da caricare */}
            <div className="card">
              <div className="card-header">
                <div className="card-header-icon icon-green">📦</div>
                <div>
                  <div className="card-title">Prodotti in arrivo</div>
                  <div className="card-subtitle">Aggiungi uno o più prodotti ricevuti</div>
                </div>
              </div>
              <div className="card-body">

                <div className="righe-header">
                  <span className="col-label">Prodotto</span>
                  <span className="col-label">Quantità</span>
                  <span className="col-label">Costo/unità</span>
                  <span className="col-label">Scadenza</span>
                  <span></span>
                </div>

                {righe.map((riga) => {
                  const prod = prodotti.find(p => p.id === Number(riga.prodottoId));
                  return (
                    <div className="riga" key={riga.id}>

                      <select value={riga.prodottoId}
                        onChange={e => aggiornaRiga(riga.id, "prodottoId", e.target.value)}>
                        <option value="">Scegli prodotto...</option>
                        {prodotti.map(p => {
                          const emoji = p.categories?.color?.split("|")[1] || "📦";
                          return <option key={p.id} value={p.id}>{emoji} {p.name}</option>;
                        })}
                      </select>

                      <div style={{ position: "relative" }}>
                        <input type="number" min="0" step="0.1" placeholder="0"
                          value={riga.qty}
                          onChange={e => aggiornaRiga(riga.id, "qty", e.target.value)}
                          style={{ paddingRight: prod ? "36px" : "10px" }} />
                        {prod && (
                          <span style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", fontSize: "10px", color: "rgba(240,230,208,0.3)", pointerEvents: "none" }}>
                            {prod.unit}
                          </span>
                        )}
                      </div>

                      <div style={{ position: "relative" }}>
                        <input type="number" min="0" step="0.01" placeholder="0.00"
                          value={riga.costoUnit}
                          onChange={e => aggiornaRiga(riga.id, "costoUnit", e.target.value)}
                          style={{ paddingRight: "24px" }} />
                        <span style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", fontSize: "10px", color: "rgba(240,230,208,0.3)", pointerEvents: "none" }}>€</span>
                      </div>

                      <input type="date" value={riga.scadenza}
                        onChange={e => aggiornaRiga(riga.id, "scadenza", e.target.value)} />

                      <button className="btn-remove-riga" onClick={() => rimuoviRiga(riga.id)}>×</button>
                    </div>
                  );
                })}

                <button className="btn-add-riga" onClick={aggiungiRiga}>
                  + Aggiungi prodotto
                </button>
              </div>
            </div>
          </div>

          {/* ── COLONNA DESTRA: RIEPILOGO + STORICO ── */}
          <div className="riepilogo">

            <div className="card" style={{ marginBottom: "1rem" }}>
              <div className="card-header">
                <div className="card-header-icon icon-gold">📊</div>
                <div>
                  <div className="card-title">Riepilogo carico</div>
                  <div className="card-subtitle">Prodotti selezionati</div>
                </div>
              </div>

              {righeValide.length === 0 ? (
                <div className="riepilogo-empty">Aggiungi prodotti al carico</div>
              ) : (
                <div className="riepilogo-list">
                  {righeValide.map(r => {
                    const prod = prodotti.find(p => p.id === Number(r.prodottoId));
                    const emoji = prod?.categories?.color?.split("|")[1] || "📦";
                    return (
                      <div className="riepilogo-riga" key={r.id}>
                        <span className="riepilogo-nome">{emoji} {prod?.name}</span>
                        <span className="riepilogo-qty">+{r.qty} {prod?.unit}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="totale-section">
                <div className="totale-row">
                  <span className="totale-label">Prodotti</span>
                  <span className="totale-val">{righeValide.length} voci</span>
                </div>
                <div className="totale-row big">
                  <span className="totale-label">Totale importo</span>
                  <span className="totale-val">€ {totaleImporto.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ padding: "0 1.4rem 1.4rem" }}>
                <div className="actions-row">
                  <button className="btn-secondary"
                    onClick={() => { setRighe([rigaVuota()]); setNumDoc(""); setNote(""); }}>
                    Azzera
                  </button>
                  <button className="btn-primary"
                    disabled={righeValide.length === 0 || saving}
                    onClick={salvaCarico}>
                    {saving ? "Salvataggio..." : "📦 Registra carico"}
                  </button>
                </div>
              </div>
            </div>

            {/* Storico carichi recenti */}
            <div className="card">
              <div className="card-header">
                <div className="card-header-icon icon-blue">🕐</div>
                <div>
                  <div className="card-title">Carichi recenti</div>
                  <div className="card-subtitle">Ultimi movimenti registrati</div>
                </div>
              </div>
              <div>
                {storico.length === 0 && (
                  <p style={{ padding: "1rem", color: "#888" }}>Nessun carico ancora registrato</p>
                )}
                {storico.map(s => (
                  <div className="storico-item" key={s.id}>
                    <div className="storico-dot" />
                    <div className="storico-info">
                      <div className="storico-prodotto">{s.prodotto}</div>
                      <div className="storico-meta">{s.fornitore} · {s.ora}</div>
                    </div>
                    <div className="storico-qty">+{s.qty} {s.unita}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* TOAST */}
      {toast && (
        <div className="toast">
          <span className="toast-icon">✅</span>
          <div>
            <div className="toast-text">Carico registrato con successo!</div>
            <div className="toast-sub">{toast.prodotti} prodotti · € {toast.importo}</div>
          </div>
        </div>
      )}

    </div>
  );
}