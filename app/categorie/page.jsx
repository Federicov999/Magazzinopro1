"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import "./categorie.css";

const EMOJIS = ["🥩","🥦","🍷","🧀","🌾","🫙","🐟","🍰","🍗","🥚","🧅","🍅","🍋","🧄","🫒","🥐"];
const COLORI = ["#e05555","#60c878","#6090e0","#e0c040","#c8923a","#a060e0","#40c0e0","#e080a0","#e09040","#50d0b0"];

const MODAL_VUOTO = { nome: "", emoji: "🥩", colore: "#c8923a" };

export default function CategoriePage() {
  const [categorie, setCategorie]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [ricerca, setRicerca]         = useState("");
  const [mostraModal, setMostraModal] = useState(false);
  const [modalDati, setModalDati]     = useState(MODAL_VUOTO);
  const [modificaId, setModificaId]   = useState(null);
  const [saving, setSaving]           = useState(false);
  const [activeNav, setActiveNav]     = useState("categorie");

  useEffect(() => { loadCategorie(); }, []);

  async function loadCategorie() {
    setLoading(true);
    const { data: cats } = await supabase
      .from("categories")
      .select("*, products(id)")
      .order("name");

    if (cats) {
      setCategorie(cats.map(c => ({
        id:       c.id,
        nome:     c.name,
        emoji:    c.color?.split("|")[1] || "📦",
        colore:   c.color?.split("|")[0] || "#c8923a",
        prodotti: c.products?.length || 0,
      })));
    }
    setLoading(false);
  }

  const categoriFiltrate = categorie.filter(c =>
    c.nome.toLowerCase().includes(ricerca.toLowerCase())
  );

  const apriNuova = () => {
    setModalDati(MODAL_VUOTO);
    setModificaId(null);
    setMostraModal(true);
  };

  const apriModifica = (cat) => {
    setModalDati({ nome: cat.nome, emoji: cat.emoji, colore: cat.colore });
    setModificaId(cat.id);
    setMostraModal(true);
  };

  const salva = async () => {
    if (!modalDati.nome.trim()) return;
    setSaving(true);

    const colorValue = `${modalDati.colore}|${modalDati.emoji}`;

    if (modificaId === null) {
      await supabase.from("categories").insert({
        name:  modalDati.nome.trim(),
        color: colorValue,
      });
    } else {
      await supabase.from("categories").update({
        name:  modalDati.nome.trim(),
        color: colorValue,
      }).eq("id", modificaId);
    }

    await loadCategorie();
    setSaving(false);
    setMostraModal(false);
  };

  const elimina = async (id) => {
    if (!confirm("Sei sicuro di voler eliminare questa categoria?")) return;
    await supabase.from("categories").delete().eq("id", id);
    await loadCategorie();
  };

  return (
    <div className="page-root">

      {/* SIDEBAR */}
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
            <div>
              <div className="user-name">Magazzino Pro</div>
              <div className="user-role">Responsabile</div>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="main-content">

        <div className="page-header">
          <div>
            <h1 className="page-title">Categorie</h1>
            <p className="page-subtitle">{categorie.length} categorie totali</p>
          </div>
          <button className="btn-primary" onClick={apriNuova}>
            + Nuova categoria
          </button>
        </div>

        <div className="toolbar">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              placeholder="Cerca categoria..."
              value={ricerca}
              onChange={e => setRicerca(e.target.value)}
            />
          </div>
          <span className="total-badge">{categoriFiltrate.length} risultati</span>
        </div>

        {loading ? (
          <p style={{ padding: "2rem", color: "#888" }}>Caricamento categorie...</p>
        ) : categoriFiltrate.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🏷</div>
            <div className="empty-text">Nessuna categoria trovata</div>
          </div>
        ) : (
          <div className="categories-grid">
            {categoriFiltrate.map(cat => (
              <div className="category-card" key={cat.id}
                style={{ borderColor: `${cat.colore}22` }}>
                <div style={{
                  position: "absolute", top: 0, left: 0,
                  width: "3px", height: "100%",
                  background: cat.colore,
                  borderRadius: "12px 0 0 12px"
                }} />
                <div className="card-top">
                  <div className="card-emoji" style={{ background: `${cat.colore}18` }}>
                    {cat.emoji}
                  </div>
                  <div className="card-actions">
                    <button className="action-btn btn-edit" onClick={() => apriModifica(cat)}>✏️</button>
                    <button className="action-btn btn-delete" onClick={() => elimina(cat.id)}>🗑</button>
                  </div>
                </div>
                <div className="card-name">{cat.nome}</div>
                <div className="card-count">
                  <span className="card-color-dot" style={{ background: cat.colore }} />
                  {cat.prodotti} prodotti collegati
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* MODALE */}
      {mostraModal && (
        <div className="modal-overlay" onClick={() => setMostraModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">
              {modificaId === null ? "Nuova categoria" : "Modifica categoria"}
            </h2>

            <div className="field">
              <label>Nome categoria</label>
              <input type="text" placeholder="Es. Carni, Verdure, Bevande..."
                value={modalDati.nome}
                onChange={e => setModalDati(p => ({ ...p, nome: e.target.value }))}
                autoFocus />
            </div>

            <div className="field">
              <label>Icona</label>
              <div className="emoji-grid">
                {EMOJIS.map(em => (
                  <button key={em}
                    className={`emoji-btn ${modalDati.emoji === em ? "selected" : ""}`}
                    onClick={() => setModalDati(p => ({ ...p, emoji: em }))}>
                    {em}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Colore</label>
              <div className="color-grid">
                {COLORI.map(col => (
                  <button key={col}
                    className={`color-btn ${modalDati.colore === col ? "selected" : ""}`}
                    style={{ background: col }}
                    onClick={() => setModalDati(p => ({ ...p, colore: col }))} />
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setMostraModal(false)}>
                Annulla
              </button>
              <button className="btn-save" disabled={saving} onClick={salva}>
                {saving ? "Salvataggio..." : modificaId === null ? "Crea categoria" : "Salva modifiche"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}