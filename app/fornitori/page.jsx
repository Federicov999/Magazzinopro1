"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import "./fornitori.css";

const MODAL_VUOTO = { nome: "", contatto: "", telefono: "", email: "", note: "", attivo: true };

export default function FornitoriPage() {
  const [fornitori, setFornitori]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [ricerca, setRicerca]         = useState("");
  const [soloAttivi, setSoloAttivi]   = useState(false);
  const [mostraModal, setMostraModal] = useState(false);
  const [modalDati, setModalDati]     = useState(MODAL_VUOTO);
  const [modificaId, setModificaId]   = useState(null);
  const [saving, setSaving]           = useState(false);
  const [activeNav, setActiveNav]     = useState("fornitori");

  useEffect(() => { loadFornitori(); }, []);

  async function loadFornitori() {
    setLoading(true);
    const { data } = await supabase
      .from("suppliers")
      .select("*")
      .order("name");

    if (data) {
      setFornitori(data.map(f => ({
        id:       f.id,
        nome:     f.name,
        contatto: f.contact_name || "",
        telefono: f.phone || "",
        email:    f.email || "",
        note:     f.notes || "",
        attivo:   f.active,
      })));
    }
    setLoading(false);
  }

  const fornitoriFiltrati = fornitori.filter(f => {
    const matchRicerca =
      f.nome.toLowerCase().includes(ricerca.toLowerCase()) ||
      f.contatto.toLowerCase().includes(ricerca.toLowerCase()) ||
      f.email.toLowerCase().includes(ricerca.toLowerCase());
    const matchAttivo = soloAttivi ? f.attivo : true;
    return matchRicerca && matchAttivo;
  });

  const apriNuovo = () => {
    setModalDati(MODAL_VUOTO);
    setModificaId(null);
    setMostraModal(true);
  };

  const apriModifica = (f) => {
    setModalDati({ nome: f.nome, contatto: f.contatto, telefono: f.telefono, email: f.email, note: f.note, attivo: f.attivo });
    setModificaId(f.id);
    setMostraModal(true);
  };

  const salva = async () => {
    if (!modalDati.nome.trim()) return;
    setSaving(true);

    const payload = {
      name:         modalDati.nome.trim(),
      contact_name: modalDati.contatto || null,
      phone:        modalDati.telefono || null,
      email:        modalDati.email || null,
      notes:        modalDati.note || null,
      active:       modalDati.attivo,
    };

    if (modificaId === null) {
      await supabase.from("suppliers").insert(payload);
    } else {
      await supabase.from("suppliers").update(payload).eq("id", modificaId);
    }

    await loadFornitori();
    setSaving(false);
    setMostraModal(false);
  };

  const elimina = async (id) => {
    if (!confirm("Eliminare questo fornitore?")) return;
    await supabase.from("suppliers").delete().eq("id", id);
    await loadFornitori();
  };

  const iniziali = (nome) => nome.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

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
            <h1 className="page-title">Fornitori</h1>
            <p className="page-subtitle">
              {fornitori.filter(f => f.attivo).length} attivi · {fornitori.filter(f => !f.attivo).length} inattivi
            </p>
          </div>
          <button className="btn-primary" onClick={apriNuovo}>+ Nuovo fornitore</button>
        </div>

        <div className="toolbar">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input className="search-input"
              placeholder="Cerca per nome, contatto, email..."
              value={ricerca}
              onChange={e => setRicerca(e.target.value)} />
          </div>
          <button className={`filter-btn ${soloAttivi ? "active" : ""}`}
            onClick={() => setSoloAttivi(p => !p)}>
            ✓ Solo attivi
          </button>
          <span className="total-badge">{fornitoriFiltrati.length} risultati</span>
        </div>

        <div className="table-wrap">
          <div className="table-head">
            <span className="th">Fornitore</span>
            <span className="th col-phone">Telefono</span>
            <span className="th col-email">Email</span>
            <span className="th">Note</span>
            <span className="th col-stato">Stato</span>
            <span className="th"></span>
          </div>

          {loading ? (
            <p style={{ padding: "2rem", color: "#888" }}>Caricamento fornitori...</p>
          ) : fornitoriFiltrati.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🚚</div>
              <div className="empty-text">Nessun fornitore trovato</div>
            </div>
          ) : (
            fornitoriFiltrati.map(f => (
              <div className="table-row" key={f.id}>
                <div className="fornitore-info">
                  <div className="fornitore-avatar">{iniziali(f.nome)}</div>
                  <div>
                    <div className="fornitore-nome">{f.nome}</div>
                    <div className="fornitore-contatto">{f.contatto || "—"}</div>
                  </div>
                </div>
                <div className="td-text col-phone">{f.telefono || "—"}</div>
                <div className="td-text col-email">
                  {f.email ? <a href={`mailto:${f.email}`}>{f.email}</a> : "—"}
                </div>
                <div className="td-text" style={{ fontSize: "11px", color: "rgba(240,230,208,0.3)" }}>
                  {f.note ? f.note.slice(0, 28) + (f.note.length > 28 ? "…" : "") : "—"}
                </div>
                <div className="col-stato">
                  <span className={`status-badge ${f.attivo ? "status-active" : "status-inactive"}`}>
                    {f.attivo ? "● Attivo" : "● Inattivo"}
                  </span>
                </div>
                <div className="row-actions">
                  <button className="action-btn btn-edit" onClick={() => apriModifica(f)}>✏️</button>
                  <button className="action-btn btn-delete" onClick={() => elimina(f.id)}>🗑</button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* MODALE */}
      {mostraModal && (
        <div className="modal-overlay" onClick={() => setMostraModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">
              {modificaId === null ? "Nuovo fornitore" : "Modifica fornitore"}
            </h2>

            <div className="field">
              <label>Nome azienda *</label>
              <input type="text" placeholder="Es. Macelleria Rossi"
                value={modalDati.nome}
                onChange={e => setModalDati(p => ({ ...p, nome: e.target.value }))}
                autoFocus />
            </div>

            <div className="field">
              <label>Persona di contatto</label>
              <input type="text" placeholder="Es. Giovanni Rossi"
                value={modalDati.contatto}
                onChange={e => setModalDati(p => ({ ...p, contatto: e.target.value }))} />
            </div>

            <div className="two-col-fields">
              <div className="field">
                <label>Telefono</label>
                <input type="tel" placeholder="02 1234567"
                  value={modalDati.telefono}
                  onChange={e => setModalDati(p => ({ ...p, telefono: e.target.value }))} />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" placeholder="info@fornitore.it"
                  value={modalDati.email}
                  onChange={e => setModalDati(p => ({ ...p, email: e.target.value }))} />
              </div>
            </div>

            <div className="field">
              <label>Note</label>
              <textarea rows={3}
                placeholder="Es. Consegna martedì e venerdì, minimo ordine 10 kg..."
                value={modalDati.note}
                onChange={e => setModalDati(p => ({ ...p, note: e.target.value }))} />
            </div>

            <div className="field">
              <label>Stato</label>
              <div className="toggle-field">
                <span className="toggle-label">
                  {modalDati.attivo ? "Fornitore attivo" : "Fornitore inattivo"}
                </span>
                <button className={`toggle ${modalDati.attivo ? "on" : "off"}`}
                  onClick={() => setModalDati(p => ({ ...p, attivo: !p.attivo }))} />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setMostraModal(false)}>Annulla</button>
              <button className="btn-save" disabled={saving} onClick={salva}>
                {saving ? "Salvataggio..." : modificaId === null ? "Crea fornitore" : "Salva modifiche"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}