"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import styles from "./report-valore.module.css"

export default function ReportValore() {
  const [prodotti, setProdotti] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroCategoria, setFiltroCategoria] = useState("tutte")
  const [ordinaPer, setOrdinaPer] = useState("valore_desc")
  const [categorie, setCategorie] = useState([])

  useEffect(() => {
    caricaDati()
  }, [])

  async function caricaDati() {
    setLoading(true)
    const { data, error } = await supabase
      .from("products")
      .select("*, categories(id, name, color), suppliers(id, name)")
      .eq("active", true)

    if (!error && data) {
      setProdotti(data)
      // Estrai categorie uniche
      const cats = []
      const seen = new Set()
      data.forEach(p => {
        if (p.categories && !seen.has(p.categories.id)) {
          seen.add(p.categories.id)
          cats.push(p.categories)
        }
      })
      setCategorie(cats)
    }
    setLoading(false)
  }

  // Calcolo valore per prodotto
  const prodottiConValore = prodotti.map(p => ({
    ...p,
    valore_totale: (p.current_stock || 0) * (p.cost_per_unit || 0),
  }))

  // Filtro categoria
  const prodottiFiltrati = filtroCategoria === "tutte"
    ? prodottiConValore
    : prodottiConValore.filter(p => p.categories?.id === filtroCategoria)

  // Ordinamento
  const prodottiOrdinati = [...prodottiFiltrati].sort((a, b) => {
    if (ordinaPer === "valore_desc") return b.valore_totale - a.valore_totale
    if (ordinaPer === "valore_asc") return a.valore_totale - b.valore_totale
    if (ordinaPer === "nome_asc") return a.name.localeCompare(b.name)
    if (ordinaPer === "stock_desc") return b.current_stock - a.current_stock
    return 0
  })

  // KPI globali
  const valoreTotale = prodottiConValore.reduce((s, p) => s + p.valore_totale, 0)
  const numProdotti = prodottiConValore.length
  const prodottiSottoscorta = prodottiConValore.filter(p => p.current_stock <= p.min_stock).length
  const costoMedioUnitario = numProdotti > 0
    ? prodottiConValore.reduce((s, p) => s + (p.cost_per_unit || 0), 0) / numProdotti
    : 0

  // Valore per categoria (per il grafico a barre)
  const valorePerCategoria = categorie.map(cat => {
    const prodCat = prodottiConValore.filter(p => p.categories?.id === cat.id)
    const valore = prodCat.reduce((s, p) => s + p.valore_totale, 0)
    const colore = cat.color?.split("|")[0] || "#888"
    const emoji = cat.color?.split("|")[1] || "📦"
    return { ...cat, valore, colore, emoji, numProdotti: prodCat.length }
  }).sort((a, b) => b.valore - a.valore)

  const maxValore = valorePerCategoria[0]?.valore || 1

  function formatEuro(val) {
    return "€ " + val.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  }

  function getColoreCategoria(prodotto) {
    return prodotto.categories?.color?.split("|")[0] || "#ccc"
  }

  function getEmojiCategoria(prodotto) {
    return prodotto.categories?.color?.split("|")[1] || "📦"
  }

  function getUrgenzaClass(prodotto) {
    if (prodotto.current_stock === 0) return styles.esaurito
    if (prodotto.current_stock <= prodotto.min_stock) return styles.critico
    return ""
  }

  if (loading) return <div className={styles.loading}>Caricamento...</div>

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.titolo}>💰 Valore Magazzino</h1>
        <p className={styles.sottotitolo}>Panoramica del valore economico delle scorte</p>
      </div>

      {/* KPI Cards */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiEmoji}>💰</span>
          <div className={styles.kpiValore}>{formatEuro(valoreTotale)}</div>
          <div className={styles.kpiLabel}>Valore totale magazzino</div>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiEmoji}>📦</span>
          <div className={styles.kpiValore}>{numProdotti}</div>
          <div className={styles.kpiLabel}>Prodotti attivi</div>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiEmoji}>📊</span>
          <div className={styles.kpiValore}>{formatEuro(costoMedioUnitario)}</div>
          <div className={styles.kpiLabel}>Costo medio unitario</div>
        </div>
        <div className={`${styles.kpiCard} ${prodottiSottoscorta > 0 ? styles.kpiAllerta : ""}`}>
          <span className={styles.kpiEmoji}>⚠️</span>
          <div className={styles.kpiValore}>{prodottiSottoscorta}</div>
          <div className={styles.kpiLabel}>Prodotti sottoscorta</div>
        </div>
      </div>

      {/* Grafico per categoria */}
      <div className={styles.sezione}>
        <h2 className={styles.sezioneTitolo}>📊 Distribuzione per categoria</h2>
        <div className={styles.graficoCat}>
          {valorePerCategoria.map(cat => (
            <div key={cat.id} className={styles.rigaCategoria}>
              <div className={styles.catLabel}>
                <span>{cat.emoji}</span>
                <span className={styles.catNome}>{cat.name}</span>
                <span className={styles.catNum}>({cat.numProdotti} prod.)</span>
              </div>
              <div className={styles.barraContainer}>
                <div
                  className={styles.barra}
                  style={{
                    width: `${(cat.valore / maxValore) * 100}%`,
                    backgroundColor: cat.colore,
                  }}
                />
              </div>
              <div className={styles.catValore}>{formatEuro(cat.valore)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtri e tabella */}
      <div className={styles.sezione}>
        <div className={styles.filtriRow}>
          <h2 className={styles.sezioneTitolo}>🗂 Dettaglio prodotti</h2>
          <div className={styles.filtri}>
            <select
              className={styles.select}
              value={filtroCategoria}
              onChange={e => setFiltroCategoria(e.target.value)}
            >
              <option value="tutte">Tutte le categorie</option>
              {categorie.map(c => (
                <option key={c.id} value={c.id}>
                  {c.color?.split("|")[1]} {c.name}
                </option>
              ))}
            </select>
            <select
              className={styles.select}
              value={ordinaPer}
              onChange={e => setOrdinaPer(e.target.value)}
            >
              <option value="valore_desc">Valore ↓</option>
              <option value="valore_asc">Valore ↑</option>
              <option value="nome_asc">Nome A→Z</option>
              <option value="stock_desc">Scorta ↓</option>
            </select>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.tabella}>
            <thead>
              <tr>
                <th>Prodotto</th>
                <th>Categoria</th>
                <th>Scorta attuale</th>
                <th>Costo unitario</th>
                <th>Valore totale</th>
                <th>% sul totale</th>
              </tr>
            </thead>
            <tbody>
              {prodottiOrdinati.map(p => {
                const percSuTotale = valoreTotale > 0 ? (p.valore_totale / valoreTotale) * 100 : 0
                return (
                  <tr key={p.id} className={getUrgenzaClass(p)}>
                    <td>
                      <div className={styles.nomeProdotto}>
                        <span>{p.name}</span>
                        {p.current_stock === 0 && <span className={styles.badge}>ESAURITO</span>}
                        {p.current_stock > 0 && p.current_stock <= p.min_stock && (
                          <span className={styles.badgeWarn}>SCORTA BASSA</span>
                        )}
                      </div>
                      {p.sku && <div className={styles.sku}>{p.sku}</div>}
                    </td>
                    <td>
                      <span
                        className={styles.tagCategoria}
                        style={{ backgroundColor: getColoreCategoria(p) + "22", color: getColoreCategoria(p) }}
                      >
                        {getEmojiCategoria(p)} {p.categories?.name}
                      </span>
                    </td>
                    <td className={styles.centrato}>
                      {p.current_stock} {p.unit}
                    </td>
                    <td className={styles.centrato}>
                      {p.cost_per_unit ? formatEuro(p.cost_per_unit) : "—"}
                    </td>
                    <td className={`${styles.centrato} ${styles.valoreCella}`}>
                      {formatEuro(p.valore_totale)}
                    </td>
                    <td className={styles.centrato}>
                      <div className={styles.percWrapper}>
                        <div
                          className={styles.percBarra}
                          style={{
                            width: `${Math.min(percSuTotale, 100)}%`,
                            backgroundColor: getColoreCategoria(p),
                          }}
                        />
                        <span className={styles.percTesto}>{percSuTotale.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className={styles.totaleRow}>
                <td colSpan={4}><strong>TOTALE</strong></td>
                <td className={styles.centrato}><strong>{formatEuro(valoreTotale)}</strong></td>
                <td className={styles.centrato}><strong>100%</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}