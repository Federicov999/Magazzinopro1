"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import "./login.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      window.location.href = "/dashboard";
    } catch (err) {
      setError("Email o password non corretti.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-root">

      {/* PANNELLO SINISTRO */}
      <div className="left-panel">
        <div className="grid-overlay" />
        <div className="big-number">MAG</div>
        <div className="left-content">
          <div className="brand-badge">Magazzino Pro</div>
          <h1 className="left-title">
            Il tuo ristorante,<br />
            sotto <span>controllo</span>.
          </h1>
          <p className="left-desc">
            Gestisci scorte, movimenti e ordini ai fornitori in un unico posto.
            Sempre aggiornato, da qualsiasi dispositivo.
          </p>
          <div className="stats-row">
            <div className="stat-item">
              <span className="stat-num">∞</span>
              <span className="stat-label">Prodotti</span>
            </div>
            <div className="stat-item">
              <span className="stat-num">0€</span>
              <span className="stat-label">Sprechi tracciati</span>
            </div>
            <div className="stat-item">
              <span className="stat-num">24/7</span>
              <span className="stat-label">Accesso</span>
            </div>
          </div>
        </div>
      </div>

      {/* PANNELLO DESTRO — FORM */}
      <div className="right-panel">
        <div className="form-card">
          <div className="form-logo">
            <div className="logo-icon">🍽</div>
            <div>
              <div className="logo-text">Magazzino Pro</div>
              <span className="logo-sub">Gestionale Ristorante</span>
            </div>
          </div>

          <h2 className="form-heading">Bentornato</h2>
          <p className="form-subheading">Accedi al pannello di gestione</p>

          <form onSubmit={handleLogin}>
            <div className="field">
              <label>Email</label>
              <div className="input-wrap">
                <input
                  type="email"
                  placeholder="mario@ristorante.it"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="field">
              <label>Password</label>
              <div className="input-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: "40px" }}
                />
                <button
                  type="button"
                  className="toggle-pw"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            <a className="forgot-link">Password dimenticata?</a>

            {error && <div className="error-msg">⚠ {error}</div>}

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading && <span className="spinner" />}
              {loading ? "Accesso in corso…" : "Accedi"}
            </button>
          </form>

          <div className="divider"><span>VERSIONE</span></div>
          <p className="footer-note">Magazzino Pro v1.0 · Solo per personale autorizzato</p>
        </div>
      </div>
    </div>
  );
}