"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import "./prodotti.css";

const UNITA = ["kg", "g", "lt", "ml", "pz", "bottiglie", "vaschette", "sacchi", "scatole"];

const MODAL_VUOTO = {
  nome: "", sku: "", categoriaId: "", fornitoreId: "",
  unita: "kg", scorta: "", soglia: "", scorta_ideale: "",
  costo: "", traccia_scadenza: false, attivo: true,
};

function getStockStatus(scorta, soglia) {
  const pct = soglia > 0 ? (scorta / soglia) * 100 : 100;
  if (scorta === 0)  return { label: "Esaurito", cls: "danger",  barCls: "bar-danger",  textCls: "text-danger"  };
  if (pct <= 50)     return { label: "Critico",  cls: "danger",  barCls: "bar-danger",  textCls: "text-danger"  };
  if (pct <= 100)    return { label: "Basso",    cls: "warning", barCls: "bar-warning", textCls: "text-warning" };
  return              { label: "OK",       cls: "ok",      barCls: "bar-ok",      textCls: "text-ok"      };
}

export default function ProdottiPage() {
  const [prodotti, setProdotti]           = useState([]);
  const [categorie, setCategorie]         = useState([]);
  const [fornitori, setFornitori]         = useState([]);
  const [loading, setLoading]             = useState(true);
  const [ricerca, setRicerca]             = useState("");
  const [filtroCat, setFiltroCat]         = useState("");
  const [soloSottosoglia, setSottosoglia] = useState(false);
  const [mostraModal, setMostraModal]     = useState(false);
  const [modalDati, setModalDati]         = useState(MODAL_VUOTO);
  const [modificaId, setModificaId]       = useState(null);
  const [saving, setSaving]               = useState(false);
  const [activeNav, setActiveNav]         = useState("prodotti");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);

    const [{ data: prods }, { data: cats }, { data: forns }] = await Promise.all([
      supabase.from("products").select("*, categories(id, name, color), suppliers(id, name)").eq("active", true).order("name"),
      supabase.from("categories").select("id, name, color").order("name"),
      supabase.from("suppliers").select("id, name").eq("active", true).order("name"),
    ]);

    if (prods) setProdotti(prods.map(p => ({
      id:               p.id,
      nome:             p.name,
      sku:              p.sku || "",
      categoriaId:      p.category_id,
      fornitoreId:      p.supplier_id,
      unita:            p.unit || "kg",
      scorta:           p.current_stock || 0,
      soglia:           p.min_stock || 0,
      scorta_ideale:    p.ideal_stock || 0,
      costo:            p.cost_per_unit || 0,
      traccia_scadenza: p.expiry_tracking || false,
      attivo:           p.active,
      cat:              p.categories,
      forn:             p.suppliers,
    })));

    if (cats) setCategorie(cats.map(c => ({
      id:     c.id,
      nome:   c.name,
      emoji:  c.color?.split("|")[1] || "📦",
      colore: c.color?.split("|")[0] || "#c8923a",
    })));

    if (forns) setFornitori(forns);

    setLoading(false);
  }

  const prodottiFiltrati = prodotti.filter(p => {
    const matchRicerca = p.nome.toLowerCase().includes(ricerca.toLowerCase()) || p.sku.toLowerCase().includes(ricerca.toLowerCase());
    const matchCat     = filtroCat ? p.categoriaId === Number(filtroCat) : true;
    const matchSoglia  = soloSottosoglia ? p.scorta <= p.soglia : true;
    return matchRicerca && matchCat && matchSoglia;
  });

  const apriNuovo = () => { setModalDati(MODAL_VUOTO); setModificaId(null); setMostraModal(true); };

  const apriModifica = (p) => {
    setModalDati({
      nome: p.nome, sku: p.sku,
      categoriaId: p.categoriaId, fornitoreId: p.fornitoreId || "",
      unita: p.unita, scorta: p.scorta, soglia: p.soglia,
      scorta_ideale: p.scorta_ideale, costo: p.costo,
      traccia_scadenza: p.traccia_scadenza, attivo: p.attivo,
    });
    setModificaId(p.id);
    setMostraModal(true);
  };

  const salva = async () => {
    if (!modalDati.nome.trim() || !modalDati.categoriaId) return;
    setSaving(true);

    const payload = {
      name:            modalDati.nome.trim(),
      sku:             modalDati.sku || null,
      category_id:     Number(modalDati.categoriaId),
      supplier_id:     modalDati.fornitoreId ? Number(modalDati.fornitoreId) : null,
      unit:            modalDati.unita,
      current_stock:   Number(modalDati.scorta) || 0,
      min_stock:       Number(modalDati.soglia) || 0,
      ideal_stock:     Number(modalDati.scorta_ideale) || 0,
      cost_per_unit:   Number(modalDati.costo) || 0,
      expiry_tracking: modalDati.traccia_scadenza,
      active:          modalDati.attivo,
    };

    if (modificaId === null) {
      await supabase.from("products").insert(payload);
    } else {
      await supabase.from("products").update(payload).eq("id", modificaId);
    }

    await loadAll();
    setSaving(false);
    setMostraModal(false);
  };

  const elimina = async (id) => {
    if (!confirm("Eliminare questo prodotto?")) return;
    await supabase.from("products").update({ active: false }).eq("id", id);
    await loadAll();
  };

  const getCat = (id) => categorie.find(c => c.id === id);

  return (
    <div className="page-root">

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">🍽</div>
          <div><div className="logo-text">Magazzino Pro</div><span className="logo-sub">Gestionale</span></div>
        </div>
        <span className="nav-section-label">Principale</span>
        {[{id:"dashboard",icon:"📊",label:"Dashboard"},{id:"movimenti",icon:"↕️",label:"Movimenti"},{id:"scorte",icon:"⚠️",label:"Scorte basse"}].map(n=>(
          <div key={n.id} className={`nav-item ${activeNav===n.id?"active":""}`} onClick={()=>setActiveNav(n.id)}>
            <span className="nav-icon">{n.icon}</span>{n.label}
          </div>
        ))}
        <span className="nav-section-label">Anagrafiche</span>
        {[{id:"prodotti",icon:"🥩",label:"Prodotti"},{id:"categorie",icon:"🏷",label:"Categorie"},{id:"fornitori",icon:"🚚",label:"Fornitori"}].map(n=>(
          <div key={n.id} className={`nav-item ${activeNav===n.id?"active":""}`} onClick={()=>setActiveNav(n.id)}>
            <span className="nav-icon">{n.icon}</span>{n.label}
          </div>
        ))}
        <span className="nav-section-label">Ordini</span>
        {[{id:"ordini",icon:"📋",label:"Ordini fornitori"},{id:"report",icon:"📈",label:"Report"}].map(n=>(
          <div key={n.id} className={`nav-item ${activeNav===n.id?"active":""}`} onClick={()=>setActiveNav(n.id)}>
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
            <h1 className="page-title">Prodotti</h1>
            <p className="page-subtitle">
              {prodotti.length} prodotti · {prodotti.filter(p => p.scorta <= p.soglia).length} sotto soglia
            </p>
          </div>
          <button className="btn-primary" onClick={apriNuovo}>+ Nuovo prodotto</button>
        </div>

        <div className="toolbar">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input className="search-input" placeholder="Cerca per nome o codice..."
              value={ricerca} onChange={e => setRicerca(e.target.value)} />
          </div>
          <select className="filter-select" value={filtroCat} onChange={e => setFiltroCat(e.target.value)}>
            <option value="">Tutte le categorie</option>
            {categorie.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>)}
          </select>
          <button className={`filter-btn ${soloSottosoglia ? "active" : ""}`} onClick={() => setSottosoglia(p => !p)}>
            ⚠️ Sotto soglia
          </button>
          <span className="total-badge">{prodottiFiltrati.length} risultati</span>
        </div>

        <div className="table-wrap">
          <div className="table-head">
            <span className="th">Prodotto</span>
            <span className="th col-sku">Codice</span>
            <span className="th col-categoria">Categoria</span>
            <span className="th">Scorta attuale</span>
            <span className="th">Soglia min.</span>
            <span className="th col-fornitore">Fornitore</span>
            <span className="th"></span>
          </div>

          {loading ? (
            <p style={{ padding: "2rem", color: "#888" }}>Caricamento prodotti...</p>
          ) : prodottiFiltrati.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🥩</div>
              <div className="empty-text">Nessun prodotto trovato</div>
            </div>
          ) : prodottiFiltrati.map(p => {
            const cat    = getCat(p.categoriaId);
            const status = getStockStatus(p.scorta, p.soglia);
            const pct    = p.soglia > 0 ? Math.min((p.scorta / p.soglia) * 100, 100) : 100;
            return (
              <div className="table-row" key={p.id}>
                <div className="prodotto-info">
                  <div className="prodotto-emoji" style={{ background: cat ? `${cat.colore}18` : "rgba(200,140,40,0.1)" }}>
                    {cat?.emoji || "📦"}
                  </div>
                  <div>
                    <div className="prodotto-nome">{p.nome}</div>
                    <div className="prodotto-sku">{p.sku}</div>
                  </div>
                </div>
                <div className="td-small col-sku">{p.sku || "—"}</div>
                <div className="td-small col-categoria" style={{ color: cat?.colore || "inherit" }}>
                  {cat ? `${cat.emoji} ${cat.nome}` : "—"}
                </div>
                <div className="stock-cell">
                  <div className="stock-numbers">
                    <span className={`stock-current ${status.textCls}`}>{p.scorta} {p.unita}</span>
                  </div>
                  <div className="stock-bar-bg">
                    <div className={`stock-bar-fill ${status.barCls}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="stock-cell">
                  <span className="td-small">{p.soglia} {p.unita}</span>
                  <span className={`status-badge badge-${status.cls}`}>● {status.label}</span>
                </div>
                <div className="td-small col-fornitore">{p.forn?.name || "—"}</div>
                <div className="row-actions">
                  <button className="action-btn btn-edit" onClick={() => apriModifica(p)}>✏️</button>
                  <button className="action-btn btn-delete" onClick={() => elimina(p.id)}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* MODALE */}
      {mostraModal && (
        <div className="modal-overlay" onClick={() => setMostraModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{modificaId === null ? "Nuovo prodotto" : "Modifica prodotto"}</h2>

            <div className="section-divider">Informazioni base</div>
            <div className="two-col">
              <div className="field">
                <label>Nome prodotto *</label>
                <input type="text" placeholder="Es. Filetto di manzo" value={modalDati.nome}
                  onChange={e => setModalDati(p => ({ ...p, nome: e.target.value }))} autoFocus />
              </div>
              <div className="field">
                <label>Codice (SKU)</label>
                <input type="text" placeholder="Es. CARN-001" value={modalDati.sku}
                  onChange={e => setModalDati(p => ({ ...p, sku: e.target.value }))} />
              </div>
            </div>

            <div className="two-col">
              <div className="field">
                <label>Categoria *</label>
                <select value={modalDati.categoriaId} onChange={e => setModalDati(p => ({ ...p, categoriaId: e.target.value }))}>
                  <option value="">Seleziona...</option>
                  {categorie.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Fornitore</label>
                <select value={modalDati.fornitoreId} onChange={e => setModalDati(p => ({ ...p, fornitoreId: e.target.value }))}>
                  <option value="">Nessuno</option>
                  {fornitori.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            </div>

            <div className="section-divider">Scorte</div>
            <div className="three-col">
              <div className="field">
                <label>Unità misura</label>
                <select value={modalDati.unita} onChange={e => setModalDati(p => ({ ...p, unita: e.target.value }))}>
                  {UNITA.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Scorta attuale</label>
                <div className="input-unit-wrap">
                  <input type="number" min="0" step="0.1" placeholder="0" value={modalDati.scorta}
                    onChange={e => setModalDati(p => ({ ...p, scorta: e.target.value }))} />
                  <span className="input-unit">{modalDati.unita}</span>
                </div>
              </div>
              <div className="field">
                <label>Soglia minima *</label>
                <div className="input-unit-wrap">
                  <input type="number" min="0" step="0.1" placeholder="0" value={modalDati.soglia}
                    onChange={e => setModalDati(p => ({ ...p, soglia: e.target.value }))} />
                  <span className="input-unit">{modalDati.unita}</span>
                </div>
              </div>
            </div>

            <div className="two-col">
              <div className="field">
                <label>Scorta ideale</label>
                <div className="input-unit-wrap">
                  <input type="number" min="0" step="0.1" placeholder="0" value={modalDati.scorta_ideale}
                    onChange={e => setModalDati(p => ({ ...p, scorta_ideale: e.target.value }))} />
                  <span className="input-unit">{modalDati.unita}</span>
                </div>
              </div>
              <div className="field">
                <label>Costo per unità (€)</label>
                <div className="input-unit-wrap">
                  <input type="number" min="0" step="0.01" placeholder="0.00" value={modalDati.costo}
                    onChange={e => setModalDati(p => ({ ...p, costo: e.target.value }))} />
                  <span className="input-unit">€</span>
                </div>
              </div>
            </div>

            <div className="section-divider">Opzioni</div>
            <label className="checkbox-field">
              <input type="checkbox" checked={modalDati.traccia_scadenza}
                onChange={e => setModalDati(p => ({ ...p, traccia_scadenza: e.target.checked }))} />
              <span className="checkbox-label">📅 Traccia data di scadenza per questo prodotto</span>
            </label>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setMostraModal(false)}>Annulla</button>
              <button className="btn-save" disabled={saving} onClick={salva}>
                {saving ? "Salvataggio..." : modificaId === null ? "Crea prodotto" : "Salva modifiche"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}