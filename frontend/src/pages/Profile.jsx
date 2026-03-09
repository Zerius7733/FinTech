import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import TickerBar from '../components/TickerBar.jsx'
import Navbar from '../components/Navbar.jsx'
import AssetInsightsPanel, { getCachedInsight } from '../components/AssetInsightsPanel.jsx'
import { refreshPage } from '../utils/refreshPage.js'
import { convertCurrency, formatCurrency, normalizeCurrencyCode } from '../utils/currency.js'

const API = 'http://localhost:8000'
let DISPLAY_CURRENCY = 'USD'
function setDisplayCurrency(code) {
  DISPLAY_CURRENCY = normalizeCurrencyCode(code || 'USD')
}

// â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function fmt$(n) {
  if (n == null) return '—'
  const converted = convertCurrency(n, 'USD', DISPLAY_CURRENCY)
  return converted == null ? '—' : formatCurrency(converted, DISPLAY_CURRENCY, { maximumFractionDigits: 2 })
}
function fmtSgd(n) {
  if (n == null) return '—'
  const converted = convertCurrency(n, 'SGD', DISPLAY_CURRENCY)
  return converted == null ? '—' : formatCurrency(converted, DISPLAY_CURRENCY, { maximumFractionDigits: 0 })
}
function fmtPct(n) { return n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` }
function initials(name) {
  if (!name) return '??'
  return name.trim().split(/\s+/).map(w => w[0].toUpperCase()).slice(0,2).join('')
}
function gainPct(current, avg) {
  if (!avg || !current) return null
  return ((current - avg) / avg) * 100
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function formatTrendDate(value) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month:'short', day:'numeric' })
}

function buildTrendSeriesFromHistory({ history, periodKey, viewKey, fallbackCurrent }) {
  const fieldMap = {
    combined: 'total_net_worth',
    stocks: 'stocks_value',
    commodities: 'commodities_value',
    crypto: 'crypto_value',
  }
  const rangeMap = {
    '1M': 30,
    '3M': 90,
    '6M': 180,
    '1Y': 365,
    'ALL': Infinity,
  }
  const field = fieldMap[viewKey] ?? fieldMap.combined
  const points = Array.isArray(history)
    ? history
        .map(entry => ({
          date: entry?.date,
          value: Number(entry?.[field] ?? 0),
        }))
        .filter(entry => entry.date && Number.isFinite(entry.value))
    : []

  if (!points.length) {
    return {
      points: [
        { date: null, value: fallbackCurrent },
        { date: null, value: fallbackCurrent },
      ],
      change: 0,
      labels: ['Start', 'Today'],
      latest: fallbackCurrent,
    }
  }

  const pointLimit = rangeMap[periodKey] ?? rangeMap['6M']
  const sliced = Number.isFinite(pointLimit) ? points.slice(-pointLimit) : points
  const first = sliced[0]
  const last = sliced[sliced.length - 1]

  return {
    points: sliced,
    change: last.value - first.value,
    labels: [formatTrendDate(first.date), formatTrendDate(last.date)],
    latest: last.value,
  }
}

function TrendChart({ points = [], tone = 'up', valueLabel = 'Value', comparisons = [] }) {
  const primarySeries = points.length >= 2
    ? points
    : [
        { date: null, value: points[0]?.value ?? 0 },
        { date: null, value: points[0]?.value ?? 0 },
      ]
  const [hoverIndex, setHoverIndex] = useState(primarySeries.length - 1)
  const [isHovered, setIsHovered] = useState(false)
  useEffect(() => {
    setHoverIndex(primarySeries.length - 1)
    setIsHovered(false)
  }, [primarySeries.length, tone, valueLabel])
  const width = 760
  const height = 260
  const padX = 18
  const padY = 18
  const allSeries = [primarySeries, ...comparisons.map(item => item.points)]
  const values = allSeries.flat().map(point => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, 1)
  const lineColor = tone === 'up' ? '#8b5cf6' : '#ef4444'
  const fillTop = tone === 'up' ? 'rgba(167,139,250,0.34)' : 'rgba(248,113,113,0.28)'
  const fillBottom = tone === 'up' ? 'rgba(167,139,250,0.02)' : 'rgba(248,113,113,0.02)'

  const buildChartPoints = inputSeries => inputSeries.map((point, index) => {
    const x = padX + (index / (inputSeries.length - 1)) * (width - padX * 2)
    const y = height - padY - ((point.value - min) / span) * (height - padY * 2)
    return { x, y, value: point.value, date: point.date }
  })
  const chartPoints = buildChartPoints(primarySeries)
  const comparisonLines = comparisons.map(item => ({
    ...item,
    chartPoints: buildChartPoints(item.points),
  }))

  const linePath = chartPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const areaPath = `${linePath} L ${chartPoints[chartPoints.length - 1].x} ${height - padY} L ${chartPoints[0].x} ${height - padY} Z`
  const activePoint = chartPoints[clamp(hoverIndex, 0, chartPoints.length - 1)]
  const dateText = formatTrendDate(activePoint.date) || 'Current'
  const valueText = `${valueLabel}: ${fmt$(activePoint.value)}`
  const tooltipWidth = Math.max(196, Math.min(320, Math.max(dateText.length * 10 + 34, valueText.length * 8.4 + 54)))
  const tooltipHeight = 72
  const prefersLeft = activePoint.x > width * 0.58
  const rawTooltipX = prefersLeft ? activePoint.x - tooltipWidth - 18 : activePoint.x + 18
  const tooltipX = clamp(rawTooltipX, 14, width - tooltipWidth - 12)
  const tooltipY = clamp(activePoint.y - 96, 12, height - tooltipHeight - 10)

  const handlePointerMove = event => {
    const rect = event.currentTarget.getBoundingClientRect()
    const renderedWidth = Math.min(rect.width, rect.height * (width / height))
    const offsetX = (rect.width - renderedWidth) / 2
    const localX = clamp(event.clientX - rect.left - offsetX, 0, renderedWidth)
    const relativeX = (localX / Math.max(renderedWidth, 1)) * width
    const closestIndex = chartPoints.reduce((best, point, index) => (
      Math.abs(point.x - relativeX) < Math.abs(chartPoints[best].x - relativeX) ? index : best
    ), 0)
    setHoverIndex(closestIndex)
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      style={{ display:'block', overflow:'visible' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseMove={event => { setIsHovered(true); handlePointerMove(event) }}
      onMouseLeave={() => { setHoverIndex(chartPoints.length - 1); setIsHovered(false) }}
    >
      <defs>
        <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillTop} />
          <stop offset="100%" stopColor={fillBottom} />
        </linearGradient>
      </defs>
      {[0.2, 0.4, 0.6, 0.8].map(mark => (
        <line
          key={mark}
          x1={padX}
          x2={width - padX}
          y1={padY + (height - padY * 2) * mark}
          y2={padY + (height - padY * 2) * mark}
          stroke="rgba(148,163,184,0.12)"
          strokeWidth="1"
        />
      ))}
      <path d={areaPath} fill="url(#netWorthFill)" />
      {comparisonLines.map(item => (
        <path
          key={item.key}
          d={item.chartPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')}
          fill="none"
          stroke={item.color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="7 7"
          opacity="0.42"
        />
      ))}
      <path d={linePath} fill="none" stroke={lineColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {isHovered && (
        <>
          <line
            x1={activePoint.x}
            x2={activePoint.x}
            y1={padY}
            y2={height - padY}
            stroke="rgba(124,58,237,0.18)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <circle cx={activePoint.x} cy={activePoint.y} r="5.5" fill="#fff" stroke={lineColor} strokeWidth="3" />
          <g transform={`translate(${tooltipX}, ${tooltipY})`}>
            <rect
              width={tooltipWidth}
              height={tooltipHeight}
              rx="14"
              fill="#0f172a"
              stroke="rgba(139,92,246,0.38)"
              strokeWidth="1"
              style={{ filter:'drop-shadow(0 16px 26px rgba(15,23,42,0.28))' }}
            />
            <text x="16" y="24" fill="#ffffff" style={{ fontFamily:'var(--font-display)', fontSize:'13px', fontWeight:700 }}>
              {dateText}
            </text>
            <circle cx="18" cy="48" r="4.5" fill={lineColor} />
            <text x="32" y="52" fill="rgba(241,245,249,0.98)" style={{ fontFamily:'var(--font-body)', fontSize:'12px', fontWeight:600 }}>
              {valueText}
            </text>
          </g>
        </>
      )}
    </svg>
  )
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function toText(value) {
  if (typeof value === 'string') return value.trim()
  if (value == null) return ''
  if (typeof value === 'number') return String(value)
  return ''
}

function startCase(value) {
  return toText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase())
}

function normalizeRiskScore(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return clamp(value, 0, 100)
  const text = toText(value).toLowerCase()
  if (!text) return null
  if (text === 'low' || text === 'conservative') return 0
  if (text === 'moderate' || text === 'medium' || text === 'balanced') return 50
  if (text === 'high' || text === 'aggressive') return 100
  const parsed = Number(text)
  return Number.isFinite(parsed) ? clamp(parsed, 0, 100) : null
}

function riskLabelFromValue(value) {
  const score = normalizeRiskScore(value)
  if (score == null) return ''
  if (score <= 33) return 'Conservative'
  if (score <= 66) return 'Balanced'
  return 'Aggressive'
}

function wrapPdfText(text, maxChars = 86) {
  const words = toText(text).split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines = []
  let current = words[0]
  for (let i = 1; i < words.length; i += 1) {
    const next = `${current} ${words[i]}`
    if (next.length <= maxChars) current = next
    else {
      lines.push(current)
      current = words[i]
    }
  }
  lines.push(current)
  return lines
}

function escapePdfText(text) {
  return toText(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function fmtCompactCurrency(n) {
  if (n == null) return '—'
  const converted = convertCurrency(n, 'USD', DISPLAY_CURRENCY)
  if (converted == null) return '—'
  return formatCurrency(converted, DISPLAY_CURRENCY, {
    notation:'compact',
    maximumFractionDigits:1,
  })
}

function retirementStatus(plan) {
  if (!plan) return { title:'Building your retirement path', tone:'var(--blue)' }
  const gap = Number(plan.projected_gap_at_retirement || 0)
  if (gap <= 0) return { title:'On track for retirement', tone:'var(--green)' }
  if (gap <= plan.target_retirement_fund * 0.15) return { title:'Within reach with a small top-up', tone:'var(--gold)' }
  return { title:'A savings gap still needs closing', tone:'var(--red)' }
}

function retirementTopMix(plan) {
  const top = toArray(plan?.recommended_vehicle_mix)
    .slice()
    .sort((a, b) => Number(b.target_weight || 0) - Number(a.target_weight || 0))
    .slice(0, 2)
  if (!top.length) return 'No allocation guidance available yet.'
  return top.map(item => `${startCase(item.vehicle)} ${Math.round(Number(item.target_weight || 0))}%`).join(' · ')
}

function parseApiError(detail, fallback) {
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const text = detail
      .map(item => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : ''
          const message = toText(item.msg)
          return [field ? startCase(field) : '', message].filter(Boolean).join(': ')
        }
        return ''
      })
      .filter(Boolean)
      .join(' · ')
    if (text) return text
  }
  if (detail && typeof detail === 'object') {
    if (typeof detail.message === 'string' && detail.message.trim()) return detail.message
    if (typeof detail.detail === 'string' && detail.detail.trim()) return detail.detail
  }
  return fallback
}

function escapeHtml(text) {
  return toText(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildSimplePdf(lines) {
  const pageWidth = 612
  const pageHeight = 792
  const marginX = 48
  const marginTop = 56
  const lineHeight = 16
  const maxLinesPerPage = 42
  const pages = []
  for (let i = 0; i < lines.length; i += maxLinesPerPage) pages.push(lines.slice(i, i + maxLinesPerPage))

  const objects = []
  const pageRefs = []
  const fontRef = 3

  pages.forEach((pageLines, index) => {
    const contentCommands = [
      'BT',
      '/F1 12 Tf',
      `${marginX} ${pageHeight - marginTop} Td`,
      `(${escapePdfText(pageLines[0] || '')}) Tj`,
    ]
    for (let i = 1; i < pageLines.length; i += 1) contentCommands.push(`0 -${lineHeight} Td (${escapePdfText(pageLines[i])}) Tj`)
    contentCommands.push('ET')
    const stream = contentCommands.join('\n')
    const contentObjId = 4 + index * 2
    const pageObjId = 5 + index * 2
    objects[contentObjId - 1] = `${contentObjId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj`
    objects[pageObjId - 1] = `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRef} 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj`
    pageRefs.push(`${pageObjId} 0 R`)
  })

  objects[0] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj'
  objects[1] = `2 0 obj\n<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageRefs.length} >>\nendobj`
  objects[2] = '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj'

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const obj of objects.filter(Boolean)) {
    offsets.push(pdf.length)
    pdf += `${obj}\n`
  }
  const xrefStart = pdf.length
  pdf += `xref\n0 ${offsets.length}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i < offsets.length; i += 1) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return new Blob([pdf], { type: 'application/pdf' })
}

function buildWrappedPrintHtml({ ownerName, year, slides }) {
  const sections = slides.map((slide, index) => {
    const stats = slide.stats?.length
      ? `
        <div class="stats">
          ${slide.stats.map(stat => `
            <div class="stat">
              <div class="stat-label">${escapeHtml(stat.label)}</div>
              <div class="stat-value">${escapeHtml(stat.value)}</div>
            </div>
          `).join('')}
        </div>
      `
      : ''

    const bullets = slide.bullets?.length
      ? `
        <div class="bullets">
          ${slide.bullets.map(point => `<div class="bullet">${escapeHtml(point)}</div>`).join('')}
        </div>
      `
      : ''

    return `
      <section class="slide">
        <div class="slide-top">
          <div class="slide-index">Story ${index + 1}</div>
          <div class="slide-icon">${escapeHtml(slide.icon)}</div>
        </div>
        <div class="slide-eyebrow">${escapeHtml(slide.eyebrow)}</div>
        <h2>${escapeHtml(slide.title)}</h2>
        <p class="body">${escapeHtml(slide.body)}</p>
        ${slide.support ? `<p class="support">${escapeHtml(slide.support)}</p>` : ''}
        ${stats}
        ${bullets}
      </section>
    `
  }).join('')

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Unova Wrapped ${year}</title>
      <style>
        @page { size: A4; margin: 14mm; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: "Helvetica Neue", Arial, sans-serif;
          color: #101828;
          background:
            radial-gradient(circle at top left, rgba(109, 141, 247, 0.16), transparent 28%),
            radial-gradient(circle at top right, rgba(42, 184, 163, 0.16), transparent 26%),
            linear-gradient(180deg, #f7f8fc 0%, #eef2ff 100%);
        }
        .page {
          padding: 28px;
        }
        .hero {
          background: linear-gradient(135deg, #172033 0%, #202a46 48%, #2a3859 100%);
          color: #ffffff;
          border-radius: 28px;
          padding: 28px 30px;
          box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
          margin-bottom: 18px;
        }
        .eyebrow {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.24em;
          color: #8fe7d9;
          margin-bottom: 14px;
        }
        .hero h1 {
          margin: 0 0 10px;
          font-size: 34px;
          line-height: 1.05;
        }
        .hero p {
          margin: 0;
          font-size: 16px;
          line-height: 1.65;
          color: rgba(255,255,255,0.78);
          max-width: 620px;
        }
        .hero-meta {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 18px;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.08);
          padding: 8px 12px;
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .slide {
          break-inside: avoid;
          background: rgba(255,255,255,0.92);
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 24px;
          padding: 22px;
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
          min-height: 240px;
        }
        .slide-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .slide-index {
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #667085;
        }
        .slide-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
          background: linear-gradient(135deg, rgba(109, 141, 247, 0.14), rgba(42, 184, 163, 0.12));
          font-size: 22px;
        }
        .slide-eyebrow {
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #2a7f74;
          margin-bottom: 8px;
        }
        .slide h2 {
          margin: 0 0 10px;
          font-size: 25px;
          line-height: 1.12;
        }
        .body, .support {
          margin: 0;
          font-size: 15px;
          line-height: 1.72;
          color: #475467;
        }
        .support { margin-top: 10px; color: #667085; }
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 10px;
          margin-top: 16px;
        }
        .stat {
          border-radius: 16px;
          background: #f8fafc;
          border: 1px solid rgba(148, 163, 184, 0.16);
          padding: 12px;
        }
        .stat-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #98a2b3;
          margin-bottom: 6px;
        }
        .stat-value {
          font-size: 18px;
          font-weight: 700;
          color: #1d2939;
        }
        .bullets {
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .bullet {
          position: relative;
          padding-left: 18px;
          font-size: 14px;
          line-height: 1.65;
          color: #475467;
        }
        .bullet::before {
          content: "";
          position: absolute;
          left: 0;
          top: 8px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: linear-gradient(135deg, #8b5cf6, #2ab8a3);
        }
        .footer {
          margin-top: 18px;
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #667085;
          text-align: center;
        }
        .actions {
          position: sticky;
          top: 12px;
          z-index: 20;
          display: flex;
          justify-content: flex-end;
          margin-bottom: 14px;
        }
        .print-btn {
          border: none;
          border-radius: 999px;
          background: linear-gradient(135deg, #2ab8a3, #179582);
          color: #081019;
          padding: 12px 18px;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.04em;
          cursor: pointer;
          box-shadow: 0 16px 34px rgba(42, 184, 163, 0.22);
        }
        .print-note {
          margin-right: auto;
          align-self: center;
          font-size: 12px;
          color: #667085;
          letter-spacing: 0.04em;
        }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page { padding: 0; }
          .actions { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="actions">
          <div class="print-note">Use the print dialog and choose "Save as PDF".</div>
          <button class="print-btn" onclick="window.print()">Save as PDF</button>
        </div>
        <header class="hero">
          <div class="eyebrow">Unova Financial Year Wrapped</div>
          <h1>${escapeHtml(ownerName)}'s ${year} money story</h1>
          <p>A visual recap of growth, wins, conviction holdings, and portfolio behavior across the year.</p>
          <div class="hero-meta">
            <span class="pill">Year ${escapeHtml(year)}</span>
            <span class="pill">${escapeHtml(ownerName)}</span>
            <span class="pill">${escapeHtml(String(slides.length))} key moments</span>
          </div>
        </header>
        <main class="grid">${sections}</main>
        <div class="footer">Generated by Unova</div>
      </div>
      <script>
        window.addEventListener('load', function () {
          setTimeout(function () {
            try { window.print(); } catch (e) {}
          }, 450);
        });
      </script>
    </body>
  </html>`
}

function benchmarkTone(percentile) {
  if (percentile >= 75) return { color:'var(--green)', rail:'rgba(34,197,94,0.16)' }
  if (percentile >= 50) return { color:'var(--teal)', rail:'rgba(42,184,163,0.16)' }
  if (percentile >= 25) return { color:'var(--gold)', rail:'rgba(201,168,76,0.18)' }
  return { color:'var(--red)', rail:'rgba(248,113,113,0.14)' }
}

function BenchmarkMeter({ title, data, icon }) {
  const tone = benchmarkTone(Number(data?.percentile || 0))
  const percentile = Math.max(1, Math.min(99, Number(data?.percentile || 0)))
  return (
    <div style={s.benchmarkMetricCard}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:14, marginBottom:12 }}>
        <div>
          <div style={s.benchmarkMetricLabel}>{title}</div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:'1.5rem', fontWeight:800, lineHeight:1.05 }}>
            {percentile}<span style={{ fontSize:'0.82rem', color:'var(--text-faint)', marginLeft:4 }}>th percentile</span>
          </div>
        </div>
        <div style={{ ...s.benchmarkIcon, color:tone.color }}>{icon}</div>
      </div>
      <div style={{ ...s.benchmarkRail, background:tone.rail }}>
        <div style={{ ...s.benchmarkFill, width:`${percentile}%`, background:tone.color }} />
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginTop:10, fontFamily:'var(--font-mono)', fontSize:'0.63rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.08em' }}>
        <span>P25 {fmtSgd(data?.p25)}</span>
        <span>Median {fmtSgd(data?.median)}</span>
        <span>P75 {fmtSgd(data?.p75)}</span>
      </div>
      <div style={{ marginTop:12, fontSize:'0.86rem', color:'var(--text-dim)', lineHeight:1.68 }}>
        {data?.headline}
      </div>
      <div style={{ marginTop:8, fontSize:'0.78rem', color:'var(--text-faint)', lineHeight:1.6 }}>
        Your value: <strong style={{ color:'var(--text)' }}>{fmtSgd(data?.user_value)}</strong> for ages {data?.age_band}.
      </div>
    </div>
  )
}

function BenchmarkMiniCard({ title, data, accent, icon }) {
  const percentile = Math.max(1, Math.min(99, Number(data?.percentile || 0)))
  return (
    <div style={s.benchmarkMiniCard}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', marginBottom:10 }}>
        <div>
          <div style={s.benchmarkMiniLabel}>{title}</div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:'1.18rem', fontWeight:800, lineHeight:1.08 }}>
            {percentile}<span style={{ fontSize:'0.72rem', color:'var(--text-faint)', marginLeft:4 }}>th percentile</span>
          </div>
        </div>
        <div style={{ ...s.benchmarkMiniIcon, color:accent }}>{icon}</div>
      </div>
      <div style={s.benchmarkMiniTrack}>
        <div style={{ ...s.benchmarkMiniFill, width:`${percentile}%`, background:accent }} />
      </div>
      <div style={{ marginTop:10, fontSize:'0.78rem', color:'var(--text-dim)', lineHeight:1.6 }}>
        {data?.headline}
      </div>
    </div>
  )
}

const WRAPPED_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function hashSeed(input) {
  return toText(input).split('').reduce((total, char, index) => total + char.charCodeAt(0) * (index + 1), 0)
}

function buildIncomeHistory(userId, year) {
  if (userId === 'u001') {
    return [5900, 6050, 6180, 6400, 6620, 6900, 7150, 7420, 7690, 7930, 8210, 8540].map((value, index) => ({
      month: WRAPPED_MONTHS[index],
      year,
      value,
    }))
  }

  const seed = hashSeed(userId || String(year))
  const start = 4300 + (seed % 1700)
  const slope = 120 + (seed % 60)
  return WRAPPED_MONTHS.map((month, index) => ({
    month,
    year,
    value: Math.round(start + slope * index + Math.sin((seed + index) / 3) * 90),
  }))
}

function buildFinancialWrapped({ userId, profile, stocks, allHoldings, year }) {
  const sortedStocks = [...stocks].sort((a, b) => (a.symbol || '').localeCompare(b.symbol || ''))
  const desiredNewCount = userId === 'u001'
    ? Math.min(3, Math.max(sortedStocks.length - 1, 1))
    : Math.min(2, Math.max(1, Math.floor(sortedStocks.length / 4)))
  const priorStockCutoff = Math.max(sortedStocks.length - desiredNewCount, 0)
  const priorSymbols = new Set(sortedStocks.slice(0, priorStockCutoff).map(stock => stock.symbol))

  const stockTimeline = sortedStocks.map((stock, index) => {
    const seed = hashSeed(`${userId}-${stock.symbol}-${index}`)
    const isNew = !priorSymbols.has(stock.symbol)
    const acquiredYear = isNew ? year : year - (1 + (seed % 5))
    const acquiredMonthIndex = isNew ? (seed % 10) : (seed % 12)
    const previousQty = isNew
      ? 0
      : Math.max(1, Math.round((stock.qty ?? 0) * (0.38 + (seed % 28) / 100)))
    return {
      ...stock,
      acquiredLabel: `${WRAPPED_MONTHS[acquiredMonthIndex]} ${acquiredYear}`,
      acquiredStamp: new Date(acquiredYear, acquiredMonthIndex, 1).getTime(),
      previousQty,
      addedQty: Math.max(0, Math.round((stock.qty ?? 0) - previousQty)),
      isNew,
    }
  })

  const incomeHistory = buildIncomeHistory(userId, year)
  const firstIncome = incomeHistory[0]?.value ?? 0
  const lastIncome = incomeHistory[incomeHistory.length - 1]?.value ?? 0
  const incomeGrowthPct = firstIncome > 0 ? ((lastIncome - firstIncome) / firstIncome) * 100 : 0
  const bestIncomeMonth = incomeHistory.slice(1).reduce((best, entry, index) => {
    const delta = entry.value - incomeHistory[index].value
    if (!best || delta > best.delta) return { month: entry.month, delta }
    return best
  }, null)

  const returnLeader = [...allHoldings]
    .map(holding => ({ ...holding, gain: gainPct(holding.current_price, holding.avg_price) }))
    .filter(holding => holding.gain != null)
    .sort((a, b) => b.gain - a.gain)[0] ?? null

  const newStocks = stockTimeline.filter(stock => stock.isNew)
  const longestHeld = [...stockTimeline].sort((a, b) => a.acquiredStamp - b.acquiredStamp)[0] ?? null
  const mostAccumulated = [...stockTimeline].sort((a, b) => b.addedQty - a.addedQty)[0] ?? null
  const highestValueHolding = [...allHoldings].sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0))[0] ?? null

  const summaryPoints = [
    `Income trajectory moved from ${fmt$(firstIncome)} to ${fmt$(lastIncome)}, a ${fmtPct(incomeGrowthPct)} change across ${year}.`,
    returnLeader
      ? `${returnLeader.symbol} delivered your strongest position gain at ${fmtPct(returnLeader.gain)} versus average cost.`
      : 'Your wrapped did not find enough cost-basis data to name a top return leader.',
    newStocks.length
      ? `You introduced ${newStocks.length} new stock${newStocks.length === 1 ? '' : 's'} to the portfolio, expanding your opportunity set.`
      : 'You kept a stable stock roster this year without adding new stock names.',
    longestHeld
      ? `${longestHeld.symbol} remains your longest-held stock, carried since ${longestHeld.acquiredLabel}.`
      : 'No stock holding age data was available for a longest-held insight.',
    mostAccumulated
      ? `You accumulated ${mostAccumulated.addedQty} more share${mostAccumulated.addedQty === 1 ? '' : 's'} of ${mostAccumulated.symbol} this year.`
      : 'No clear accumulation leader was found this year.',
  ]

  return {
    year,
    incomeHistory,
    summaryPoints,
    slides: [
      {
        key: 'income',
        icon: '💸',
        eyebrow: `${year} income growth`,
        title: `${fmtPct(incomeGrowthPct)} income growth`,
        body: `Estimated monthly income rose from ${fmt$(firstIncome)} in ${incomeHistory[0]?.month} to ${fmt$(lastIncome)} by ${incomeHistory[incomeHistory.length - 1]?.month}.`,
        support: bestIncomeMonth ? `${bestIncomeMonth.month} was your strongest month-to-month jump at ${fmt$(bestIncomeMonth.delta)}.` : 'Income stayed broadly steady through the year.',
        stats: [
          { label: 'Start', value: fmt$(firstIncome), color: 'var(--text)' },
          { label: 'End', value: fmt$(lastIncome), color: 'var(--green)' },
          { label: 'Best month', value: bestIncomeMonth?.month ?? '—', color: 'var(--teal)' },
        ],
      },
      {
        key: 'returns',
        icon: '📈',
        eyebrow: 'Highest returns growth',
        title: returnLeader ? `${returnLeader.symbol} led your gains` : 'No gain leader yet',
        body: returnLeader
          ? `${returnLeader.symbol} returned ${fmtPct(returnLeader.gain)} against your average cost basis, climbing from ${fmt$(returnLeader.avg_price)} to ${fmt$(returnLeader.current_price)}.`
          : 'We need both average cost and current price data to spotlight your top return leader.',
        support: returnLeader ? `${returnLeader.type} position · Market value ${fmt$(returnLeader.market_value)}.` : 'Add cost basis data to make this insight more precise.',
        stats: returnLeader ? [
          { label: 'Avg price', value: fmt$(returnLeader.avg_price), color: 'var(--text)' },
          { label: 'Current', value: fmt$(returnLeader.current_price), color: 'var(--green)' },
          { label: 'Gain', value: fmtPct(returnLeader.gain), color: 'var(--green)' },
        ] : [],
      },
      {
        key: 'new-stocks',
        icon: '✨',
        eyebrow: 'Fun fact',
        title: newStocks.length ? `You added ${newStocks.length} new stock${newStocks.length === 1 ? '' : 's'}` : 'No new stock names this year',
        body: newStocks.length
          ? `This year you expanded beyond your previous stock list with ${newStocks.map(stock => stock.symbol).slice(0, 4).join(', ')}${newStocks.length > 4 ? '...' : ''}.`
          : 'Your stock roster stayed consistent, which usually signals a conviction year over an exploration year.',
        support: highestValueHolding ? `${highestValueHolding.symbol} finished as your largest current position by market value at ${fmt$(highestValueHolding.market_value)}.` : 'No position-size comparison was available.',
        stats: [
          { label: 'New stocks', value: String(newStocks.length), color: 'var(--purple)' },
          { label: 'Current roster', value: String(sortedStocks.length), color: 'var(--text)' },
        ],
      },
      {
        key: 'longest-held',
        icon: '⏳',
        eyebrow: 'Longest-held stock',
        title: longestHeld ? `${longestHeld.symbol} is still your marathon holding` : 'No holding-age leader found',
        body: longestHeld
          ? `You have kept ${longestHeld.symbol} in the portfolio since ${longestHeld.acquiredLabel}, making it your longest-running stock conviction.`
          : 'We could not infer a reliable longest-held stock from the available data.',
        support: longestHeld ? `${longestHeld.name || longestHeld.symbol} currently sits at ${fmt$(longestHeld.market_value)} in market value.` : '',
        stats: longestHeld ? [
          { label: 'Held since', value: longestHeld.acquiredLabel, color: 'var(--gold)' },
          { label: 'Qty', value: String(longestHeld.qty ?? '—'), color: 'var(--text)' },
        ] : [],
      },
      {
        key: 'accumulation',
        icon: '🧺',
        eyebrow: 'Most accumulated stock',
        title: mostAccumulated ? `${mostAccumulated.symbol} was your biggest add` : 'No accumulation leader found',
        body: mostAccumulated
          ? `You accumulated ${mostAccumulated.addedQty} more share${mostAccumulated.addedQty === 1 ? '' : 's'} of ${mostAccumulated.symbol} over the year, more than any other stock in the portfolio.`
          : 'We could not identify a standout accumulation trend this year.',
        support: mostAccumulated ? `Position size moved from ${mostAccumulated.previousQty} to ${mostAccumulated.qty} shares.` : '',
        stats: mostAccumulated ? [
          { label: 'Previous qty', value: String(mostAccumulated.previousQty), color: 'var(--text)' },
          { label: 'Current qty', value: String(mostAccumulated.qty), color: 'var(--text)' },
          { label: 'Added', value: `+${mostAccumulated.addedQty}`, color: 'var(--teal)' },
        ] : [],
      },
      {
        key: 'summary',
        icon: '🧭',
        eyebrow: `${year} summary`,
        title: `${profile?.name ?? 'Your portfolio'} wrapped up`,
        body: `Your year was defined by ${fmtPct(incomeGrowthPct)} income growth, ${newStocks.length} new stock additions, and a strongest holding gain from ${returnLeader?.symbol ?? 'your top return leader'}.`,
        support: 'Download this wrapped recap to keep a snapshot of the year and share it later.',
        bullets: summaryPoints,
      },
    ],
  }
}

function priorityTone(priority) {
  const text = toText(priority).toLowerCase()
  if (text.includes('high') || text === '1') return { color:'var(--red)', bg:'rgba(248,113,113,0.12)', border:'rgba(248,113,113,0.24)' }
  if (text.includes('medium') || text === '2') return { color:'var(--gold)', bg:'rgba(201,168,76,0.12)', border:'rgba(201,168,76,0.24)' }
  return { color:'var(--teal)', bg:'rgba(45,212,191,0.12)', border:'rgba(45,212,191,0.24)' }
}

function insightTone(score) {
  if (score == null) return { label:'Unavailable', color:'var(--text-faint)' }
  if (score >= 75) return { label:'Strong', color:'var(--green)' }
  if (score >= 50) return { label:'Watch', color:'var(--gold)' }
  return { label:'Needs attention', color:'var(--red)' }
}

function FutureTag() {
  return (
    <span style={{ background:'rgba(96,165,250,0.1)', color:'var(--blue)', fontFamily:'var(--font-mono)', fontSize:'0.6rem', padding:'2px 8px', borderRadius:6, border:'1px solid rgba(96,165,250,0.2)', marginLeft:6 }}>
      Future Upgrade
    </span>
  )
}

function FutureBar({ label, onHoverChange }) {
  return (
    <div
      style={{ marginBottom:12 }}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
    >
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.8rem', color:'var(--text-faint)', marginBottom:4 }}>
        <span>{label} <FutureTag /></span>
        <span style={{ fontFamily:'var(--font-mono)' }}>?</span>
      </div>
      <div style={{ height:5, background:'var(--surface2)', borderRadius:3, overflow:'hidden' }}>
        <div style={{ height:'100%', width:'40%', background:'rgba(96,165,250,0.25)', borderRadius:3 }} />
      </div>
    </div>
  )
}

function BehavioralResilienceModal({
  open,
  onClose,
  score,
  confidence,
  summary,
  breakdown,
  insights,
  derivedMetrics,
}) {
  if (!open) return null
  const [activeFact, setActiveFact] = useState(null)

  const rows = [
    { key:'liquidity_score', label:'Liquidity', color:'var(--blue)' },
    { key:'debt_score', label:'Debt', color:'var(--orange)' },
    { key:'housing_score', label:'Housing', color:'var(--gold)' },
    { key:'diversification_score', label:'Diversification', color:'var(--green)' },
    { key:'risk_alignment_score', label:'Risk Alignment', color:'var(--teal)' },
  ]
  const confidenceTone =
    confidence === 'High' ? { color:'var(--green)', bg:'rgba(52,211,153,0.12)', border:'rgba(52,211,153,0.28)' }
    : confidence === 'Medium' ? { color:'var(--gold)', bg:'rgba(201,168,76,0.12)', border:'rgba(201,168,76,0.28)' }
    : { color:'var(--red)', bg:'rgba(248,113,113,0.12)', border:'rgba(248,113,113,0.28)' }

  const quickFacts = [
    {
      key:'liquidity_buffer',
      label:'Liquidity buffer',
      value: derivedMetrics?.liquidity_months != null ? `${Number(derivedMetrics.liquidity_months).toFixed(1)} mo` : '—',
      explanation:'Months of expenses your cash buffer can cover. Higher values mean more room to absorb income shocks or emergencies.',
    },
    {
      key:'debt_income',
      label:'Debt / income',
      value: derivedMetrics?.debt_to_annual_income != null ? `${Math.round(Number(derivedMetrics.debt_to_annual_income) * 100)}%` : '—',
      explanation:'Total liabilities relative to annual income. Lower is generally stronger because debt is easier to service.',
    },
    {
      key:'housing_cushion',
      label:'Housing cushion',
      value: derivedMetrics?.housing_cushion != null && Number(derivedMetrics.housing_cushion) > 0 ? `${Number(derivedMetrics.housing_cushion).toFixed(2)}x` : 'N/A',
      explanation:'Property value compared with mortgage balance. A larger cushion means more equity protection in housing.',
    },
    {
      key:'crypto_exposure',
      label:'Crypto exposure',
      value: derivedMetrics?.crypto_exposure_ratio != null ? `${Math.round(Number(derivedMetrics.crypto_exposure_ratio) * 100)}%` : '—',
      explanation:'Share of portfolio held in crypto. Higher concentration can increase volatility and weaken resilience for conservative profiles.',
    },
  ]

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={brm.backdrop}>
      <div style={brm.panel}>
        <div style={brm.topBar} />
        <div style={brm.header}>
          <div style={brm.headerCopy}>
            <div style={brm.eyebrow}>Behavioral Resilience</div>
            <div style={brm.title}>Why this score looks the way it does</div>
            <div style={brm.subtext}>
              {summary || 'This score reflects liquidity, debt load, housing cushion, diversification, and fit with your stated risk tolerance.'}
            </div>
          </div>
          <div style={brm.headerRail}>
            <div style={brm.scoreBadge}>
              <span style={brm.scoreValue}>{score != null ? Math.round(score) : '—'}</span>
              <span style={brm.scoreLabel}>/ 100</span>
            </div>
            <div style={{ ...brm.confidencePill, color:confidenceTone.color, background:confidenceTone.bg, borderColor:confidenceTone.border }}>
              {confidence || 'Unknown'} confidence
            </div>
            <button type="button" onClick={onClose} style={brm.closeBtn} aria-label="Close behavioral resilience details">×</button>
          </div>
        </div>

        <div style={brm.body}>
          <div style={brm.grid}>
            <div style={brm.card}>
              <div style={brm.sectionLabel}>Pillar Breakdown</div>
              <div style={brm.breakdownList}>
                {rows.map(row => {
                  const value = breakdown?.[row.key]
                  return (
                    <div key={row.key} style={brm.breakdownRow}>
                      <div style={brm.breakdownHead}>
                        <span>{row.label}</span>
                        <span style={brm.breakdownValue}>{value != null ? Math.round(value) : 'N/A'}</span>
                      </div>
                      <div style={brm.breakdownTrack}>
                        <div style={{ ...brm.breakdownFill, width:`${Math.min(value ?? 0, 100)}%`, background:row.color, opacity:value == null ? 0.35 : 1 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={brm.sideColumn}>
              <div style={brm.card}>
                <div style={brm.sectionLabel}>Key Facts</div>
                <div style={brm.factGrid}>
                  {quickFacts.map(item => (
                    <div
                      key={item.key}
                      style={brm.factItem}
                      onMouseEnter={() => setActiveFact(item.key)}
                      onMouseLeave={() => setActiveFact(null)}
                    >
                      <div style={brm.factLabel}>{item.label}</div>
                      <div style={brm.factValue}>{item.value}</div>
                      {activeFact === item.key && (
                        <div style={brm.factTooltip}>
                          {item.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div style={brm.card}>
                <div style={brm.sectionLabel}>Suggested Actions</div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {(Array.isArray(insights) && insights.length ? insights : ['No action insights available.']).map(item => (
                    <div key={item} style={brm.insightItem}>{item}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function LoadingPulse() {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {[100, 85, 92, 70].map((w, i) => (
        <div key={i} style={{ height:14, width:`${w}%`, background:'var(--surface2)', borderRadius:6 }} />
      ))}
    </div>
  )
}

function HoldingInsightModal({ holding, onClose, userId }) {
  const insightAssetType = holding?.type === 'Crypto' ? 'crypto' : holding?.type === 'Commodity' ? 'commodity' : 'stock'
  const cachedInsight = getCachedInsight(insightAssetType, holding?.symbol, 3)
  const [liveNarrative, setLiveNarrative] = useState(() => {
    if (typeof cachedInsight?.narrative === 'string' && cachedInsight.narrative.trim()) return cachedInsight.narrative.trim()
    if (typeof cachedInsight?.conclusion === 'string' && cachedInsight.conclusion.trim()) return cachedInsight.conclusion.trim()
    if (Array.isArray(cachedInsight?.tldr)) {
      const first = cachedInsight.tldr.find(v => typeof v === 'string' && v.trim())
      if (first) return first.trim()
    }
    return ''
  })

  useEffect(() => {
    if (!holding) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [holding, onClose])

  useEffect(() => {
    if (typeof cachedInsight?.narrative === 'string' && cachedInsight.narrative.trim()) {
      setLiveNarrative(cachedInsight.narrative.trim())
      return
    }
    if (typeof cachedInsight?.conclusion === 'string' && cachedInsight.conclusion.trim()) {
      setLiveNarrative(cachedInsight.conclusion.trim())
      return
    }
    if (Array.isArray(cachedInsight?.tldr)) {
      const first = cachedInsight.tldr.find(v => typeof v === 'string' && v.trim())
      if (first) {
        setLiveNarrative(first.trim())
        return
      }
    }
    setLiveNarrative('')
  }, [holding?.symbol, holding?.type])

  if (!holding) return null
  const gain = gainPct(holding.current_price, holding.avg_price)
  const assetType = holding.type === 'Crypto' ? 'crypto' : holding.type === 'Commodity' ? 'commodity' : 'stock'
  const suggestedText = liveNarrative || 'Generate Market Insight to view a narrative read for this holding.'

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={hm.backdrop}>
      <div style={hm.panel}>
        <div style={hm.topBar} />
        <div style={hm.header}>
          <div>
            <div style={hm.eyebrow}>Holding Insight</div>
            <div style={{ display:'flex', alignItems:'baseline', gap:10, flexWrap:'wrap' }}>
              <h2 style={hm.title}>{holding.symbol}</h2>
              <span style={hm.typeTag}>{holding.type}</span>
            </div>
            <div style={hm.subline}>
              Qty {holding.qty} · Market Value {fmt$(holding.market_value)} · Gain/Loss {gain != null ? fmtPct(gain) : '—'}
            </div>
          </div>
          <button onClick={onClose} style={hm.closeBtn}>×</button>
        </div>

        <div style={hm.metrics}>
          {[
            ['Avg Cost', fmt$(holding.avg_price)],
            ['Current Price', fmt$(holding.current_price)],
            ['Market Value', fmt$(holding.market_value)],
            ['Position Return', gain != null ? fmtPct(gain) : '—'],
          ].map(([label, value]) => (
            <div key={label} style={hm.metricCard}>
              <div style={hm.metricLabel}>{label}</div>
              <div style={hm.metricValue}>{value}</div>
            </div>
          ))}
        </div>

        <AssetInsightsPanel
          assetType={assetType}
          symbol={holding.symbol}
          months={3}
          userId={userId}
          prefaceText={suggestedText}
          onInsightLoaded={insight => {
            if (typeof insight?.narrative === 'string' && insight.narrative.trim()) {
              setLiveNarrative(insight.narrative.trim())
              return
            }
            if (typeof insight?.conclusion === 'string' && insight.conclusion.trim()) {
              setLiveNarrative(insight.conclusion.trim())
              return
            }
            if (Array.isArray(insight?.tldr)) {
              const first = insight.tldr.find(v => typeof v === 'string' && v.trim())
              if (first) setLiveNarrative(first.trim())
            }
          }}
        />
      </div>
    </div>
  )
}

function YearWrappedModal({ open, slides, index, setIndex, onClose, onDownload, year, ownerName, themeId = 'default' }) {
  useEffect(() => {
    if (!open) return
    const onKey = event => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') setIndex(current => Math.min(current + 1, slides.length - 1))
      if (event.key === 'ArrowLeft') setIndex(current => Math.max(current - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, setIndex, slides.length])

  if (!open || !slides.length) return null
  const slide = slides[index]
  const isSummary = slide.key === 'summary'
  const isSilentNight = themeId === 'silent-night'
  const panelStyle = isSilentNight
    ? {
        ...yw.panel,
        background: 'linear-gradient(180deg, rgba(15,18,25,0.98), rgba(11,14,20,0.98))',
        border: '1px solid rgba(190,183,164,0.2)',
        boxShadow: '0 36px 90px rgba(0,0,0,0.58)',
      }
    : yw.panel
  const closeBtnStyle = isSilentNight
    ? { ...yw.closeBtn, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(190,183,164,0.18)', color:'var(--text-dim)' }
    : yw.closeBtn
  const slideStyle = isSilentNight
    ? {
        ...yw.slide,
        border: '1px solid rgba(190,183,164,0.2)',
        background: 'linear-gradient(135deg, rgba(110,95,170,0.14), rgba(30,38,55,0.72) 45%, rgba(20,70,80,0.14))',
      }
    : yw.slide
  const slideIconStyle = isSilentNight
    ? { ...yw.slideIcon, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(190,183,164,0.22)', boxShadow:'0 16px 30px rgba(0,0,0,0.28)' }
    : yw.slideIcon
  const statCardStyle = isSilentNight
    ? { ...yw.statCard, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(190,183,164,0.2)' }
    : yw.statCard
  const navBtnStyle = isSilentNight
    ? { ...yw.navBtn, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(190,183,164,0.2)', color:'var(--text-dim)' }
    : yw.navBtn
  const downloadBtnStyle = isSilentNight
    ? { ...yw.downloadBtn, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(190,183,164,0.2)' }
    : yw.downloadBtn

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={yw.backdrop}>
      <div style={panelStyle}>
        <div style={yw.topBar} />
        <div style={yw.header}>
          <div>
            <div style={yw.eyebrow}>Financial Year Wrapped</div>
            <div style={yw.titleRow}>
              <h2 style={yw.title}>{ownerName} · {year}</h2>
              <span style={yw.countPill}>{index + 1} / {slides.length}</span>
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>×</button>
        </div>

        <div style={yw.dots}>
          {slides.map((item, dotIndex) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setIndex(dotIndex)}
              style={{ ...yw.dot, ...(dotIndex === index ? yw.dotActive : {}) }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => !isSummary && setIndex(current => Math.min(current + 1, slides.length - 1))}
          style={{ ...slideStyle, cursor: isSummary ? 'default' : 'pointer' }}
        >
          <div style={slideIconStyle}>{slide.icon}</div>
          <div style={yw.slideEyebrow}>{slide.eyebrow}</div>
          <div style={yw.slideTitle}>{slide.title}</div>
          <div style={yw.slideBody}>{slide.body}</div>
          {slide.support ? <div style={yw.slideSupport}>{slide.support}</div> : null}

          {slide.stats?.length ? (
            <div style={yw.statsGrid}>
              {slide.stats.map(stat => (
                <div key={stat.label} style={statCardStyle}>
                  <div style={yw.statLabel}>{stat.label}</div>
                  <div style={{ ...yw.statValue, color: stat.color || 'var(--text)' }}>{stat.value}</div>
                </div>
              ))}
            </div>
          ) : null}

          {slide.bullets?.length ? (
            <div style={yw.summaryList}>
              {slide.bullets.map(point => (
                <div key={point} style={yw.summaryRow}>
                  <span style={yw.summaryDot} />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          ) : null}

          {!isSummary ? <div style={yw.tapHint}>Click anywhere on this card to keep going</div> : null}
        </button>

        <div style={yw.footer}>
          <button
            type="button"
            onClick={() => setIndex(current => Math.max(current - 1, 0))}
            disabled={index === 0}
            style={{ ...navBtnStyle, opacity: index === 0 ? 0.4 : 1, cursor: index === 0 ? 'not-allowed' : 'pointer' }}
          >
            ← Previous
          </button>

          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            {isSummary && (
              <button type="button" onClick={e => { e.stopPropagation(); onDownload() }} style={downloadBtnStyle}>
                Download Wrapped
              </button>
            )}
            <button
              type="button"
              onClick={() => isSummary ? onClose() : setIndex(current => Math.min(current + 1, slides.length - 1))}
              style={yw.nextBtn}
            >
              {isSummary ? 'Close' : 'Next Fact →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FinancialManagerModal({
  open,
  activeTab,
  setActiveTab,
  profile,
  onClose,
  onSubmit,
  onRemove,
  busy,
}) {
  const [assetForm, setAssetForm] = useState({ label:'', category:'real_estate', value:'' })
  const [liabilityForm, setLiabilityForm] = useState({ label:'', amount:'', is_mortgage:false })
  const [incomeForm, setIncomeForm] = useState({ label:'', monthly_amount:'' })

  useEffect(() => {
    if (!open) return
    setAssetForm({ label:'', category:'real_estate', value:'' })
    setLiabilityForm({ label:'', amount:'', is_mortgage:false })
    setIncomeForm({ label:'', monthly_amount:'' })
  }, [open, activeTab])

  if (!open) return null
  const symbolDrivenCategories = new Set(['stock', 'crypto', 'commodity'])
  const needsExactSymbol = symbolDrivenCategories.has(String(assetForm.category || '').toLowerCase())

  const tabMap = {
    assets: {
      title: 'Manual Assets',
      description: 'Add non-market assets like real estate, business ownership, or private holdings.',
      items: profile?.manual_assets ?? [],
    },
    liabilities: {
      title: 'Liabilities',
      description: 'Track loans, credit balances, and other obligations affecting your net worth.',
      items: profile?.liability_items ?? [],
    },
    income: {
      title: 'Income Streams',
      description: 'Track monthly salary, rental inflows, dividends, or side-income sources.',
      items: profile?.income_streams ?? [],
    },
  }

  const currentTab = tabMap[activeTab]
  const portfolioAssetItems = [
    ...((profile?.portfolio?.stocks ?? []).map((item, index) => {
      const fallbackValue = Number(item.qty || 0) * Number(item.current_price || 0)
      const marketValue = item.market_value ?? fallbackValue
      return ({
      id: `portfolio-stock-${index}-${item.symbol ?? item.name ?? 'item'}`,
      label: item.name || item.symbol || `Stock ${index + 1}`,
      category: 'stocks',
      value: Number(marketValue || 0),
      source: 'portfolio',
      asset_class: 'stocks',
      symbol: item.symbol || item.name || '',
    })})),
    ...((profile?.portfolio?.cryptos ?? []).map((item, index) => {
      const fallbackValue = Number(item.qty || 0) * Number(item.current_price || 0)
      const marketValue = item.market_value ?? fallbackValue
      return ({
      id: `portfolio-crypto-${index}-${item.symbol ?? item.name ?? 'item'}`,
      label: item.name || item.symbol || `Crypto ${index + 1}`,
      category: 'cryptos',
      value: Number(marketValue || 0),
      source: 'portfolio',
      asset_class: 'cryptos',
      symbol: item.symbol || item.name || '',
    })})),
    ...((profile?.portfolio?.commodities ?? []).map((item, index) => {
      const fallbackValue = Number(item.qty || 0) * Number(item.current_price || 0)
      const marketValue = item.market_value ?? fallbackValue
      return ({
      id: `portfolio-commodity-${index}-${item.symbol ?? item.name ?? 'item'}`,
      label: item.name || item.symbol || `Commodity ${index + 1}`,
      category: 'commodities',
      value: Number(marketValue || 0),
      source: 'portfolio',
      asset_class: 'commodities',
      symbol: item.symbol || item.name || '',
    })})),
  ]
  const renderItems = activeTab === 'assets'
    ? [
        ...(Number(profile?.cash_balance || 0) > 0
          ? [{
              id: 'cash-balance-row',
              label: 'Cash',
              category: 'banks',
              value: Number(profile?.cash_balance || 0),
              source: 'cash',
            }]
          : []),
        ...(currentTab.items ?? []).map(item => ({ ...item, source:'manual' })),
        ...portfolioAssetItems,
      ]
    : (currentTab.items ?? [])

  const submitCurrent = event => {
    event.preventDefault()
    if (activeTab === 'assets') {
      const cleanedLabel = String(assetForm.label || '').trim()
      const normalizedSymbol = needsExactSymbol ? cleanedLabel.toUpperCase() : cleanedLabel
      onSubmit('assets', {
        label: normalizedSymbol,
        category: assetForm.category,
        value: Number(assetForm.value),
        symbol: needsExactSymbol ? normalizedSymbol : undefined,
      })
    }
    if (activeTab === 'liabilities') {
      onSubmit('liabilities', {
        label: liabilityForm.label,
        amount: Number(liabilityForm.amount),
        is_mortgage: Boolean(liabilityForm.is_mortgage),
      })
    }
    if (activeTab === 'income') {
      onSubmit('income', {
        label: incomeForm.label,
        monthly_amount: Number(incomeForm.monthly_amount),
      })
    }
  }

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={fm.backdrop}>
      <div style={fm.panel}>
        <div style={fm.topBar} />
        <div style={fm.header}>
          <div>
            <div style={fm.eyebrow}>Manage Profile Financials</div>
            <h2 style={fm.title}>Assets, liabilities, and income</h2>
            <div style={fm.subline}>Changes recalculate net worth and wellness immediately.</div>
          </div>
          <button onClick={onClose} style={fm.closeBtn}>×</button>
        </div>

        <div style={fm.tabs}>
          {[
            ['assets', 'Assets'],
            ['liabilities', 'Liabilities'],
            ['income', 'Income'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              style={{ ...fm.tab, ...(activeTab === key ? fm.tabActive : {}) }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={fm.body}>
          <div>
            <div style={fm.sectionTitle}>{currentTab.title}</div>
            <div style={fm.sectionBody}>{currentTab.description}</div>
          </div>

          <form onSubmit={submitCurrent} style={fm.form}>
            {activeTab === 'assets' && (
              <>
                <input
                  value={assetForm.label}
                  onChange={e => setAssetForm(prev => ({ ...prev, label:e.target.value }))}
                  placeholder={needsExactSymbol ? 'Exact symbol (e.g., AAPL, BTC, GOLD)' : 'Asset label'}
                  style={fm.input}
                />
                <select
                  value={assetForm.category}
                  onChange={e => setAssetForm(prev => ({ ...prev, category:e.target.value }))}
                  style={fm.input}
                >
                  <option value="real_estate">Real Estate</option>
                  <option value="banks">Banks</option>
                  <option value="stock">Stock</option>
                  <option value="crypto">Crypto</option>
                  <option value="commodity">Commodity</option>
                  <option value="business">Business</option>
                  <option value="private_asset">Private Asset</option>
                  <option value="other">Other</option>
                </select>
                <input
                  value={assetForm.value}
                  onChange={e => setAssetForm(prev => ({ ...prev, value:e.target.value }))}
                  placeholder={needsExactSymbol ? 'Quantity' : 'Value'}
                  type="text"
                  inputMode="decimal"
                  style={{ ...fm.input, ...fm.numberInput }}
                />
                {needsExactSymbol && (
                  <div style={{ gridColumn:'1 / span 3', fontSize:'0.76rem', color:'var(--text-faint)' }}>
                    For {assetForm.category} assets, enter exact symbol in label. Quantity will be added into portfolio using fetched live price.
                  </div>
                )}
              </>
            )}
            {activeTab === 'liabilities' && (
              <>
                <input
                  value={liabilityForm.label}
                  onChange={e => setLiabilityForm(prev => ({ ...prev, label:e.target.value }))}
                  placeholder="Liability label"
                  style={fm.input}
                />
                <input
                  value={liabilityForm.amount}
                  onChange={e => setLiabilityForm(prev => ({ ...prev, amount:e.target.value }))}
                  placeholder="Amount"
                  type="text"
                  inputMode="decimal"
                  style={{ ...fm.input, ...fm.numberInput }}
                />
                <label style={{ display:'flex', alignItems:'center', gap:8, color:'var(--text-dim)', fontSize:'0.82rem' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(liabilityForm.is_mortgage)}
                    onChange={e => setLiabilityForm(prev => ({ ...prev, is_mortgage:e.target.checked }))}
                  />
                  Mortgage
                </label>
              </>
            )}
            {activeTab === 'income' && (
              <>
                <input
                  value={incomeForm.label}
                  onChange={e => setIncomeForm(prev => ({ ...prev, label:e.target.value }))}
                  placeholder="Income label"
                  style={fm.input}
                />
                <input
                  value={incomeForm.monthly_amount}
                  onChange={e => setIncomeForm(prev => ({ ...prev, monthly_amount:e.target.value }))}
                  placeholder="Monthly amount"
                  type="text"
                  inputMode="decimal"
                  style={{ ...fm.input, ...fm.numberInput }}
                />
              </>
            )}
            <button type="submit" style={fm.submitBtn} disabled={busy}>
              {busy ? 'Saving...' : `Add ${activeTab === 'income' ? 'Income' : activeTab === 'liabilities' ? 'Liability' : 'Asset'}`}
            </button>
          </form>

          <div style={fm.list}>
            {renderItems.length === 0 ? (
              <div style={fm.empty}>Nothing added yet.</div>
            ) : renderItems.map(item => {
              const value = activeTab === 'assets'
                ? fmt$(item.value)
                : activeTab === 'liabilities'
                  ? fmt$(item.amount)
                  : `${fmt$(item.monthly_amount)} / mo`
              return (
                <div key={item.id} style={fm.listItem}>
                  <div>
                    <div style={fm.itemTitle}>{item.label}</div>
                    <div style={fm.itemMeta}>
                      {activeTab === 'assets'
                        ? (item.source === 'portfolio'
                          ? `${startCase(item.category)} holding`
                          : item.source === 'cash'
                            ? 'Cash balance from linked banks'
                          : startCase(item.category))
                        : activeTab === 'income'
                          ? 'Monthly income stream'
                          : (item.is_mortgage ? 'Mortgage' : 'Non-mortgage liability')}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={fm.itemValue}>{value}</div>
                    {!(activeTab === 'assets' && item.source === 'cash') && (
                      <button
                        type="button"
                        onClick={() => onRemove(activeTab, item.id, item)}
                        style={fm.removeBtn}
                        disabled={busy}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// Inline spinner used in buttons
function Spinner({ size = 16, color = 'var(--teal)' }) {
  return (
    <div style={{
      width:size, height:size,
      border:`2px solid rgba(255,255,255,0.12)`,
      borderTopColor:color, borderRadius:'50%',
      animation:'profileSpin 0.7s linear infinite',
      flexShrink:0,
    }} />
  )
}

// â”€â”€ small chart helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function WellnessRing({ score }) {
  const r = 42, circ = 2 * Math.PI * r
  return (
    <div style={{ position:'relative', width:100, height:100, flexShrink:0 }}>
      <svg viewBox="0 0 100 100" width={100} height={100} style={{ transform:'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="wg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#c9a84c" />
          </linearGradient>
        </defs>
        <circle cx={50} cy={50} r={r} fill="none" stroke="var(--surface2)" strokeWidth={9} />
        <circle cx={50} cy={50} r={r} fill="none" stroke="url(#wg)" strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - score / 100)} />
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.6rem', background:'linear-gradient(135deg,var(--gold-light),var(--gold))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>{Math.round(score)}</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:'var(--text-faint)', textTransform:'uppercase' }}>/ 100</span>
      </div>
    </div>
  )
}

// â”€â”€ Risk option definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const RISK_OPTIONS = [
  { key:'Low', label:'Low', icon:'🛡️', desc:'Capital preservation. Low volatility, steady income.',       color:'#34d399', glow:'rgba(52,211,153,0.35)'  },
  { key:'Medium',     label:'Medium',     icon:'⚖️', desc:'Mix of growth and stability. Moderate risk tolerance.',      color:'#c9a84c', glow:'rgba(201,168,76,0.35)'  },
  { key:'High',   label:'High',   icon:'🚀', desc:'Maximum growth. High volatility accepted for high returns.', color:'#f87171', glow:'rgba(248,113,113,0.35)' },
]

// â”€â”€ Rec card shared between sections 2 & 3 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const REC_ICON  = { buy:'📈', sell:'📉', hold:'⏸', rebalance:'🔄', warning:'⚠️' }
const REC_COLOR = { buy:'var(--green)', sell:'var(--red)', hold:'var(--gold)', rebalance:'var(--teal)', warning:'#fbbf24' }

function RecCard({ rec, i, tint = false, compact = false }) {
  const type  = rec.type?.toLowerCase()
  const color = REC_COLOR[type] ?? (tint ? 'var(--teal)' : 'var(--text-dim)')
  const icon  = REC_ICON[type]  ?? (tint ? '🧑‍💼' : '💡')
  const title = rec.title ?? rec.symbol ?? rec.asset ?? `Recommendation ${i + 1}`
  const body = rec.action ?? rec.message ?? rec.description ?? rec.reason ?? rec.why ?? rec.body
  const rationale = rec.why ?? rec.rationale
  const priority = toText(rec.priority)
  const priorityStyle = priorityTone(priority)
  return (
    <div style={{
      background: tint ? 'rgba(45,212,191,0.04)' : 'var(--surface2)',
      border: `1px solid ${tint ? 'rgba(45,212,191,0.14)' : 'var(--border)'}`,
      borderRadius:12, padding: compact ? '18px 20px' : '16px 18px', display:'flex', gap:14, alignItems:'flex-start',
      animation:'profileFadeUp 0.3s ease',
    }}>
      <div style={{ width:38, height:38, borderRadius:10, background:`${color}18`, border:`1px solid ${color}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>
        {icon}
      </div>
      <div style={{ flex:1 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5, flexWrap:'wrap' }}>
          <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize: compact ? '1rem' : '1rem' }}>
            {title}
          </span>
          {!compact && rec.type && (
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', padding:'2px 8px', borderRadius:6, background:`${color}18`, color, border:`1px solid ${color}30`, textTransform:'uppercase', letterSpacing:'0.07em' }}>
              {rec.type}
            </span>
          )}
          {priority && (
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', padding:'2px 8px', borderRadius:6, background:priorityStyle.bg, color:priorityStyle.color, border:`1px solid ${priorityStyle.border}` }}>
              {startCase(priority)}
            </span>
          )}
        </div>
        {body && <div style={{ fontSize: compact ? '0.92rem' : '0.92rem', color:'var(--text-dim)', lineHeight: compact ? 1.75 : 1.75 }}>{body}</div>}
        {!compact && rationale && rationale !== body && (
          <div style={{ marginTop:8, fontSize:'0.82rem', color:'var(--text-faint)', lineHeight:1.68 }}>
            {rationale}
          </div>
        )}
        {rec.symbol && rec.title && (
          <div style={{ fontFamily:'var(--font-mono)', fontSize: compact ? '0.74rem' : '0.74rem', color:'var(--teal)', marginTop:6 }}>{rec.symbol}</div>
        )}
      </div>
    </div>
  )
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function Profile() {
  const navigate = useNavigate()
  const { user: authUser } = useAuth()
  const { activeTheme } = useTheme()
  const isSilentNight = activeTheme?.id === 'silent-night'

  const [profile,   setProfile]   = useState(null)
  const [portfolio, setPortfolio] = useState(null)
  const [portfolioHistory, setPortfolioHistory] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [selectedHolding, setSelectedHolding] = useState(null)

  // â”€â”€ Section 1: Risk profile update state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [selectedRisk, setSelectedRisk] = useState('')
  const [riskSaving,   setRiskSaving]   = useState(false)
  const [riskSaved,    setRiskSaved]    = useState(false)
  const [riskError,    setRiskError]    = useState('')

  // â”€â”€ GPT recommendations state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [gptRecs,    setGptRecs]    = useState(null)
  const [gptLoading, setGptLoading] = useState(false)
  const [gptError,   setGptError]   = useState('')
  const [analysisMode, setAnalysisMode] = useState('lite')
  const [selectedScenario, setSelectedScenario] = useState('base_case')
  const [wellnessHint, setWellnessHint] = useState(null)
  const [behavioralResilienceOpen, setBehavioralResilienceOpen] = useState(false)
  const [wrappedOpen, setWrappedOpen] = useState(false)
  const [wrappedIndex, setWrappedIndex] = useState(0)
  const [financialModalOpen, setFinancialModalOpen] = useState(false)
  const [financialTab, setFinancialTab] = useState('assets')
  const [financialBusy, setFinancialBusy] = useState(false)
  const [retirementInputs, setRetirementInputs] = useState({
    retirement_age: 65,
    monthly_expenses: 0,
    essential_monthly_expenses: 0,
  })
  const [retirementInitialized, setRetirementInitialized] = useState(false)
  const [retirementPlan, setRetirementPlan] = useState(null)
  const [retirementLoading, setRetirementLoading] = useState(false)
  const [retirementError, setRetirementError] = useState('')
  const [retirementOpen, setRetirementOpen] = useState(false)
  const [benchmarks, setBenchmarks] = useState(null)
  const [benchmarkLoading, setBenchmarkLoading] = useState(false)
  const [benchmarkError, setBenchmarkError] = useState('')
  const [benchmarkOpen, setBenchmarkOpen] = useState(false)
  const [priceRefreshing, setPriceRefreshing] = useState(false)
  const holdingsStrongText = isSilentNight ? 'rgba(248,250,252,0.96)' : 'var(--text)'
  const holdingsDimText = isSilentNight ? 'rgba(226,232,240,0.88)' : 'var(--text-dim)'
  const holdingsGoldText = isSilentNight ? '#d4bd92' : 'var(--gold)'
  const holdingsHeaderText = isSilentNight ? 'rgba(203,213,225,0.8)' : 'var(--text-faint)'
  const holdingsRowBorder = isSilentNight ? '1px solid rgba(248,250,252,0.06)' : '1px solid rgba(255,255,255,0.04)'
  const holdingsHeadBorder = isSilentNight ? '1px solid rgba(248,250,252,0.12)' : '1px solid var(--border)'

  // â”€â”€ Initial data fetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!authUser?.user_id) { setLoading(false); return }
    let cancelled = false
    async function fetchAll() {
      setLoading(true); setError('')
      try {
        // Keep portfolio page data fresh on reload.
        await fetch(`${API}/update/assets`).catch(() => null)
        await fetch(`${API}/update/wellness`).catch(() => null)

        const [profRes, portRes, historyRes] = await Promise.all([
          fetch(`${API}/users/${authUser.user_id}`),
          fetch(`${API}/portfolio/${authUser.user_id}`),
          fetch(`${API}/portfolio/${authUser.user_id}/history`),
        ])
        if (cancelled) return
        if (profRes.ok) {
          const d = await profRes.json()
          setProfile(d.user)
          // Keep selected risk aligned with normalized numeric 0-100 backend format.
          if (d.user?.risk_profile != null) setSelectedRisk(String(normalizeRiskScore(d.user.risk_profile) ?? ''))
        }
        if (portRes.ok) { const d = await portRes.json(); setPortfolio(d.portfolio) }
        if (historyRes.ok) {
          const d = await historyRes.json()
          setPortfolioHistory(Array.isArray(d?.history?.daily_values) ? d.history.daily_values : [])
        } else {
          setPortfolioHistory([])
        }
      } catch { if (!cancelled) setError('Could not reach the server. Is the backend running?') }
      finally  { if (!cancelled) setLoading(false) }
    }
    fetchAll()
    return () => { cancelled = true }
  }, [authUser?.user_id])

  useEffect(() => {
    if (!profile || retirementInitialized) return
    const currentIncomeValue = Number(profile.income ?? 0)
    const expenseBase = Number(profile.expenses ?? 0) || (currentIncomeValue > 0 ? currentIncomeValue * 0.43 : 3500)
    const essentialBase = Math.min(expenseBase, expenseBase * 0.7)
    setRetirementInputs({
      retirement_age: clamp((Number(profile.age) || 40) + 25, 55, 70),
      monthly_expenses: Math.round(expenseBase),
      essential_monthly_expenses: Math.round(essentialBase),
    })
    setRetirementInitialized(true)
  }, [profile, retirementInitialized])

  // â”€â”€ Section 1: PATCH /users/risk â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const saveRiskProfile = useCallback(async () => {
    if (!selectedRisk || !authUser?.user_id) return
    setRiskSaving(true); setRiskError(''); setRiskSaved(false)
    try {
      const res = await fetch(`${API}/users/risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: authUser.user_id, risk_profile: Number(selectedRisk) }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.detail ?? `HTTP ${res.status}`) }
      // Optimistically update hero card without a re-fetch
      setProfile(prev => prev ? { ...prev, risk_profile: Number(selectedRisk) } : prev)
      setRiskSaved(true)
      setTimeout(() => setRiskSaved(false), 3500)
      refreshPage()
    } catch (e) { setRiskError(e.message) }
    finally     { setRiskSaving(false) }
  }, [selectedRisk, authUser?.user_id])

  // â”€â”€ GET /users/:id/recommendations/gpt?limit=3&model=gpt-4.1-mini â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchGptRecs = useCallback(async () => {
    if (!authUser?.user_id) return
    setGptLoading(true); setGptError(''); setGptRecs(null)
    try {
      const res = await fetch(`${API}/users/${authUser.user_id}/recommendations/gpt?limit=3&model=gpt-4.1-mini`)
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.detail ?? `HTTP ${res.status}`) }
      setGptRecs(await res.json())
    } catch (e) { setGptError(e.message) }
    finally     { setGptLoading(false) }
  }, [authUser?.user_id])

  const fetchBenchmarks = useCallback(async () => {
    if (!authUser?.user_id) return
    setBenchmarkLoading(true)
    setBenchmarkError('')
    try {
      const res = await fetch(`${API}/users/${authUser.user_id}/benchmarks`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.detail ?? `HTTP ${res.status}`)
      setBenchmarks(data)
    } catch (err) {
      setBenchmarks(null)
      setBenchmarkError(err.message || 'Could not load peer benchmarks.')
    } finally {
      setBenchmarkLoading(false)
    }
  }, [authUser?.user_id])

  // â”€â”€ Derived values â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const stocks         = portfolio?.stocks  ?? []
  const commodities    = portfolio?.commodities ?? []
  const cryptos        = portfolio?.cryptos ?? []
  const manualAssets   = profile?.manual_assets ?? []
  const liabilityItems = profile?.liability_items ?? []
  const incomeStreams  = profile?.income_streams ?? []
  const allHoldings    = [
    ...stocks.map(h => ({ ...h, type:'Stock' })),
    ...commodities.map(h => ({ ...h, type:'Commodity' })),
    ...cryptos.map(h => ({ ...h, type:'Crypto' })),
  ]
  const stocksValue    = stocks.reduce((s,h)  => s + (h.market_value ?? 0), 0)
  const commoditiesValue = commodities.reduce((s,h) => s + (h.market_value ?? 0), 0)
  const cryptosValue   = cryptos.reduce((s,h) => s + (h.market_value ?? 0), 0)
  const portfolioValue = stocksValue + commoditiesValue + cryptosValue
  const manualAssetGroups = manualAssets.reduce((groups, item) => {
    const key = item.category || 'other'
    if (key === 'banks') return groups
    if (!groups[key]) {
      groups[key] = {
        key,
        icon: key === 'real_estate' ? '🏠' : key === 'business' ? '🏢' : key === 'private_asset' ? '🧾' : '🗂️',
        name: startCase(key),
        color: key === 'real_estate' ? 'var(--gold)' : key === 'business' ? 'var(--purple)' : 'var(--teal)',
        total: 0,
      }
    }
    groups[key].total += Number(item.value || 0)
    return groups
  }, {})
  const manualAssetRows = Object.values(manualAssetGroups)
  const manualAssetTotal = manualAssetRows.reduce((sum, item) => sum + item.total, 0)
  const cashBalance = Number(profile?.cash_balance ?? 0)
  const totalAUM       = portfolioValue + (profile?.cash_balance ?? 0)
  const positionCount  = stocks.length + commodities.length + cryptos.length
  const currentIncome  = incomeStreams.length
    ? incomeStreams.reduce((sum, item) => sum + Number(item.monthly_amount || 0), 0)
    : Number(profile?.income ?? 0)
  const wellness       = profile?.wellness_metrics ?? {}
  const behavioralResilienceScore =
    profile?.behavioral_resilience_score
    ?? profile?.financial_resilience_score
    ?? wellness?.behavioral_resilience_score
    ?? wellness?.financial_resilience_score
    ?? null
  const behavioralResilienceSummary =
    profile?.resilience_summary
    ?? wellness?.resilience_summary
    ?? ''
  const behavioralResilienceConfidence =
    profile?.confidence
    ?? wellness?.confidence
    ?? null
  const behavioralResilienceBreakdown =
    profile?.resilience_breakdown
    ?? wellness?.resilience_breakdown
    ?? {}
  const behavioralResilienceInsights =
    profile?.action_insights
    ?? wellness?.action_insights
    ?? []
  const behavioralResilienceDerived =
    profile?.derived_metrics
    ?? wellness?.derived_metrics
    ?? {}
  const wellnessScore  = profile?.financial_wellness_score ?? 0
  const stressIndex    = profile?.financial_stress_index   ?? null
  const netWorth       = profile?.net_worth ?? null
  const [trendRange, setTrendRange] = useState('6M')
  const [trendView, setTrendView] = useState('combined')
  const [showTrendInfo, setShowTrendInfo] = useState(false)

  const compositionBase = portfolioValue + manualAssetTotal + cashBalance
  const COMPOSITION_REAL = [
    compositionBase > 0 && stocksValue > 0 && { icon:'📈', name:'Equities (Stocks)', pct:Math.round(stocksValue  / compositionBase * 100), val:fmt$(stocksValue),  color:'var(--blue)' },
    compositionBase > 0 && commoditiesValue > 0 && { icon:'🪙', name:'Commodities', pct:Math.round(commoditiesValue / compositionBase * 100), val:fmt$(commoditiesValue), color:'#d4a63a' },
    compositionBase > 0 && cryptosValue > 0 && { icon:'₿',  name:'Digital Assets', pct:Math.round(cryptosValue / compositionBase * 100), val:fmt$(cryptosValue), color:'var(--teal)' },
    compositionBase > 0 && cashBalance > 0 && { icon:'🏦', name:'Cash / Banks', pct:Math.round(cashBalance / compositionBase * 100), val:fmt$(cashBalance), color:'#7dd3fc' },
    ...manualAssetRows.map(item => ({
      icon: item.icon,
      name: item.name,
      pct: compositionBase > 0 ? Math.round(item.total / compositionBase * 100) : 0,
      val: fmt$(item.total),
      color: item.color,
    })),
    currentIncome > 0 && { icon:'🏛️', name:'Fixed Income', pct:null, val:`${fmt$(currentIncome)} / mo`, color:'var(--purple)', special:'income' },
  ].filter(Boolean)

  const gptPayload = gptRecs?.gpt_recommendations ?? gptRecs?.recommendations ?? gptRecs ?? null
  const gptSummary = toText(gptPayload?.summary)
  const gptTopRecs = toArray(gptPayload?.top_recommendations).length
    ? toArray(gptPayload?.top_recommendations)
    : (Array.isArray(gptPayload) ? gptPayload : [])
  const gptScenarios = gptPayload && typeof gptPayload?.scenario_insights === 'object' && !Array.isArray(gptPayload.scenario_insights)
    ? gptPayload.scenario_insights
    : null
  const gptNextSteps = toArray(gptPayload?.immediate_next_steps)
  const scenarioCards = [
    { key:'bullish_case', label:'Bullish Case', text:gptScenarios?.bullish_case, color:'var(--green)' },
    { key:'base_case', label:'Base Case', text:gptScenarios?.base_case, color:'var(--gold)' },
    { key:'bearish_case', label:'Bearish Case', text:gptScenarios?.bearish_case, color:'var(--red)' },
  ].filter(item => toText(item.text))
  const activeScenario = scenarioCards.find(item => item.key === selectedScenario) ?? scenarioCards[0] ?? null
  const visibleTopRecs = analysisMode === 'lite' ? gptTopRecs.slice(0, 2) : gptTopRecs
  const visibleInsightTiles = [
    {
      label:'Wellness score',
      value:Math.round(wellnessScore),
      valueColor:insightTone(wellnessScore).color,
      sub:insightTone(wellnessScore).label,
    },
    {
      label:'Action count',
      value:gptTopRecs.length || gptNextSteps.length || 0,
      valueColor:'var(--teal)',
      sub:'Recommended near-term moves',
    },
  ]
  const exportComprehensivePdf = useCallback(() => {
    const lines = [
      'Unova Comprehensive Portfolio Analysis',
      '',
      `Generated for: ${profile?.name ?? authUser?.username}`,
      `Wellness Score: ${Math.round(wellnessScore)} (${insightTone(wellnessScore).label})`,
      `Risk Profile: ${riskLabelFromValue(profile?.risk_profile) || 'Unavailable'}`,
      '',
      'Portfolio Outlook',
      ...wrapPdfText(gptSummary || 'No summary returned.'),
      '',
      'Top Recommendations',
    ]

    if (gptTopRecs.length === 0) lines.push('No recommendations returned.')
    gptTopRecs.forEach((rec, index) => {
      const title = rec.title ?? rec.symbol ?? rec.asset ?? `Recommendation ${index + 1}`
      const body = rec.action ?? rec.message ?? rec.description ?? rec.reason ?? rec.why ?? rec.body
      lines.push(`${index + 1}. ${title}`)
      wrapPdfText(body || 'No recommendation detail returned.', 82).forEach(line => lines.push(`   ${line}`))
      lines.push('')
    })

    if (scenarioCards.length) {
      lines.push('Scenario Insights')
      scenarioCards.forEach(item => {
        lines.push(item.label)
        wrapPdfText(item.text || 'No scenario detail returned.', 82).forEach(line => lines.push(`   ${line}`))
        lines.push('')
      })
    }

    if (gptNextSteps.length) {
      lines.push('Next 30 Days')
      gptNextSteps.forEach((step, index) => {
        wrapPdfText(`${index + 1}. ${step}`, 84).forEach(line => lines.push(line))
      })
    }

    const blob = buildSimplePdf(lines)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `wealthsphere-analysis-${(profile?.name ?? authUser?.username ?? 'user').toLowerCase().replace(/\s+/g, '-')}.pdf`
    link.click()
    URL.revokeObjectURL(url)
  }, [authUser?.username, gptNextSteps, gptSummary, gptTopRecs, profile?.name, profile?.risk_profile, scenarioCards, wellnessScore])
  const gptText = !gptSummary && gptTopRecs.length === 0 && !gptScenarios && gptNextSteps.length === 0 && gptRecs
    ? (typeof gptPayload === 'string'
        ? gptPayload
        : gptPayload?.message ?? gptPayload?.recommendation ?? gptPayload?.content ?? JSON.stringify(gptPayload, null, 2))
    : null

  const currentMap = {
    combined: netWorth ?? totalAUM,
    stocks: stocksValue,
    commodities: commoditiesValue,
    crypto: cryptosValue,
  }

  const trendPayload = useMemo(() => {
    return buildTrendSeriesFromHistory({
      history: portfolioHistory,
      periodKey: trendRange,
      viewKey: trendView,
      fallbackCurrent: currentMap[trendView] ?? (netWorth ?? totalAUM),
    })
  }, [portfolioHistory, trendRange, trendView, netWorth, totalAUM, stocksValue, commoditiesValue, cryptosValue])

  const trendComparisons = useMemo(() => {
    const comparisonColors = {
      combined: '#8b5cf6',
      stocks: '#6d8df7',
      commodities: '#e4a04f',
      crypto: '#2ab8a3',
    }

    return Object.keys(currentMap)
      .filter(key => key !== trendView)
      .map(key => ({
        key,
        color: comparisonColors[key],
        points: buildTrendSeriesFromHistory({
          history: portfolioHistory,
          periodKey: trendRange,
          viewKey: key,
          fallbackCurrent: currentMap[key] ?? 0,
        }).points,
      }))
  }, [portfolioHistory, trendRange, trendView, currentMap])

  const trendTone = trendPayload.change >= 0 ? 'up' : 'down'
  const trendTitleMap = {
    combined: 'Combined Net Worth',
    stocks: 'Stocks Value',
    commodities: 'Commodities Value',
    crypto: 'Crypto Value',
  }
  const trendDescMap = {
    combined: 'Daily combined net worth across cash, liabilities, and invested assets.',
    stocks: 'Daily equity value across your stock holdings.',
    commodities: 'Daily commodity exposure value across your commodity positions.',
    crypto: 'Daily digital-asset value across your crypto holdings.',
  }
  const wrappedYear = new Date().getFullYear() - 1
  const wrappedData = useMemo(() => buildFinancialWrapped({
    userId: authUser?.user_id,
    profile,
    stocks,
    allHoldings,
    year: wrappedYear,
  }), [authUser?.user_id, profile, stocks, allHoldings, wrappedYear])
  const exportWrappedPdf = useCallback(async () => {
    const ownerName = profile?.name ?? authUser.username
    const html = buildWrappedPrintHtml({
      ownerName,
      year: wrappedData.year,
      slides: wrappedData.slides,
    })
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    const styleMarkup = parsed.head.innerHTML
    const bodyMarkup = parsed.body.innerHTML

    const host = document.createElement('div')
    host.style.position = 'fixed'
    host.style.left = '-10000px'
    host.style.top = '0'
    host.style.width = '794px'
    host.style.background = '#eef2ff'
    host.style.zIndex = '-1'
    host.innerHTML = `${styleMarkup}${bodyMarkup}`
    document.body.appendChild(host)

    try {
      if (document.fonts?.ready) await document.fonts.ready
      await new Promise(resolve => window.requestAnimationFrame(() => resolve()))

      const canvas = await html2canvas(host, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#eef2ff',
        width: host.scrollWidth,
        height: host.scrollHeight,
        windowWidth: host.scrollWidth,
        windowHeight: host.scrollHeight,
      })

      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidthMm = 210
      const pageHeightMm = 297
      const pageHeightPx = Math.floor((canvas.width * pageHeightMm) / pageWidthMm)
      let offsetY = 0
      let pageIndex = 0

      while (offsetY < canvas.height) {
        const sliceHeight = Math.min(pageHeightPx, canvas.height - offsetY)
        const pageCanvas = document.createElement('canvas')
        pageCanvas.width = canvas.width
        pageCanvas.height = sliceHeight
        const pageContext = pageCanvas.getContext('2d')
        if (!pageContext) break
        pageContext.drawImage(
          canvas,
          0,
          offsetY,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight,
        )

        const imageData = pageCanvas.toDataURL('image/png')
        const imageHeightMm = (sliceHeight * pageWidthMm) / canvas.width
        if (pageIndex > 0) pdf.addPage()
        pdf.addImage(imageData, 'PNG', 0, 0, pageWidthMm, imageHeightMm)
        offsetY += sliceHeight
        pageIndex += 1
      }

      pdf.save(`unova-wrapped-${wrappedData.year}-${ownerName.toLowerCase().replace(/\s+/g, '-')}.pdf`)
    } finally {
      document.body.removeChild(host)
    }
  }, [authUser.username, profile?.name, wrappedData])
  const openFinancialModal = useCallback((tab) => {
    setFinancialTab(tab)
    setFinancialModalOpen(true)
  }, [])
  const submitFinancialItem = useCallback(async (tab, payload) => {
    if (!authUser?.user_id) return
    setFinancialBusy(true)
    setError('')
    try {
      const isPortfolioAssetCreate = tab === 'assets' && ['stock', 'crypto', 'commodity'].includes(String(payload?.category || '').toLowerCase())
      const endpointMap = { assets:'assets', liabilities:'liabilities', income:'income' }
      const url = isPortfolioAssetCreate
        ? `${API}/users/${authUser.user_id}/financials/portfolio`
        : `${API}/users/${authUser.user_id}/financials/${endpointMap[tab]}`
      const body = isPortfolioAssetCreate
        ? JSON.stringify({
            symbol: payload?.symbol || payload?.label,
            asset_class: payload?.category,
            qty: Number(payload?.value || 0),
            avg_price: null,
            name: payload?.symbol || payload?.label,
          })
        : JSON.stringify(payload)
      const res = await fetch(url, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      if (data.user) setProfile(data.user)
      refreshPage()
    } catch (err) {
      setError(err.message || 'Could not save financial item.')
    } finally {
      setFinancialBusy(false)
    }
  }, [authUser?.user_id])
  const removeFinancialItem = useCallback(async (tab, itemId, itemMeta = null) => {
    if (!authUser?.user_id) return
    setFinancialBusy(true)
    setError('')
    try {
      let res
      if (tab === 'assets' && itemMeta?.source === 'portfolio') {
        const bucket = itemMeta?.asset_class
        const symbol = String(itemMeta?.symbol || '').trim()
        if (!symbol || !bucket) throw new Error('Missing holding symbol for removal.')
        res = await fetch(`${API}/users/${authUser.user_id}/financials/portfolio/${bucket}/${encodeURIComponent(symbol)}`, {
          method:'DELETE',
        })
      } else {
        const endpointMap = { assets:'assets', liabilities:'liabilities', income:'income' }
        res = await fetch(`${API}/users/${authUser.user_id}/financials/${endpointMap[tab]}/${itemId}`, {
          method:'DELETE',
        })
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      if (data.user) setProfile(data.user)
      refreshPage()
    } catch (err) {
      setError(err.message || 'Could not remove financial item.')
    } finally {
      setFinancialBusy(false)
    }
  }, [authUser?.user_id])

  useEffect(() => {
    if (!authUser?.user_id) {
      setDisplayCurrency('USD')
      return
    }
    fetch(`${API}/users/profile/details/${authUser.user_id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const code = normalizeCurrencyCode(data?.profile?.currency || 'USD')
        setDisplayCurrency(code)
      })
      .catch(() => {
        setDisplayCurrency('USD')
      })
  }, [authUser?.user_id])

  const refreshPortfolioPrices = useCallback(async () => {
    if (!authUser?.user_id || priceRefreshing) return
    setPriceRefreshing(true)
    setError('')
    try {
      const res = await fetch(`${API}/update/prices/portfolio`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail ?? `HTTP ${res.status}`)
      }
      await fetch(`${API}/update/wellness`).catch(() => null)
      refreshPage()
    } catch (err) {
      setError(err.message || 'Could not refresh live prices.')
    } finally {
      setPriceRefreshing(false)
    }
  }, [authUser?.user_id, priceRefreshing])

  const fetchRetirementPlan = useCallback(async () => {
    if (!authUser?.user_id || !retirementInitialized) return
    setRetirementLoading(true)
    setRetirementError('')
    try {
      const res = await fetch(`${API}/users/${authUser.user_id}/retirement`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify(retirementInputs),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(parseApiError(err?.detail, `HTTP ${res.status}`))
      }
      const data = await res.json()
      setRetirementPlan(data)
    } catch (err) {
      setRetirementError(err.message || 'Could not build retirement plan.')
    } finally {
      setRetirementLoading(false)
    }
  }, [authUser?.user_id, retirementInitialized, retirementInputs])

  useEffect(() => {
    if (!retirementInitialized || !authUser?.user_id) return
    fetchRetirementPlan()
  // Initial seeded load only. Manual edits refresh through the card button.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retirementInitialized, authUser?.user_id])

  useEffect(() => {
    if (!benchmarkOpen || !authUser?.user_id || !profile) return
    fetchBenchmarks()
  }, [benchmarkOpen, authUser?.user_id, profile?.age, profile?.income, profile?.net_worth, fetchBenchmarks])

  // Is current selection different from what's saved?
  const riskChanged = selectedRisk && selectedRisk !== String(normalizeRiskScore(profile?.risk_profile) ?? '')
  const retirementSummary = retirementStatus(retirementPlan)
  const retirementProgress = retirementPlan?.target_retirement_fund
    ? clamp((Number(retirementPlan.projected_value_at_retirement || 0) / Number(retirementPlan.target_retirement_fund || 1)) * 100, 0, 100)
    : 0
  const retirementGap = Number(retirementPlan?.projected_gap_at_retirement || 0)
  const retirementRecommendedMix = retirementTopMix(retirementPlan)

  if (!authUser) {
    const DEMO_HOLDINGS = [
      { name:'Apple Inc.',       symbol:'AAPL',  type:'Stock',     value: 42800, pct: 17.3, change:+2.14, color:'#60a5fa' },
      { name:'Microsoft Corp.',  symbol:'MSFT',  type:'Stock',     value: 38500, pct: 15.6, change:+0.87, color:'#60a5fa' },
      { name:'Costco Wholesale', symbol:'COST',  type:'Stock',     value: 31200, pct: 12.6, change:-0.43, color:'#60a5fa' },
      { name:'Bitcoin',          symbol:'BTC',   type:'Crypto',    value: 28900, pct: 11.7, change:+4.22, color:'#2dd4bf' },
      { name:'Ethereum',         symbol:'ETH',   type:'Crypto',    value: 19400, pct:  7.8, change:+2.91, color:'#2dd4bf' },
      { name:'Gold (XAU)',       symbol:'XAU',   type:'Commodity', value: 35600, pct: 14.4, change:+0.31, color:'#fbbf24' },
      { name:'Silver (XAG)',     symbol:'XAG',   type:'Commodity', value: 21400, pct:  8.6, change:-0.19, color:'#fbbf24' },
    ]
    const DEMO_ALLOC = [
      { label:'Stocks',     pct:45.5, color:'#60a5fa' },
      { label:'Commodities',pct:23.0, color:'#fbbf24' },
      { label:'Crypto',     pct:19.5, color:'#2dd4bf' },
      { label:'Cash',       pct:12.0, color:'#94a3b8' },
    ]
    return (
      <div style={{ minHeight:'100vh', background:'var(--bg)' }}>
        <style>{`@keyframes profileFadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }`}</style>
        <Navbar />
        <main style={{ paddingTop:110, paddingBottom:60, paddingLeft:48, paddingRight:48, maxWidth:1400, margin:'0 auto' }}>

          {/* Demo banner */}
          <div style={{ display:'flex', alignItems:'center', gap:14, background:'rgba(201,168,76,0.08)', border:'1px solid rgba(201,168,76,0.28)', borderRadius:12, padding:'12px 20px', marginBottom:28, animation:'profileFadeUp 0.5s ease both' }}>
            <span style={{ fontSize:'1.1rem' }}>👁️</span>
            <div style={{ flex:1, fontFamily:'var(--font-mono)', fontSize:'0.78rem', color:'var(--text-dim)' }}>
              You're viewing a <strong style={{ color:'var(--gold)' }}>demo portfolio</strong>. Sign in or create an account to see your real holdings.
            </div>
            <button
              onClick={() => navigate('/login')}
              style={{ background:'var(--gold)', border:'none', color:'var(--btn-text-on-gold)', padding:'8px 20px', borderRadius:8, fontFamily:'var(--font-display)', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}
            >
              Sign In →
            </button>
          </div>

          {/* Hero card */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:'28px 32px', display:'flex', alignItems:'center', gap:28, marginBottom:24, flexWrap:'wrap', animation:'profileFadeUp 0.5s ease 0.05s both' }}>
            <div style={{ position:'relative', flexShrink:0 }}>
              <div style={{ width:72, height:72, borderRadius:'50%', background:'linear-gradient(135deg,var(--gold),var(--teal))', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.4rem', color:'var(--btn-text-on-gold)' }}>JD</div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.4rem', marginBottom:6 }}>Jamie Demo</div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                <span style={{ background:'var(--surface2)', border:'1px solid rgba(201,168,76,0.3)', borderRadius:20, padding:'4px 12px', fontSize:'0.74rem', color:'var(--gold)' }}>⚖️ Balanced Risk</span>
                <span style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:20, padding:'4px 12px', fontSize:'0.74rem', color:'var(--text-dim)' }}>7 Positions</span>
                <span style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:20, padding:'4px 12px', fontSize:'0.74rem', color:'var(--text-dim)' }}>3 Asset Classes</span>
              </div>
            </div>
            <div style={{ display:'flex', gap:32, flexWrap:'wrap' }}>
              {[['$247,500','Total AUM','var(--gold)'],['$235,800','Portfolio Value','var(--green)'],['$11,700','Cash Balance','var(--teal)']].map(([v,l,c]) => (
                <div key={l} style={{ textAlign:'right' }}>
                  <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.15rem', color:c }}>{v}</div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Two-column: stats + allocation */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:24, animation:'profileFadeUp 0.5s ease 0.1s both' }}>
            {/* Wellness / stats */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:'24px 28px' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', textTransform:'uppercase', letterSpacing:'0.14em', color:'var(--teal)', marginBottom:16 }}>Wellness Score</div>
              <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:12 }}>
                <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'2.8rem', color:'var(--gold)' }}>74</span>
                <span style={{ color:'var(--text-faint)', fontSize:'1rem' }}>/ 100</span>
                <span style={{ marginLeft:8, background:'rgba(212,166,58,0.12)', border:'1px solid rgba(212,166,58,0.3)', borderRadius:20, padding:'3px 10px', fontSize:'0.74rem', color:'#d4a63a' }}>On Track</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:16 }}>
                {[['Unrealised P&L','+$18,240','var(--green)'],['P&L %','+7.96%','var(--green)'],['Positions','7','var(--gold)'],['Stress Index','32 / 100','var(--teal)']].map(([l,v,c]) => (
                  <div key={l} style={{ background:'var(--surface2)', borderRadius:10, padding:'12px 14px' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>{l}</div>
                    <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.95rem', color:c }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* Allocation */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:'24px 28px' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', textTransform:'uppercase', letterSpacing:'0.14em', color:'var(--teal)', marginBottom:16 }}>Allocation Breakdown</div>
              {DEMO_ALLOC.map(a => (
                <div key={a.label} style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.75rem', color:'var(--text-dim)' }}>{a.label}</span>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.75rem', color:a.color, fontWeight:700 }}>{a.pct}%</span>
                  </div>
                  <div style={{ height:6, borderRadius:99, background:'var(--surface2)', overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${a.pct}%`, background:a.color, borderRadius:99 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Holdings table */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, overflow:'hidden', animation:'profileFadeUp 0.5s ease 0.15s both' }}>
            <div style={{ padding:'20px 28px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', textTransform:'uppercase', letterSpacing:'0.14em', color:'var(--teal)' }}>Holdings</div>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--text-faint)' }}>Demo data</span>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border)' }}>
                  {['Asset','Type','Market Value','Allocation','24h Change'].map(h => (
                    <th key={h} style={{ padding:'10px 24px', textAlign: h==='Asset'?'left':'right', fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DEMO_HOLDINGS.map((h, i) => (
                  <tr key={h.symbol} style={{ borderBottom: i < DEMO_HOLDINGS.length-1 ? '1px solid var(--border)' : 'none', opacity: 0.92 }}>
                    <td style={{ padding:'13px 24px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                        <div style={{ width:34, height:34, borderRadius:10, background:`${h.color}18`, border:`1px solid ${h.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-mono)', fontSize:'0.65rem', color:h.color, fontWeight:700 }}>{h.symbol.slice(0,3)}</div>
                        <div>
                          <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.88rem' }}>{h.symbol}</div>
                          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', color:'var(--text-faint)' }}>{h.name}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:'13px 24px', textAlign:'right' }}>
                      <span style={{ background:`${h.color}18`, border:`1px solid ${h.color}44`, borderRadius:20, padding:'3px 10px', fontFamily:'var(--font-mono)', fontSize:'0.65rem', color:h.color }}>{h.type}</span>
                    </td>
                    <td style={{ padding:'13px 24px', textAlign:'right', fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.9rem' }}>${h.value.toLocaleString()}</td>
                    <td style={{ padding:'13px 24px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.8rem', color:'var(--text-dim)' }}>{h.pct}%</td>
                    <td style={{ padding:'13px 24px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.8rem', fontWeight:700, color: h.change >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {h.change >= 0 ? '+' : ''}{h.change}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* CTA footer */}
          <div style={{ textAlign:'center', marginTop:40, padding:'36px 32px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, animation:'profileFadeUp 0.5s ease 0.2s both' }}>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.3rem', marginBottom:10 }}>Ready to track your <span style={{ background:'linear-gradient(135deg,var(--gold),var(--teal))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>real portfolio?</span></div>
            <div style={{ color:'var(--text-dim)', fontSize:'0.88rem', marginBottom:24 }}>Sign in to connect your holdings and get personalised insights.</div>
            <div style={{ display:'flex', gap:14, justifyContent:'center', flexWrap:'wrap' }}>
              <button onClick={() => navigate('/login')} style={{ background:'var(--gold)', border:'none', color:'var(--btn-text-on-gold)', padding:'12px 32px', borderRadius:10, fontFamily:'var(--font-display)', fontSize:'0.9rem', fontWeight:700, cursor:'pointer', boxShadow:'0 10px 24px rgba(17,24,39,0.16)' }}>Sign In</button>
              <button onClick={() => navigate('/survey')} style={{ background:'transparent', border:'1px solid rgba(45,212,191,0.4)', color:'var(--teal)', padding:'12px 28px', borderRadius:10, fontFamily:'var(--font-display)', fontSize:'0.9rem', fontWeight:600, cursor:'pointer' }}>Start Onboarding →</button>
            </div>
          </div>

        </main>
      </div>
    )
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)' }}>
      {/* <TickerBar style={{ position:'fixed', top:0, left:0, right:0, zIndex:102 }} /> */}
      <Navbar />

      {/* Keyframes injected once */}
      <style>{`
        @keyframes profileSpin    { to { transform: rotate(360deg) } }
        @keyframes profileFadeUp  { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes profilePulse   { 0%,100% { opacity:0.4 } 50% { opacity:1 } }
        @keyframes spinSlow       { to { transform: rotate(360deg) } }
        @keyframes sectionIn      { from { opacity:0; transform:translateY(28px); filter:blur(3px) } to { opacity:1; transform:translateY(0); filter:blur(0) } }
      `}</style>

      <main style={{ paddingTop:110, paddingBottom:60, paddingLeft:48, paddingRight:48, maxWidth:1400, margin:'0 auto' }}>

        {/* Page header */}
        <div style={{ ...s.topbar, animation:'sectionIn 0.5s ease both' }}>
          <div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--teal)', textTransform:'uppercase', letterSpacing:'0.2em', marginBottom:8, display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:24, height:1, background:'var(--teal)', opacity:0.5 }}/>Personal Finance<div style={{ width:24, height:1, background:'var(--teal)', opacity:0.5 }}/>
            </div>
            <div style={s.pageTitle}><span style={{ background:'linear-gradient(135deg,var(--gold-light),var(--gold),var(--teal))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Portfolio</span></div>
          </div>
          <div style={{ display:'flex', gap:14, alignItems:'center' }}>
            {!loading && profile && <div style={{ ...s.badgePill, borderColor:'rgba(201,168,76,0.25)', color:'var(--gold)' }}>Wellness {Math.round(wellnessScore)}/100</div>}
          </div>
        </div>

        {error && (
          <div style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:12, padding:'14px 20px', color:'var(--red)', marginBottom:24, fontFamily:'var(--font-mono)', fontSize:'0.82rem' }}>{error}</div>
        )}

        {/* Hero card */}
        <div style={{ ...s.heroCard, animation:'sectionIn 0.5s ease both', animationDelay:'0.08s' }}>
          <div style={s.avatarWrap}>
            <div style={s.avatar}>{profile ? initials(profile.name) : initials(authUser?.username)}</div>
            <div style={s.avatarRing} />
          </div>
          <div style={{ flex:1 }}>
            <div style={s.userName}>{profile?.name ?? authUser?.username}</div>
            <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:12 }}>
              {[['var(--teal)','Individual Investor'],['var(--gold)', riskLabelFromValue(profile?.risk_profile) ? `Risk: ${riskLabelFromValue(profile?.risk_profile)}` : 'Risk: —']].map(([c,t]) => (
                <span key={t} style={{ display:'flex', alignItems:'center', gap:6, fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-dim)' }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:c }}/>{t}
                </span>
              ))}
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {riskLabelFromValue(profile?.risk_profile) && <span style={{ background:'var(--surface2)', border:'1px solid rgba(201,168,76,0.3)', borderRadius:20, padding:'4px 12px', fontSize:'0.74rem', color:'var(--gold)' }}>{riskLabelFromValue(profile?.risk_profile)} Risk</span>}
              <span style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:20, padding:'4px 12px', fontSize:'0.74rem', color:'var(--text-dim)' }}>{positionCount} Position{positionCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:28, flexWrap:'wrap' }}>
            {[
              [loading ? '...' : fmt$(totalAUM),                               'Total AUM',       'var(--gold)'],
              [loading ? '...' : fmt$(profile?.portfolio_value ?? portfolioValue),'Portfolio Value','var(--green)'],
              [loading ? '...' : fmt$(profile?.cash_balance),                   'Cash Balance',   'var(--teal)'],
            ].map(([v,l,c]) => (
              <div key={l} style={{ textAlign:'right' }}>
                <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.15rem', color:c }}>{v}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{l}</div>
              </div>
            ))}
            <div style={{ textAlign:'right', opacity:0.45 }}>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.15rem', color:'var(--text-faint)' }}>—</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.08em', display:'flex', alignItems:'center', gap:4 }}>YTD Return<FutureTag /></div>
            </div>
          </div>
        </div>

        <div style={{ ...s.card, marginBottom:24, padding:'22px 24px 18px', animation:'sectionIn 0.5s ease both', animationDelay:'0.16s', position:'relative' }}>
          {showTrendInfo && (
            <div style={{ ...s.hoverHint, top:90, right:24, maxWidth:340 }}>
              Real estate is excluded from this trend so large, infrequently updated property values do not flatten the rest of the portfolio movement and skew the chart.
            </div>
          )}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap', marginBottom:18 }}>
            <div>
              <div style={{ ...s.secLabel, justifyContent:'flex-start', gap:8 }}>
                <span>{trendTitleMap[trendView]} Trend</span>
                {trendView === 'combined' && (
                  <button
                    type="button"
                    aria-label="Why real estate is excluded from this chart"
                    onMouseEnter={() => setShowTrendInfo(true)}
                    onMouseLeave={() => setShowTrendInfo(false)}
                    onFocus={() => setShowTrendInfo(true)}
                    onBlur={() => setShowTrendInfo(false)}
                    style={s.infoDot}
                  >
                    i
                  </button>
                )}
              </div>
              <div style={{ display:'flex', alignItems:'baseline', gap:14, flexWrap:'wrap', marginTop:6 }}>
                <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'2rem', lineHeight:1 }}>
                  {fmt$(trendPayload.latest)}
                </div>
                <div style={{ color:trendTone === 'up' ? 'var(--green)' : 'var(--red)', fontFamily:'var(--font-mono)', fontSize:'0.8rem' }}>
                  {trendPayload.change >= 0 ? '+' : ''}{fmt$(trendPayload.change)} · {trendRange}
                </div>
              </div>
              <div style={{ marginTop:8, fontSize:'0.8rem', color:'var(--text-dim)', lineHeight:1.6, maxWidth:560 }}>
                {trendDescMap[trendView]}
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:18 }}>
                {['1M', '3M', '6M', '1Y', 'ALL'].map(range => (
                  <button
                    key={range}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => {
                      setTrendRange(range)
                      e.currentTarget.blur()
                    }}
                    style={{ ...s.rangeTab, ...(trendRange === range ? s.rangeTabActive : {}) }}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
              {[
                ['combined', 'Combined'],
                ['stocks', 'Stocks'],
                ['commodities', 'Commodities'],
                ['crypto', 'Crypto'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onMouseDown={e => e.preventDefault()}
                  onClick={e => {
                    setTrendView(key)
                    e.currentTarget.blur()
                  }}
                  style={{ ...s.rangeTab, ...(trendView === key ? s.rangeTabActive : {}) }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={s.trendPanel}>
            <TrendChart
              points={trendPayload.points}
              tone={trendTone}
              valueLabel={trendTitleMap[trendView]}
              comparisons={trendComparisons}
            />
            <div style={s.trendFooter}>
              <span>{trendTitleMap[trendView]} · {trendPayload.labels[0]}</span>
              <span>{trendPayload.labels[1]}</span>
            </div>
          </div>
        </div>

        {/* Row 1: Wellness + Composition */}
        <div style={{ ...s.twoCol, animation:'sectionIn 0.5s ease both', animationDelay:'0.24s' }}>
          <div style={{ ...s.card, position:'relative' }}>
            <div style={s.secLabel}>Financial Wellness Score</div>
            {wellnessHint && (
              <div style={s.hoverHint}>
                {wellnessHint}
              </div>
            )}
            {loading ? <LoadingPulse /> : (
              <div style={{ display:'flex', alignItems:'center', gap:24 }}>
                <WellnessRing score={wellnessScore} />
                <div style={{ flex:1 }}>
                  {[
                    { label:'Diversification', val:wellness.diversification_score, color:'var(--green)', hint:'How spread out your money is, so you are not relying too much on one asset.' },
                    { label:'Liquidity',        val:wellness.liquidity_score,       color:'var(--blue)', hint:'How easily you can access cash for bills, emergencies, or short-term needs.' },
                    { label:'Debt / Income',    val:wellness.debt_income_score,     color:'var(--orange)', hint:'How manageable your debt is compared with the income you bring in.' },
                  ].map(w => (
                    <div
                      key={w.label}
                      style={{ marginBottom:12 }}
                      onMouseEnter={() => setWellnessHint(w.hint)}
                      onMouseLeave={() => setWellnessHint(null)}
                    >
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                        <span style={{ fontSize:'0.87rem', fontWeight:500, color:'var(--text)' }}>{w.label}</span>
                        <span style={{ fontFamily:'var(--font-display)', fontSize:'0.87rem', fontWeight:700, color:'var(--text)' }}>{w.val != null ? Math.round(w.val) : '—'}</span>
                      </div>
                      <div style={{ height:5, background:'var(--surface2)', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${Math.min(w.val ?? 0, 100)}%`, background:w.color, borderRadius:3 }} />
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    style={{ marginBottom:12, display:'block', width:'100%', padding:0, background:'transparent', border:'none', textAlign:'left', cursor:behavioralResilienceScore != null ? 'pointer' : 'default' }}
                    onClick={() => behavioralResilienceScore != null && setBehavioralResilienceOpen(true)}
                    onMouseEnter={() => setWellnessHint('How likely you are to stay calm and avoid panic decisions when markets swing.')}
                    onMouseLeave={() => setWellnessHint(null)}
                    aria-label="Open behavioral resilience details"
                    title="Open behavioral resilience details"
                  >
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                      <span style={{ fontSize:'0.87rem', fontWeight:500, color:'var(--text)' }}>Behavioural Resilience</span>
                      <span style={{ fontFamily:'var(--font-display)', fontSize:'0.87rem', fontWeight:700, color:'var(--text)' }}>
                        {behavioralResilienceScore != null ? Math.round(behavioralResilienceScore) : '—'}
                      </span>
                    </div>
                    <div style={{ height:5, background:'var(--surface2)', borderRadius:3, overflow:'hidden' }}>
                      <div
                        style={{
                          height:'100%',
                          width:`${Math.min(behavioralResilienceScore ?? 0, 100)}%`,
                          background:'#9fbce8',
                          borderRadius:3,
                        }}
                      />
                    </div>
                  </button>
                  <FutureBar
                    label="Currency Exposure"
                    onHoverChange={active => setWellnessHint(active ? 'How much exchange-rate moves could affect your portfolio if you hold assets in different currencies.' : null)}
                  />
                  <FutureBar
                    label="Volatility Buffer"
                    onHoverChange={active => setWellnessHint(active ? 'How much protection you have against sudden market ups and downs.' : null)}
                  />
                </div>
              </div>
            )}
          </div>

          <div style={s.card}>
            <div style={s.secLabel}>
              Portfolio Composition
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
                <button type="button" onClick={() => openFinancialModal('assets')} style={s.compBtnAsset}>Edit Assets</button>
                <button type="button" onClick={() => openFinancialModal('liabilities')} style={s.compBtnLiability}>Edit Liabilities</button>
                <button type="button" onClick={() => openFinancialModal('income')} style={s.compBtnIncome}>Edit Income</button>
              </div>
            </div>
            {loading ? <LoadingPulse /> : (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {COMPOSITION_REAL.map(c => (
                  <div key={c.name} style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:36, height:36, borderRadius:10, background:`${c.color}20`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>{c.icon}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:500, fontSize:'0.87rem', marginBottom:4 }}>
                        {c.name}
                        {c.special === 'placeholder' && <FutureTag />}
                      </div>
                      {c.special === 'income' ? (
                        <div style={{ fontSize:'0.72rem', color:'var(--text-faint)', fontFamily:'var(--font-mono)' }}>
                          Current monthly income across {incomeStreams.length || 1} stream{(incomeStreams.length || 1) !== 1 ? 's' : ''}
                        </div>
                      ) : c.special === 'placeholder' ? (
                        <div style={{ height:4, background:'var(--surface2)', borderRadius:2, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:'40%', background:'rgba(96,165,250,0.25)', borderRadius:2 }} />
                        </div>
                      ) : (
                        <div style={{ height:4, background:'var(--surface2)', borderRadius:2, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${c.pct}%`, background:c.color, borderRadius:2 }} />
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.78rem' }}>
                        {c.special === 'income' ? 'Monthly' : c.special === 'placeholder' ? '—' : `${c.pct}%`}
                      </div>
                      <div style={{ fontSize:'0.7rem', color:'var(--text-faint)' }}>{c.val}</div>
                    </div>
                  </div>
                ))}
                {(liabilityItems.length > 0 || incomeStreams.length > 0) && (
                  <div style={{ marginTop:6, display:'flex', gap:8, flexWrap:'wrap' }}>
                    <span style={s.compMetaPill}>Liabilities {fmt$(liabilityItems.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</span>
                    <span style={s.compMetaPill}>Income Streams {incomeStreams.length}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Holdings Table */}
        <div style={{ ...s.card, marginBottom:24, animation:'sectionIn 0.5s ease both', animationDelay:'0.32s' }}>
          <div style={s.secLabel}>
            <span>Live Holdings</span>
            <button
              type="button"
              onClick={refreshPortfolioPrices}
              disabled={priceRefreshing || loading}
              aria-label="Refresh Prices"
              title="Refresh Prices"
              style={{ ...s.holdingsRefreshBtn, opacity:(priceRefreshing || loading) ? 0.6 : 1, cursor:(priceRefreshing || loading) ? 'not-allowed' : 'pointer' }}
            >
              <span
                style={{
                  display:'inline-block',
                  fontSize:'0.86rem',
                  lineHeight:1,
                  transform: priceRefreshing ? 'rotate(360deg)' : 'none',
                  transition: priceRefreshing ? 'transform 0.8s linear' : 'transform 0.2s ease',
                }}
              >
                ↻
              </span>
            </button>
          </div>
          {loading ? <LoadingPulse /> : allHoldings.length === 0 ? (
            <p style={{ color:'var(--text-faint)', fontSize:'0.85rem' }}>No holdings found for this account.</p>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'var(--font-mono)', fontSize:'0.8rem' }}>
                <thead>
                  <tr style={{ color:holdingsHeaderText, textTransform:'uppercase', fontSize:'0.65rem', letterSpacing:'0.08em' }}>
                    {['Symbol','Type','Qty','Avg Cost','Current Price','Market Value','Gain / Loss'].map((h,i) => (
                      <th key={h} style={{ textAlign: i===0 ? 'left' : 'right', padding:'8px 12px', borderBottom:holdingsHeadBorder, fontWeight:500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allHoldings.map((h,i) => {
                    const gain = gainPct(h.current_price, h.avg_price)
                    const gainColor = gain == null ? 'var(--text-faint)' : gain >= 0 ? 'var(--green)' : 'var(--red)'
                    return (
                      <tr key={i} style={{ borderBottom:holdingsRowBorder, cursor:'pointer' }}
                        onClick={() => setSelectedHolding(h)}
                        onMouseEnter={e => e.currentTarget.style.background='var(--surface2)'}
                        onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                        <td style={{ padding:'12px 12px', color:holdingsStrongText, fontWeight:isSilentNight ? 700 : 600 }}>{h.symbol}</td>
                        <td style={{ padding:'12px 12px', textAlign:'right' }}>
                          <span style={{ background: h.type==='Stock' ? 'rgba(96,165,250,0.1)' : 'rgba(45,212,191,0.1)', color: h.type==='Stock' ? 'var(--blue)' : 'var(--teal)', padding:'2px 8px', borderRadius:6, fontSize:'0.65rem' }}>{h.type}</span>
                        </td>
                        <td style={{ padding:'12px 12px', textAlign:'right', color:holdingsDimText }}>{h.qty}</td>
                        <td style={{ padding:'12px 12px', textAlign:'right', color:holdingsDimText }}>{fmt$(h.avg_price)}</td>
                        <td style={{ padding:'12px 12px', textAlign:'right', color:holdingsStrongText, fontWeight:isSilentNight ? 600 : 400 }}>{fmt$(h.current_price)}</td>
                        <td style={{ padding:'12px 12px', textAlign:'right', color:holdingsGoldText, fontWeight:isSilentNight ? 700 : 600 }}>{fmt$(h.market_value)}</td>
                        <td style={{ padding:'12px 12px', textAlign:'right', color:gainColor, fontWeight:isSilentNight ? 700 : 600 }}>{gain != null ? fmtPct(gain) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop:holdingsHeadBorder }}>
                    <td colSpan={5} style={{ padding:'12px 12px', color:holdingsHeaderText, fontSize:'0.7rem', textTransform:'uppercase', letterSpacing:'0.08em' }}>Total Portfolio Value</td>
                    <td style={{ padding:'12px 12px', textAlign:'right', color:holdingsGoldText, fontWeight:700, fontSize:'0.9rem' }}>{fmt$(portfolioValue)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            AI Recommendations
            POST /users/:id/recommendations/gpt
        â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <div style={{ ...s.card, marginBottom:24, animation:'sectionIn 0.5s ease both', animationDelay:'0.44s' }}>
          <div style={s.secLabel}>
            <span style={{ display:'flex', alignItems:'center', gap:8 }}>
              Portfolio Analysis
              <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', padding:'2px 8px', borderRadius:6, background:'rgba(45,212,191,0.1)', color:'var(--teal)', border:'1px solid rgba(45,212,191,0.25)' }}>Unova AI</span>
            </span>
            <div style={s.analysisControls}>
              <div style={s.analysisActionSlot}>
                {gptRecs && (
                  <button
                    type="button"
                    onClick={analysisMode === 'comprehensive' ? exportComprehensivePdf : undefined}
                    style={{
                      ...s.btnReport,
                      visibility: analysisMode === 'comprehensive' ? 'visible' : 'hidden',
                      pointerEvents: analysisMode === 'comprehensive' ? 'auto' : 'none',
                    }}
                  >
                    Download Report
                  </button>
                )}
              </div>
              {gptRecs && (
                <div style={s.modeSwitch}>
                  {[
                    ['lite', 'Lite'],
                    ['comprehensive', 'Comprehensive'],
                  ].map(([key, label]) => {
                    const active = analysisMode === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setAnalysisMode(key)}
                        style={{ ...s.modeTab, ...(active ? s.modeTabActive : null) }}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}
              <button
                onClick={fetchGptRecs}
                disabled={gptLoading}
                style={{ ...s.btnTeal, display:'flex', alignItems:'center', gap:6, opacity: gptLoading ? 0.6 : 1 }}
              >
                {gptLoading
                  ? <><Spinner size={12} color="#080c14" /> Generating...</>
                  : gptRecs ? '↻ Refresh Analysis' : 'Generate Analysis'}
              </button>
            </div>
          </div>

          <p style={{ fontSize:'0.9rem', color:'var(--text-dim)', lineHeight:1.72, marginBottom:20, maxWidth:900 }}>
            Uses your portfolio context, risk profile, and financial wellness signals to generate curated insights and next-step guidance.
          </p>

          {gptError && <div style={s.errBox}>Warning: {gptError}</div>}

          {/* Thinking state */}
          {gptLoading && (
            <div style={{ background:'rgba(45,212,191,0.04)', border:'1px solid rgba(45,212,191,0.14)', borderRadius:14, padding:'24px 20px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                <Spinner size={18} color="var(--teal)" />
                <span style={{ fontFamily:'var(--font-display)', fontWeight:600, fontSize:'0.9rem', color:'var(--teal)' }}>Our analyst AI is reviewing your portfolio...</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                {['Reading holdings and risk profile...','Evaluating portfolio composition...','Generating personalised recommendations...'].map((t,i) => (
                  <div key={t} style={{ display:'flex', alignItems:'center', gap:8, animation:`profilePulse 1.5s ease-in-out ${i*0.4}s infinite` }}>
                    <div style={{ width:5, height:5, borderRadius:'50%', background:'var(--teal)', flexShrink:0 }} />
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-dim)' }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty / prompt state */}
          {!gptLoading && !gptError && gptRecs === null && (
            <div style={{ textAlign:'center', padding:'36px 20px' }}>
              <div style={{ fontSize:'2.2rem', marginBottom:12 }}>*</div>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.95rem', marginBottom:8 }}>Curated Portfolio Analysis</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.76rem', color:'var(--text-faint)', maxWidth:380, margin:'0 auto', lineHeight:1.7 }}>
                Generate a tailored review based on your current holdings, financial wellness, and risk profile.
              </div>
            </div>
          )}

          {!gptLoading && !gptText && (gptSummary || gptTopRecs.length > 0 || gptScenarios || gptNextSteps.length > 0) && (
            <div style={{ display:'flex', flexDirection:'column', gap:18, animation:'profileFadeUp 0.4s ease' }}>
              <div style={{
                background:'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(59,91,219,0.08))',
                border:'1px solid rgba(45,212,191,0.16)',
                borderRadius:16,
                padding:'18px 20px',
              }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', marginBottom:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span>🧑‍💼</span>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'var(--teal)' }}>
                      Unova Analyst AI · {new Date().toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <span style={{ ...s.inlineStat, color:insightTone(wellnessScore).color, borderColor:'rgba(255,255,255,0.08)' }}>
                      Wellness {Math.round(wellnessScore)} · {insightTone(wellnessScore).label}
                    </span>
                    {riskLabelFromValue(profile?.risk_profile) && (
                      <span style={{ ...s.inlineStat, color:'var(--gold)', borderColor:'rgba(201,168,76,0.2)' }}>
                        Risk {riskLabelFromValue(profile?.risk_profile)}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.2rem', marginBottom:gptSummary ? 10 : 0 }}>
                  Portfolio outlook
                </div>
                {gptSummary ? (
                  <div style={{ fontSize:'1rem', color:'var(--text-dim)', lineHeight:1.82, maxWidth: 1080 }}>{gptSummary}</div>
                ) : (
                  <div style={{ fontSize:'0.82rem', color:'var(--text-faint)', lineHeight:1.7 }}>
                    The system returned structured actions without a written summary, so the key insights are broken out below.
                  </div>
                )}
              </div>
              {analysisMode !== 'comprehensive' && (
                <div style={{
                  marginTop: -6,
                  fontFamily:'var(--font-mono)',
                  fontSize:'0.72rem',
                  color:'var(--text-faint)',
                  letterSpacing:'0.04em',
                }}>
                  Tip: Switch to <span style={{ color:'var(--teal)' }}>Comprehensive</span> for more details.
                </div>
              )}

              {analysisMode === 'comprehensive' && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12 }}>
                  {visibleInsightTiles.map(tile => (
                    <div key={tile.label} style={s.insightTile}>
                      <div style={s.insightLabel}>{tile.label}</div>
                      <div style={{ ...s.insightValue, fontSize:'1.55rem', color:tile.valueColor }}>
                        {tile.value}
                      </div>
                      <div style={s.insightSub}>{tile.sub}</div>
                    </div>
                  ))}
                </div>
              )}

              {analysisMode === 'comprehensive' && visibleTopRecs.length > 0 && (
                <div>
                  <div style={s.secSubhead}>Top Recommendations</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    {visibleTopRecs.map((rec, i) => <RecCard key={i} rec={rec} i={i} tint compact={false} />)}
                  </div>
                </div>
              )}

              {analysisMode === 'comprehensive' && activeScenario && (
                <div>
                  <div style={s.secSubhead}>Scenario Insights</div>
                  <div style={{ display:'grid', gap:14 }}>
                    <div style={s.modeSwitch}>
                      {scenarioCards.map(item => {
                        const active = selectedScenario === item.key
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => setSelectedScenario(item.key)}
                            style={{
                              ...s.modeTab,
                              ...(active ? { ...s.modeTabActive, color:item.color, borderColor:`${item.color}40` } : null),
                            }}
                          >
                            {item.label}
                          </button>
                        )
                      })}
                    </div>
                    <div style={{ ...s.scenarioCardLite, borderColor:`${activeScenario.color}26` }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                        <div style={{ width:10, height:10, borderRadius:'50%', background:activeScenario.color, boxShadow:`0 0 10px ${activeScenario.color}` }} />
                        <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.02rem', color:activeScenario.color }}>{activeScenario.label}</div>
                      </div>
                      <div style={{ fontSize:'1rem', color:'var(--text-dim)', lineHeight:1.82 }}>
                        {toText(activeScenario.text) || 'No scenario detail returned.'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {analysisMode === 'comprehensive' && gptNextSteps.length > 0 && (
                <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid var(--border)', borderRadius:14, padding:'18px 20px' }}>
                  <div style={s.secSubhead}>Next 30 Days</div>
                  <div style={{ display:'grid', gap:10 }}>
                    {gptNextSteps.map((step, i) => (
                      <div key={`${step}-${i}`} style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                        <div style={{ width:24, height:24, borderRadius:'50%', background:'rgba(45,212,191,0.12)', border:'1px solid rgba(45,212,191,0.22)', color:'var(--teal)', fontFamily:'var(--font-mono)', fontSize:'0.72rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                          {i + 1}
                        </div>
                        <div style={{ fontSize:'0.92rem', color:'var(--text-dim)', lineHeight:1.76 }}>{step}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Result ? free-text / markdown */}
          {!gptLoading && gptText && (
            <div style={{ animation:'profileFadeUp 0.4s ease' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, padding:'10px 14px', background:'rgba(45,212,191,0.05)', border:'1px solid rgba(45,212,191,0.15)', borderRadius:10 }}>
                <span>🧑‍💼</span>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'var(--teal)' }}>
                  Unova Analyst AI · {new Date().toLocaleTimeString()}
                </span>
              </div>
              <div style={{ fontSize: analysisMode === 'lite' ? '0.98rem' : '0.86rem', color:'var(--text-dim)', lineHeight: analysisMode === 'lite' ? 1.9 : 1.85, whiteSpace:'pre-wrap', background:'var(--surface2)', borderRadius:12, padding:'18px 20px', border:'1px solid var(--border)' }}>
                {gptText}
              </div>
            </div>
          )}
        </div>

        {/* Financial Year Wrapped */}
        <button
          type="button"
          onClick={() => { setWrappedIndex(0); setWrappedOpen(true) }}
          style={{
            ...s.card,
            ...s.wrappedEntry,
            marginBottom:24,
          }}
        >
          <div style={s.secLabel}>
            Financial Year Wrapped
            <span style={{ ...s.inlineStat, color:'var(--purple)', borderColor:'rgba(139,92,246,0.18)' }}>{wrappedData.year}</span>
          </div>
          <div style={s.wrappedEntryInner}>
            <div style={s.wrappedBadge}>📊</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={s.wrappedTitle}>Your {wrappedData.year} in money moments</div>
              <div style={s.wrappedBody}>
                Income growth, strongest return, biggest adds, longest-held stock, and a year-end summary in one tap-through recap.
              </div>
              <div style={s.wrappedHighlights}>
                {wrappedData.slides.slice(0, 3).map(slide => (
                  <span key={slide.key} style={s.wrappedMiniPill}>{slide.icon} {slide.eyebrow}</span>
                ))}
              </div>
            </div>
            <div style={s.wrappedCta}>
              Open Wrapped →
            </div>
          </div>
        </button>

        {/* Insights + Retirement */}
        <div style={s.twoCol}>
          <div style={{ ...s.card, ...s.featureCard, background:'linear-gradient(180deg, rgba(42,184,163,0.06), rgba(109,141,247,0.04) 100%)' }}>
            <div style={s.secLabel}>
              Peer Age Benchmarking
              <span style={{ ...s.inlineStat, color:'var(--teal)', borderColor:'rgba(42,184,163,0.18)' }}>
                {benchmarks?.income?.age_band ?? 'SG cohort'}
              </span>
            </div>

            <div style={{ ...s.featureCardBody, ...(benchmarkOpen ? s.featureCardBodyExpanded : {}) }}>
              {!benchmarkOpen ? (
                <div style={s.retirementPreview}>
                  <div style={s.retirementPreviewBadge}>👥</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:'var(--font-display)', fontSize:'1.25rem', fontWeight:800, marginBottom:8 }}>
                      See where you stand against your age cohort
                    </div>
                    <div style={{ fontSize:'0.92rem', color:'var(--text-dim)', lineHeight:1.75, marginBottom:14 }}>
                      Compare your income and net worth against Singapore reference bands for your age. Open the view only when you want the percentile breakdown.
                    </div>
                    <div style={s.retirementPreviewMeta}>
                      <span style={s.retirementPreviewPill}>Age {profile?.age ?? '—'}</span>
                      <span style={s.retirementPreviewPill}>Income {fmtSgd(profile?.income)}</span>
                      <span style={s.retirementPreviewPill}>Net worth {fmtSgd(profile?.net_worth)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setBenchmarkOpen(true)
                      if (!benchmarks && !benchmarkLoading) fetchBenchmarks()
                    }}
                    style={{ ...s.btnTeal, minWidth:170, alignSelf:'center' }}
                  >
                    {benchmarkLoading ? 'Loading...' : 'View Benchmarking'}
                  </button>
                </div>
              ) : benchmarkError ? (
                <div style={s.errBox}>
                  {benchmarkError}
                </div>
              ) : !benchmarks ? (
                <div style={{ fontSize:'0.9rem', color:'var(--text-dim)', lineHeight:1.75 }}>
                  Loading your Singapore benchmark snapshot...
                </div>
              ) : (
                <>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:'1.25rem', fontWeight:800, marginBottom:8 }}>
                    Singapore percentile snapshot
                  </div>
                  <div style={{ fontSize:'0.9rem', color:'var(--text-dim)', lineHeight:1.75, marginBottom:16 }}>
                    A compact view of how your income and net worth compare with others in your age band.
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:12, marginBottom:14 }}>
                    <BenchmarkMiniCard title="Income" data={benchmarks.income} accent="var(--teal)" icon="S$" />
                    <BenchmarkMiniCard title="Net Worth" data={benchmarks.net_worth} accent="var(--blue)" icon="◔" />
                  </div>
                  <div style={s.retirementPreviewMeta}>
                    <span style={s.retirementPreviewPill}>Income {fmtSgd(benchmarks.income?.user_value)}</span>
                    <span style={s.retirementPreviewPill}>Net worth {fmtSgd(benchmarks.net_worth?.user_value)}</span>
                    <span style={s.retirementPreviewPill}>Median {fmtSgd(benchmarks.income?.median)} income</span>
                  </div>
                  <div style={{ marginTop:14, display:'flex', justifyContent:'flex-end', gap:10 }}>
                    <button
                      type="button"
                      onClick={fetchBenchmarks}
                      disabled={benchmarkLoading}
                      style={{ ...s.retirementSecondaryBtn, opacity:benchmarkLoading ? 0.6 : 1 }}
                    >
                      {benchmarkLoading ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBenchmarkOpen(false)}
                      style={s.retirementSecondaryBtn}
                    >
                      Hide
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={{ ...s.card, background:'linear-gradient(180deg, rgba(109,141,247,0.06), rgba(42,184,163,0.04) 100%)' }}>
            <div style={s.secLabel}>
              Retirement Outlook
              <span style={{ ...s.inlineStat, color:retirementSummary.tone, borderColor:'rgba(109,141,247,0.18)' }}>
                {retirementLoading ? 'Updating...' : `${retirementPlan?.years_to_retirement ?? '—'} years left`}
              </span>
            </div>

            {!retirementOpen ? (
              <div style={s.retirementPreviewShell}>
                <div style={s.retirementPreview}>
                  <div style={s.retirementPreviewBadge}>🌅</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:'var(--font-display)', fontSize:'1.25rem', fontWeight:800, marginBottom:8 }}>
                      {retirementSummary.title}
                    </div>
                    <div style={{ fontSize:'0.92rem', color:'var(--text-dim)', lineHeight:1.75, marginBottom:14 }}>
                      {retirementPlan
                        ? `See whether your current assets, spending, and savings pace can get you to ${fmtCompactCurrency(retirementPlan.target_retirement_fund)} by age ${retirementPlan.retirement_age}.`
                        : 'Generate a retirement snapshot from your portfolio, income, and spending to see if you are on track.'}
                    </div>
                    <div style={s.retirementPreviewMeta}>
                      <span style={s.retirementPreviewPill}>Goal {fmtCompactCurrency(retirementPlan?.target_retirement_fund)}</span>
                      <span style={s.retirementPreviewPill}>Top-up {fmt$(retirementPlan?.required_monthly_contribution)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRetirementOpen(true)}
                    style={{ ...s.btnTeal, minWidth:150, alignSelf:'center' }}
                  >
                    Plan Retirement
                  </button>
                </div>
              </div>
            ) : (
              <>
                {retirementError && (
                  <div style={{ ...s.errBox, marginBottom:16 }}>
                    {retirementError}
                  </div>
                )}
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:16, marginBottom:14, width:'100%' }}>
                  <div style={{ flex:'1 1 320px', minWidth:0 }}>
                    <div style={{ fontFamily:'var(--font-display)', fontSize:'1.35rem', fontWeight:800, marginBottom:6 }}>
                      {retirementSummary.title}
                    </div>
                    <div style={{ fontSize:'0.92rem', color:'var(--text-dim)', lineHeight:1.75, maxWidth:470 }}>
                      {retirementPlan ? (
                        retirementGap <= 0
                          ? `At your current pace, you are projected to reach ${fmtCompactCurrency(retirementPlan.projected_value_at_retirement)} by age ${retirementPlan.retirement_age}, ahead of your ${fmtCompactCurrency(retirementPlan.target_retirement_fund)} target.`
                          : `You are aiming for ${fmtCompactCurrency(retirementPlan.target_retirement_fund)} by age ${retirementPlan.retirement_age}. To close the remaining ${fmtCompactCurrency(retirementGap)} gap, Unova estimates a monthly contribution of ${fmt$(retirementPlan.required_monthly_contribution)}.`
                      ) : 'Use your current profile, spending, and portfolio to estimate whether your retirement path is on track.'}
                    </div>
                  </div>
                  <div style={{ flex:'0 1 220px', minWidth:160, marginLeft:'auto', textAlign:'right' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.66rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>
                      Target age
                    </div>
                    <div style={{ fontFamily:'var(--font-display)', fontSize:'1.6rem', fontWeight:800 }}>
                      {retirementPlan?.retirement_age ?? retirementInputs.retirement_age}
                    </div>
                    <div style={{ fontSize:'0.76rem', color:'var(--text-faint)', marginTop:4 }}>
                      Risk profile {retirementPlan?.risk_profile ?? riskLabelFromValue(profile?.risk_profile)}
                    </div>
                  </div>
                </div>

                <div style={s.retirementProgressTrack}>
                  <div
                    style={{
                      ...s.retirementProgressFill,
                      width:`${retirementProgress}%`,
                      background: retirementGap <= 0
                        ? 'linear-gradient(90deg, rgba(34,197,94,0.92), rgba(42,184,163,0.92))'
                        : 'linear-gradient(90deg, rgba(109,141,247,0.92), rgba(139,92,246,0.92))',
                    }}
                  />
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginTop:8, marginBottom:18, fontFamily:'var(--font-mono)', fontSize:'0.66rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.08em' }}>
                  <span>Projected {fmtCompactCurrency(retirementPlan?.projected_value_at_retirement)}</span>
                  <span>Goal {fmtCompactCurrency(retirementPlan?.target_retirement_fund)}</span>
                </div>

                <div style={s.retirementStatGrid}>
                  <div style={s.retirementStatCard}>
                    <div style={s.retirementStatLabel}>Monthly top-up</div>
                    <div style={{ ...s.retirementStatValue, color:retirementGap <= 0 ? 'var(--green)' : 'var(--text)' }}>
                      {retirementPlan ? fmt$(retirementPlan.required_monthly_contribution) : '—'}
                    </div>
                    <div style={s.retirementStatHint}>Needed from now to retirement</div>
                  </div>
                  <div style={s.retirementStatCard}>
                    <div style={s.retirementStatLabel}>Cash reserve</div>
                    <div style={s.retirementStatValue}>
                      {retirementPlan ? fmtCompactCurrency(retirementPlan.essential_cash_reserve_target) : '—'}
                    </div>
                    <div style={s.retirementStatHint}>Emergency buffer before investing</div>
                  </div>
                  <div style={s.retirementStatCard}>
                    <div style={s.retirementStatLabel}>Suggested mix</div>
                    <div style={{ ...s.retirementStatValue, fontSize:'1rem', lineHeight:1.35 }}>
                      {retirementRecommendedMix}
                    </div>
                    <div style={s.retirementStatHint}>Based on risk and years remaining</div>
                  </div>
                </div>

                <div style={s.retirementControls}>
                  <label style={s.retirementInputWrap}>
                    <span style={s.retirementInputLabel}>Retirement age</span>
                    <input
                      type="number"
                      min="19"
                      max="100"
                      value={retirementInputs.retirement_age}
                      onChange={e => setRetirementInputs(prev => ({ ...prev, retirement_age:Number(e.target.value || 0) }))}
                      style={s.retirementInput}
                    />
                  </label>
                  <label style={s.retirementInputWrap}>
                    <span style={s.retirementInputLabel}>Monthly spend</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={retirementInputs.monthly_expenses}
                      onChange={e => setRetirementInputs(prev => ({ ...prev, monthly_expenses:Number(e.target.value || 0) }))}
                      style={s.retirementInput}
                    />
                  </label>
                  <label style={s.retirementInputWrap}>
                    <span style={s.retirementInputLabel}>Essential spend</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={retirementInputs.essential_monthly_expenses}
                      onChange={e => setRetirementInputs(prev => ({ ...prev, essential_monthly_expenses:Number(e.target.value || 0) }))}
                      style={s.retirementInput}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={fetchRetirementPlan}
                    disabled={retirementLoading}
                    style={{ ...s.btnTeal, minWidth:130, opacity:retirementLoading ? 0.6 : 1, alignSelf:'end' }}
                  >
                    {retirementLoading ? 'Updating...' : 'Refresh Plan'}
                  </button>
                </div>
                <div style={{ marginTop:12, display:'flex', justifyContent:'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setRetirementOpen(false)}
                    style={s.retirementSecondaryBtn}
                  >
                    Hide planner
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <BehavioralResilienceModal
          open={behavioralResilienceOpen}
          onClose={() => setBehavioralResilienceOpen(false)}
          score={behavioralResilienceScore}
          confidence={behavioralResilienceConfidence}
          summary={behavioralResilienceSummary}
          breakdown={behavioralResilienceBreakdown}
          insights={behavioralResilienceInsights}
          derivedMetrics={behavioralResilienceDerived}
        />
        <HoldingInsightModal holding={selectedHolding} onClose={() => setSelectedHolding(null)} userId={authUser?.user_id} />
        <FinancialManagerModal
          open={financialModalOpen}
          activeTab={financialTab}
          setActiveTab={setFinancialTab}
          profile={profile}
          onClose={() => setFinancialModalOpen(false)}
          onSubmit={submitFinancialItem}
          onRemove={removeFinancialItem}
          busy={financialBusy}
        />
        <YearWrappedModal
          open={wrappedOpen}
          slides={wrappedData.slides}
          index={wrappedIndex}
          setIndex={setWrappedIndex}
          onClose={() => setWrappedOpen(false)}
          onDownload={exportWrappedPdf}
          year={wrappedData.year}
          ownerName={profile?.name ?? authUser.username}
          themeId={activeTheme?.id}
        />

      </main>
    </div>
  )
}

const s = {
  topbar:    { display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:36, flexWrap:'wrap', gap:16 },
  pageTitle: { fontFamily:'var(--font-display)', fontWeight:800, fontSize:'clamp(1.8rem,3vw,2.6rem)', lineHeight:1.1, marginBottom:6 },
  badgePill: {
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:24, padding:'7px 14px',
    fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'var(--text-dim)',
    display:'flex', alignItems:'center', gap:8,
  },
  heroCard: {
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:22, padding:'32px 36px', marginBottom:28,
    display:'flex', alignItems:'center', gap:28, position:'relative', overflow:'hidden', flexWrap:'wrap',
  },
  hoverHint: {
    position:'absolute',
    top:18,
    right:18,
    maxWidth:300,
    padding:'10px 12px',
    borderRadius:12,
    background:'rgba(29,39,56,0.96)',
    color:'#f5f7fb',
    fontSize:'0.76rem',
    lineHeight:1.55,
    boxShadow:'0 16px 36px rgba(15,23,42,0.18)',
    border:'1px solid rgba(255,255,255,0.08)',
    zIndex:5,
    animation:'profileFadeUp 0.18s ease',
  },
  avatarWrap: { position:'relative', flexShrink:0 },
  avatar: {
    width:86, height:86, borderRadius:'50%',
    background:'linear-gradient(135deg, #3b5bdb 0%, #6e48c7 50%, #2dd4bf 100%)',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontFamily:'var(--font-display)', fontSize:'1.8rem', fontWeight:800,
    border:'3px solid var(--gold)', boxShadow:'0 0 22px rgba(201,168,76,0.3)',
  },
  avatarRing: {
    position:'absolute', inset:-6, borderRadius:'50%',
    border:'1.5px dashed rgba(201,168,76,0.4)',
    animation:'spinSlow 20s linear infinite', pointerEvents:'none',
  },
  userName:  { fontFamily:'var(--font-display)', fontSize:'1.45rem', fontWeight:800, marginBottom:6 },
  twoCol:    { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(360px, 1fr))', gap:22, marginBottom:22 },
  card:      { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, padding:24 },
  featureCard: {
    minHeight:320,
    display:'flex',
    flexDirection:'column',
  },
  featureCardBody: {
    flex:1,
    display:'flex',
    alignItems:'center',
    minWidth:0,
  },
  featureCardBodyExpanded: {
    display:'block',
    width:'100%',
  },
  trendPanel: {
    background:'linear-gradient(180deg, rgba(139,92,246,0.08) 0%, rgba(139,92,246,0.02) 55%, rgba(255,255,255,0) 100%)',
    border:'1px solid rgba(139,92,246,0.12)',
    borderRadius:20,
    padding:'14px 16px 10px',
  },
  trendFooter: {
    display:'flex',
    justifyContent:'space-between',
    marginTop:8,
    fontFamily:'var(--font-mono)',
    fontSize:'0.65rem',
    letterSpacing:'0.08em',
    textTransform:'uppercase',
    color:'var(--text-faint)',
  },
  secLabel:  {
    fontFamily:'var(--font-mono)', fontSize:'0.67rem',
    color:'var(--text-faint)', textTransform:'uppercase',
    letterSpacing:'0.13em', marginBottom:16,
    display:'flex', justifyContent:'space-between', alignItems:'center',
  },
  holdingsRefreshBtn: {
    appearance:'none',
    WebkitAppearance:'none',
    border:'1px solid var(--border-act)',
    background:'var(--surface2)',
    color:'var(--text)',
    borderRadius:999,
    padding:'6px 12px',
    fontFamily:'var(--font-mono)',
    fontSize:'0.62rem',
    fontWeight:700,
    letterSpacing:'0.08em',
    textTransform:'uppercase',
    outline:'none',
  },
  rangeTab: {
    appearance:'none',
    WebkitAppearance:'none',
    background:'var(--surface2)',
    border:'1px solid var(--border-act)',
    color:'var(--text)',
    borderRadius:999,
    padding:'8px 12px',
    fontFamily:'var(--font-mono)',
    fontSize:'0.68rem',
    fontWeight:600,
    letterSpacing:'0.08em',
    textTransform:'uppercase',
    outline:'none',
    boxShadow:'none',
  },
  rangeTabActive: {
    background:'var(--teal)',
    borderColor:'var(--teal)',
    color:'#0b0f14',
    boxShadow:'var(--glow-teal)',
  },
  infoDot: {
    appearance:'none',
    WebkitAppearance:'none',
    width:18,
    height:18,
    borderRadius:'50%',
    border:'1px solid rgba(148,163,184,0.4)',
    background:'var(--surface2)',
    color:'var(--text-faint)',
    display:'inline-flex',
    alignItems:'center',
    justifyContent:'center',
    fontFamily:'var(--font-mono)',
    fontSize:'0.68rem',
    fontWeight:700,
    lineHeight:1,
    padding:0,
    cursor:'help',
    boxShadow:'none',
    outline:'none',
    flexShrink:0,
  },
  secSubhead: {
    fontFamily:'var(--font-display)', fontSize:'1.02rem', fontWeight:700,
    marginBottom:12,
  },
  modeSwitch: {
    display:'inline-flex',
    alignItems:'center',
    gap:6,
    padding:4,
    borderRadius:999,
    background:'var(--surface2)',
    border:'1px solid var(--border)',
  },
  modeTab: {
    border:'1px solid transparent',
    background:'transparent',
    color:'var(--text-dim)',
    padding:'7px 12px',
    borderRadius:999,
    fontFamily:'var(--font-mono)',
    fontSize:'0.68rem',
    letterSpacing:'0.06em',
    cursor:'pointer',
    transition:'all 0.2s',
  },
  modeTabActive: {
    background:'var(--surface)',
    color:'var(--text)',
    boxShadow:'0 6px 16px rgba(15,23,42,0.08)',
  },
  analysisActionSlot: {
    width:160,
    display:'flex',
    justifyContent:'flex-end',
    flexShrink:0,
  },
  analysisControls: {
    display:'flex',
    alignItems:'center',
    justifyContent:'flex-end',
    gap:12,
    flexWrap:'nowrap',
    minWidth:0,
    flexShrink:0,
  },
  btnReport: {
    background:'var(--surface2)',
    border:'1px solid rgba(29,39,56,0.14)',
    color:'var(--gold)',
    padding:'8px 16px',
    borderRadius:10,
    fontFamily:'var(--font-body)',
    fontSize:'0.82rem',
    fontWeight:700,
    cursor:'pointer',
    boxShadow:'0 8px 22px rgba(15,23,42,0.06)',
    transition:'opacity 0.2s',
  },
  inlineStat: {
    fontFamily:'var(--font-mono)', fontSize:'0.64rem',
    padding:'4px 10px', borderRadius:999, background:'rgba(255,255,255,0.04)',
    border:'1px solid var(--border)', letterSpacing:'0.05em',
  },
  insightTile: {
    background:'var(--surface2)', border:'1px solid var(--border)',
    borderRadius:14, padding:'16px 16px 14px',
  },
  insightLabel: {
    fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'var(--text-faint)',
    textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8,
  },
  insightValue: {
    fontFamily:'var(--font-display)', fontSize:'1.4rem', fontWeight:800, lineHeight:1.1,
  },
  insightSub: {
    marginTop:5, fontSize:'0.74rem', color:'var(--text-faint)', lineHeight:1.5,
  },
  driverStrip: {
    background:'rgba(255,255,255,0.55)',
    border:'1px solid var(--border)',
    borderRadius:14,
    padding:'18px 20px',
  },
  driverEyebrow: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.66rem',
    color:'var(--text-faint)',
    textTransform:'uppercase',
    letterSpacing:'0.1em',
    marginBottom:6,
  },
  driverTitle: {
    fontFamily:'var(--font-display)',
    fontWeight:700,
    fontSize:'1rem',
    marginBottom:4,
  },
  driverBody: {
    fontSize:'0.84rem',
    color:'var(--text-dim)',
    lineHeight:1.65,
  },
  scenarioCardLite: {
    background:'var(--surface2)',
    border:'1px solid var(--border)',
    borderRadius:14,
    padding:'18px 20px',
  },
  liteHint: {
    fontSize:'0.78rem',
    color:'var(--text-faint)',
    fontFamily:'var(--font-mono)',
    marginTop:8,
  },
  errBox: {
    background:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.2)',
    borderRadius:10, padding:'11px 15px', color:'var(--red)',
    fontFamily:'var(--font-mono)', fontSize:'0.76rem', marginBottom:16,
  },
  btnGold: {
    background:'var(--gold)',
    border:'none', color:'var(--btn-text-on-gold)', padding:'10px 22px', borderRadius:10,
    fontFamily:'var(--font-display)', fontSize:'0.84rem', fontWeight:700,
    boxShadow:'0 10px 24px rgba(17,24,39,0.16)', cursor:'pointer', transition:'opacity 0.2s',
  },
  btnTeal: {
    background:'linear-gradient(135deg,var(--teal),#0e9f84)',
    border:'none', color:'#ffffff', padding:'8px 18px', borderRadius:8,
    fontFamily:'var(--font-display)', fontSize:'0.78rem', fontWeight:700,
    boxShadow:'0 4px 14px rgba(45,212,191,0.22)', cursor:'pointer', transition:'opacity 0.2s',
  },
  wrappedEntry: {
    appearance:'none',
    WebkitAppearance:'none',
    width:'100%',
    textAlign:'left',
    cursor:'pointer',
    color:'var(--text)',
    background:'linear-gradient(135deg, rgba(109,141,247,0.05), rgba(139,92,246,0.04) 52%, rgba(42,184,163,0.05))',
    boxShadow:'0 18px 44px rgba(15,23,42,0.06)',
  },
  wrappedEntryInner: {
    display:'flex',
    alignItems:'center',
    gap:22,
  },
  wrappedBadge: {
    width:74,
    height:74,
    borderRadius:20,
    background:'linear-gradient(135deg, rgba(109,141,247,0.14), rgba(139,92,246,0.18), rgba(42,184,163,0.14))',
    border:'1px solid rgba(139,92,246,0.16)',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    fontSize:'2rem',
    flexShrink:0,
  },
  wrappedTitle: {
    fontFamily:'var(--font-display)',
    fontSize:'1.5rem',
    fontWeight:800,
    lineHeight:1.1,
    marginBottom:10,
  },
  wrappedBody: {
    fontSize:'0.95rem',
    lineHeight:1.75,
    color:'var(--text-dim)',
    maxWidth:720,
  },
  wrappedHighlights: {
    display:'flex',
    gap:8,
    flexWrap:'wrap',
    marginTop:14,
  },
  wrappedMiniPill: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.64rem',
    letterSpacing:'0.05em',
    color:'var(--purple)',
    background:'rgba(139,92,246,0.08)',
    border:'1px solid rgba(139,92,246,0.14)',
    padding:'5px 10px',
    borderRadius:999,
  },
  wrappedCta: {
    flexShrink:0,
    fontFamily:'var(--font-display)',
    fontWeight:700,
    color:'var(--teal)',
    background:'rgba(42,184,163,0.08)',
    border:'1px solid rgba(42,184,163,0.16)',
    borderRadius:999,
    padding:'10px 16px',
    alignSelf:'flex-start',
  },
  retirementPreview: {
    display:'flex',
    alignItems:'center',
    gap:18,
  },
  retirementPreviewShell: {
    minHeight:260,
    display:'flex',
    alignItems:'center',
  },
  retirementPreviewBadge: {
    width:72,
    height:72,
    borderRadius:20,
    background:'linear-gradient(135deg, rgba(109,141,247,0.14), rgba(42,184,163,0.18))',
    border:'1px solid rgba(109,141,247,0.16)',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    fontSize:'1.85rem',
    flexShrink:0,
  },
  retirementPreviewMeta: {
    display:'flex',
    flexWrap:'wrap',
    gap:8,
  },
  retirementPreviewPill: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.64rem',
    color:'var(--blue)',
    background:'rgba(109,141,247,0.08)',
    border:'1px solid rgba(109,141,247,0.14)',
    padding:'6px 10px',
    borderRadius:999,
    letterSpacing:'0.05em',
  },
  retirementProgressTrack: {
    height:12,
    borderRadius:999,
    background:'rgba(148,163,184,0.12)',
    overflow:'hidden',
    border:'1px solid rgba(148,163,184,0.14)',
  },
  retirementProgressFill: {
    height:'100%',
    borderRadius:999,
    boxShadow:'0 8px 20px rgba(109,141,247,0.18)',
    transition:'width 0.35s ease',
  },
  retirementStatGrid: {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',
    gap:12,
    marginBottom:18,
  },
  retirementStatCard: {
    background:'rgba(255,255,255,0.52)',
    border:'1px solid var(--border)',
    borderRadius:14,
    padding:'14px 15px',
    minWidth:0,
  },
  retirementStatLabel: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.62rem',
    color:'var(--text-faint)',
    textTransform:'uppercase',
    letterSpacing:'0.1em',
    marginBottom:8,
  },
  retirementStatValue: {
    fontFamily:'var(--font-display)',
    fontSize:'1.15rem',
    fontWeight:800,
    lineHeight:1.15,
    marginBottom:5,
    overflowWrap:'anywhere',
    wordBreak:'break-word',
  },
  retirementStatHint: {
    fontSize:'0.76rem',
    color:'var(--text-faint)',
    lineHeight:1.55,
  },
  retirementControls: {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))',
    gap:10,
    alignItems:'end',
  },
  retirementInputWrap: {
    display:'flex',
    flexDirection:'column',
    gap:6,
  },
  retirementInputLabel: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.62rem',
    color:'var(--text-faint)',
    textTransform:'uppercase',
    letterSpacing:'0.08em',
  },
  retirementInput: {
    width:'100%',
    borderRadius:12,
    border:'1px solid var(--border)',
    background:'rgba(255,255,255,0.74)',
    color:'var(--text)',
    padding:'10px 12px',
    fontFamily:'var(--font-body)',
    fontSize:'0.88rem',
    outline:'none',
  },
  retirementSecondaryBtn: {
    appearance:'none',
    WebkitAppearance:'none',
    border:'1px solid var(--border)',
    background:'rgba(255,255,255,0.62)',
    color:'var(--text-dim)',
    borderRadius:999,
    padding:'8px 12px',
    fontFamily:'var(--font-body)',
    fontSize:'0.82rem',
    fontWeight:600,
    cursor:'pointer',
  },
  benchmarkGrid: {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))',
    gap:14,
  },
  benchmarkMetricCard: {
    border:'1px solid rgba(15,23,42,0.08)',
    borderRadius:18,
    background:'linear-gradient(180deg, rgba(255,255,255,0.8), rgba(247,249,252,0.9))',
    padding:'18px 18px 16px',
    boxShadow:'0 18px 36px rgba(15,23,42,0.04)',
  },
  benchmarkMetricLabel: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.66rem',
    color:'var(--text-faint)',
    textTransform:'uppercase',
    letterSpacing:'0.1em',
    marginBottom:8,
  },
  benchmarkIcon: {
    width:42,
    height:42,
    borderRadius:12,
    background:'rgba(255,255,255,0.86)',
    border:'1px solid rgba(15,23,42,0.08)',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    fontFamily:'var(--font-display)',
    fontSize:'1.1rem',
    fontWeight:800,
    flexShrink:0,
  },
  benchmarkRail: {
    height:12,
    borderRadius:999,
    overflow:'hidden',
    border:'1px solid rgba(15,23,42,0.06)',
  },
  benchmarkFill: {
    height:'100%',
    borderRadius:999,
    boxShadow:'0 8px 20px rgba(15,23,42,0.12)',
    transition:'width 0.35s ease',
  },
  benchmarkSummaryRow: {
    display:'flex',
    gap:10,
    flexWrap:'wrap',
    marginTop:16,
  },
  benchmarkSummaryPill: {
    fontFamily:'var(--font-body)',
    fontSize:'0.8rem',
    lineHeight:1.55,
    color:'var(--text-dim)',
    background:'rgba(255,255,255,0.72)',
    border:'1px solid rgba(15,23,42,0.08)',
    borderRadius:999,
    padding:'9px 13px',
  },
  benchmarkMiniCard: {
    border:'1px solid rgba(15,23,42,0.08)',
    borderRadius:14,
    background:'rgba(255,255,255,0.68)',
    padding:'14px 14px 12px',
    minWidth:0,
  },
  benchmarkMiniLabel: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.62rem',
    color:'var(--text-faint)',
    textTransform:'uppercase',
    letterSpacing:'0.1em',
    marginBottom:6,
  },
  benchmarkMiniIcon: {
    width:34,
    height:34,
    borderRadius:10,
    background:'rgba(255,255,255,0.84)',
    border:'1px solid rgba(15,23,42,0.08)',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    fontFamily:'var(--font-display)',
    fontSize:'0.94rem',
    fontWeight:800,
    flexShrink:0,
  },
  benchmarkMiniTrack: {
    height:10,
    borderRadius:999,
    background:'rgba(148,163,184,0.14)',
    overflow:'hidden',
    border:'1px solid rgba(15,23,42,0.05)',
  },
  benchmarkMiniFill: {
    height:'100%',
    borderRadius:999,
    transition:'width 0.35s ease',
  },
  compBtnAsset: {
    background:'linear-gradient(135deg,var(--teal),#0e9f84)',
    border:'1px solid var(--border-act)',
    color:'#081019',
    padding:'8px 12px',
    borderRadius:999,
    fontFamily:'var(--font-display)',
    fontSize:'0.74rem',
    fontWeight:800,
    cursor:'pointer',
  },
  compBtnLiability: {
    background:'rgba(226,85,85,0.18)',
    border:'1px solid rgba(226,85,85,0.52)',
    color:'var(--text)',
    padding:'8px 12px',
    borderRadius:999,
    fontFamily:'var(--font-display)',
    fontSize:'0.74rem',
    fontWeight:800,
    cursor:'pointer',
  },
  compBtnIncome: {
    background:'rgba(143,126,246,0.18)',
    border:'1px solid rgba(143,126,246,0.52)',
    color:'var(--text)',
    padding:'8px 12px',
    borderRadius:999,
    fontFamily:'var(--font-display)',
    fontSize:'0.74rem',
    fontWeight:800,
    cursor:'pointer',
  },
  compMetaPill: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.64rem',
    color:'var(--text-faint)',
    border:'1px solid var(--border)',
    background:'var(--surface2)',
    borderRadius:999,
    padding:'5px 10px',
  },
}

const hm = {
  backdrop: {
    position:'fixed',
    inset:0,
    zIndex:300,
    background:'rgba(15,23,42,0.26)',
    backdropFilter:'blur(14px)',
    WebkitBackdropFilter:'blur(14px)',
    display:'flex',
    alignItems:'flex-start',
    justifyContent:'center',
    padding:'24px 24px 48px',
    overflowY:'auto',
  },
  panel: {
    width:'min(920px, 100%)',
    margin:'0 auto',
    background:'var(--surface)',
    border:'1px solid var(--border)',
    borderRadius:24,
    boxShadow:'0 36px 90px rgba(0,0,0,0.35)',
    overflow:'hidden',
  },
  topBar: { height:2, background:'linear-gradient(90deg, var(--teal), #7c3aed, var(--gold))' },
  header: {
    display:'flex',
    alignItems:'flex-start',
    justifyContent:'space-between',
    gap:16,
    padding:'28px 28px 20px',
  },
  eyebrow: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.65rem',
    color:'var(--teal)',
    textTransform:'uppercase',
    letterSpacing:'0.14em',
    marginBottom:4,
  },
  title: {
    margin:0,
    fontFamily:'var(--font-display)',
    fontSize:'1.55rem',
    lineHeight:1.1,
  },
  typeTag: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.72rem',
    color:'var(--text-faint)',
    textTransform:'uppercase',
    letterSpacing:'0.08em',
  },
  subline: { fontSize:'0.84rem', color:'var(--text-dim)', marginTop:6 },
  closeBtn: {
    width:40,
    height:40,
    borderRadius:10,
    border:'1px solid var(--border)',
    background:'var(--surface2)',
    color:'var(--text-faint)',
    cursor:'pointer',
    flexShrink:0,
  },
  metrics: {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',
    gap:12,
    padding:'0 28px 18px',
  },
  metricCard: {
    border:'1px solid var(--border)',
    borderRadius:14,
    background:'var(--surface2)',
    padding:'14px 14px 12px',
  },
  metricLabel: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.62rem',
    color:'var(--text-faint)',
    textTransform:'uppercase',
    letterSpacing:'0.08em',
    marginBottom:6,
  },
  metricValue: {
    fontFamily:'var(--font-display)',
    fontWeight:700,
    fontSize:'1rem',
  },
}

const fm = {
  backdrop: {
    position:'fixed',
    inset:0,
    zIndex:315,
    background:'rgba(15,23,42,0.22)',
    backdropFilter:'blur(14px)',
    WebkitBackdropFilter:'blur(14px)',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    padding:'24px',
  },
  panel: {
    width:'min(860px, 100%)',
    maxHeight:'90vh',
    background:'linear-gradient(180deg, var(--surface), var(--surface2))',
    border:'1px solid var(--border)',
    borderRadius:24,
    boxShadow:'0 36px 90px rgba(0,0,0,0.45)',
    overflow:'hidden',
    display:'flex',
    flexDirection:'column',
  },
  topBar: { height:2, background:'linear-gradient(90deg, var(--teal), #8b5cf6, var(--gold))' },
  header: {
    display:'flex',
    alignItems:'flex-start',
    justifyContent:'space-between',
    gap:16,
    padding:'26px 28px 16px',
  },
  eyebrow: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.66rem',
    color:'var(--teal)',
    textTransform:'uppercase',
    letterSpacing:'0.16em',
    marginBottom:8,
  },
  title: {
    margin:0,
    fontFamily:'var(--font-display)',
    fontSize:'1.5rem',
    lineHeight:1.1,
  },
  subline: { marginTop:8, fontSize:'0.84rem', color:'var(--text-dim)' },
  closeBtn: {
    width:40,
    height:40,
    borderRadius:10,
    border:'1px solid var(--border)',
    background:'var(--surface2)',
    color:'var(--text-dim)',
    cursor:'pointer',
  },
  tabs: {
    display:'flex',
    gap:8,
    padding:'0 28px 16px',
  },
  tab: {
    border:'1px solid var(--border)',
    background:'var(--surface2)',
    color:'var(--text-dim)',
    padding:'8px 12px',
    borderRadius:999,
    fontFamily:'var(--font-mono)',
    fontSize:'0.7rem',
    cursor:'pointer',
  },
  tabActive: {
    background:'rgba(42,184,163,0.1)',
    borderColor:'rgba(42,184,163,0.22)',
    color:'var(--teal)',
  },
  body: {
    flex:1,
    padding:'0 28px 28px',
    display:'flex',
    flexDirection:'column',
    gap:18,
    overflowY:'auto',
    minHeight:0,
  },
  sectionTitle: {
    fontFamily:'var(--font-display)',
    fontSize:'1.05rem',
    fontWeight:700,
    marginBottom:6,
  },
  sectionBody: {
    fontSize:'0.86rem',
    color:'var(--text-dim)',
    lineHeight:1.7,
  },
  form: {
    display:'grid',
    gridTemplateColumns:'repeat(4, minmax(0, 1fr))',
    gap:10,
  },
  input: {
    background:'var(--surface2)',
    border:'1px solid var(--border)',
    color:'var(--text)',
    borderRadius:12,
    padding:'11px 12px',
    fontFamily:'var(--font-body)',
    fontSize:'0.84rem',
    outline:'none',
  },
  numberInput: {
    appearance:'textfield',
    WebkitAppearance:'none',
    MozAppearance:'textfield',
    lineHeight:1.2,
    paddingRight:12,
  },
  submitBtn: {
    background:'linear-gradient(135deg,var(--teal),#0e9f84)',
    border:'none',
    color:'#ffffff',
    borderRadius:12,
    fontFamily:'var(--font-display)',
    fontWeight:800,
    fontSize:'0.82rem',
    cursor:'pointer',
  },
  list: {
    display:'flex',
    flexDirection:'column',
    gap:10,
  },
  empty: {
    border:'1px dashed rgba(148,163,184,0.24)',
    borderRadius:14,
    padding:'18px',
    color:'var(--text-faint)',
    fontSize:'0.84rem',
  },
  listItem: {
    display:'flex',
    alignItems:'center',
    justifyContent:'space-between',
    gap:14,
    border:'1px solid var(--border)',
    borderRadius:16,
    background:'var(--surface2)',
    padding:'14px 16px',
  },
  itemTitle: {
    fontFamily:'var(--font-display)',
    fontWeight:700,
    fontSize:'0.95rem',
    marginBottom:4,
  },
  itemMeta: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.64rem',
    color:'var(--text-faint)',
    textTransform:'uppercase',
    letterSpacing:'0.08em',
  },
  itemValue: {
    fontFamily:'var(--font-display)',
    fontWeight:700,
    fontSize:'0.95rem',
  },
  removeBtn: {
    background:'rgba(248,113,113,0.08)',
    border:'1px solid rgba(248,113,113,0.16)',
    color:'var(--red)',
    borderRadius:10,
    padding:'8px 10px',
    fontFamily:'var(--font-display)',
    fontWeight:700,
    cursor:'pointer',
  },
}

const yw = {
  backdrop: {
    position:'fixed',
    inset:0,
    zIndex:320,
    background:'rgba(15,23,42,0.28)',
    backdropFilter:'blur(16px)',
    WebkitBackdropFilter:'blur(16px)',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    padding:'24px',
  },
  panel: {
    width:'min(920px, 100%)',
    background:'linear-gradient(180deg, rgba(255,255,255,0.99), rgba(247,248,252,0.98))',
    border:'1px solid rgba(15,23,42,0.08)',
    borderRadius:28,
    boxShadow:'0 36px 90px rgba(15,23,42,0.2)',
    overflow:'hidden',
  },
  topBar: { height:3, background:'linear-gradient(90deg, #6d8df7, #8b5cf6, #2ab8a3)' },
  header: {
    display:'flex',
    alignItems:'flex-start',
    justifyContent:'space-between',
    gap:16,
    padding:'26px 28px 14px',
  },
  eyebrow: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.68rem',
    color:'var(--teal)',
    textTransform:'uppercase',
    letterSpacing:'0.16em',
    marginBottom:8,
  },
  titleRow: {
    display:'flex',
    alignItems:'center',
    gap:12,
    flexWrap:'wrap',
  },
  title: {
    margin:0,
    fontFamily:'var(--font-display)',
    fontSize:'1.7rem',
    lineHeight:1.1,
  },
  countPill: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.68rem',
    color:'var(--purple)',
    background:'rgba(139,92,246,0.08)',
    border:'1px solid rgba(139,92,246,0.16)',
    borderRadius:999,
    padding:'5px 10px',
  },
  closeBtn: {
    width:42,
    height:42,
    borderRadius:12,
    border:'1px solid var(--border)',
    background:'rgba(255,255,255,0.92)',
    color:'var(--text-faint)',
    cursor:'pointer',
    flexShrink:0,
  },
  dots: {
    display:'flex',
    gap:8,
    padding:'0 28px 16px',
  },
  dot: {
    width:10,
    height:10,
    borderRadius:'50%',
    border:'none',
    background:'rgba(148,163,184,0.28)',
    cursor:'pointer',
  },
  dotActive: {
    width:30,
    borderRadius:999,
    background:'linear-gradient(90deg, #8b5cf6, #2ab8a3)',
  },
  slide: {
    margin:'0 28px',
    width:'calc(100% - 56px)',
    border:'1px solid rgba(139,92,246,0.14)',
    borderRadius:24,
    background:'linear-gradient(135deg, rgba(109,141,247,0.05), rgba(139,92,246,0.05) 50%, rgba(42,184,163,0.05))',
    padding:'34px 30px 28px',
    textAlign:'left',
  },
  slideIcon: {
    width:76,
    height:76,
    borderRadius:22,
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    fontSize:'2.1rem',
    marginBottom:20,
    background:'rgba(255,255,255,0.72)',
    border:'1px solid rgba(139,92,246,0.14)',
    boxShadow:'0 16px 30px rgba(15,23,42,0.06)',
  },
  slideEyebrow: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.72rem',
    color:'var(--teal)',
    textTransform:'uppercase',
    letterSpacing:'0.14em',
    marginBottom:10,
  },
  slideTitle: {
    fontFamily:'var(--font-display)',
    fontSize:'2.15rem',
    fontWeight:800,
    lineHeight:1.04,
    marginBottom:14,
    maxWidth:680,
  },
  slideBody: {
    fontSize:'1.02rem',
    lineHeight:1.85,
    color:'var(--text-dim)',
    maxWidth:720,
  },
  slideSupport: {
    marginTop:12,
    fontSize:'0.86rem',
    lineHeight:1.72,
    color:'var(--text-faint)',
    maxWidth:680,
  },
  statsGrid: {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))',
    gap:12,
    marginTop:22,
  },
  statCard: {
    border:'1px solid rgba(15,23,42,0.08)',
    borderRadius:16,
    padding:'15px 15px 13px',
    background:'rgba(255,255,255,0.74)',
  },
  statLabel: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.62rem',
    color:'var(--text-faint)',
    textTransform:'uppercase',
    letterSpacing:'0.08em',
    marginBottom:8,
  },
  statValue: {
    fontFamily:'var(--font-display)',
    fontWeight:700,
    fontSize:'1.05rem',
  },
  tapHint: {
    marginTop:22,
    fontFamily:'var(--font-mono)',
    fontSize:'0.68rem',
    color:'var(--text-faint)',
    textTransform:'uppercase',
    letterSpacing:'0.1em',
  },
  summaryList: {
    display:'flex',
    flexDirection:'column',
    gap:12,
    marginTop:20,
    maxWidth:760,
    color:'var(--text-dim)',
    fontSize:'0.92rem',
    lineHeight:1.72,
  },
  summaryRow: {
    display:'flex',
    gap:10,
    alignItems:'flex-start',
  },
  summaryDot: {
    width:8,
    height:8,
    borderRadius:'50%',
    marginTop:7,
    background:'var(--teal)',
    flexShrink:0,
  },
  footer: {
    display:'flex',
    alignItems:'center',
    justifyContent:'space-between',
    gap:16,
    padding:'18px 28px 28px',
    flexWrap:'wrap',
  },
  navBtn: {
    background:'var(--surface2)',
    border:'1px solid var(--border)',
    color:'var(--text-dim)',
    padding:'10px 16px',
    borderRadius:12,
    fontFamily:'var(--font-display)',
    fontWeight:700,
  },
  nextBtn: {
    background:'linear-gradient(135deg,var(--teal),#0e9f84)',
    border:'none',
    color:'#081019',
    padding:'10px 18px',
    borderRadius:12,
    fontFamily:'var(--font-display)',
    fontWeight:800,
    cursor:'pointer',
    boxShadow:'0 10px 24px rgba(42,184,163,0.2)',
  },
  downloadBtn: {
    background:'var(--surface2)',
    border:'1px solid rgba(29,39,56,0.14)',
    color:'var(--gold)',
    padding:'10px 16px',
    borderRadius:12,
    fontFamily:'var(--font-display)',
    fontWeight:700,
    cursor:'pointer',
  },
}

const brm = {
  backdrop: {
    position:'fixed',
    inset:0,
    zIndex:340,
    background:'rgba(15,23,42,0.32)',
    backdropFilter:'blur(16px)',
    WebkitBackdropFilter:'blur(16px)',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    padding:'24px',
  },
  panel: {
    width:'min(920px, 100%)',
    background:'linear-gradient(180deg, rgba(255,255,255,0.99), rgba(247,248,252,0.98))',
    border:'1px solid rgba(15,23,42,0.08)',
    borderRadius:28,
    boxShadow:'0 36px 90px rgba(15,23,42,0.22)',
    overflow:'hidden',
  },
  topBar: { height:3, background:'linear-gradient(90deg, #6d8df7, #8b5cf6, #2ab8a3)' },
  header: {
    display:'grid',
    gridTemplateColumns:'minmax(0, 1.2fr) minmax(220px, 0.8fr)',
    alignItems:'start',
    gap:22,
    padding:'26px 28px 22px',
  },
  headerCopy: {
    minWidth:0,
  },
  headerRail: {
    display:'flex',
    alignItems:'center',
    justifyContent:'flex-end',
    gap:12,
    flexWrap:'nowrap',
  },
  eyebrow: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.68rem',
    color:'var(--teal)',
    textTransform:'uppercase',
    letterSpacing:'0.16em',
    marginBottom:8,
  },
  title: {
    fontFamily:'var(--font-display)',
    fontSize:'1.5rem',
    fontWeight:800,
    lineHeight:1.08,
    marginBottom:10,
  },
  subtext: {
    fontSize:'0.92rem',
    color:'var(--text-dim)',
    lineHeight:1.72,
    maxWidth:460,
  },
  scoreBadge: {
    minWidth:118,
    minHeight:52,
    padding:'0 14px',
    borderRadius:999,
    background:'linear-gradient(180deg, rgba(109,141,247,0.16), rgba(42,184,163,0.1))',
    border:'1px solid rgba(109,141,247,0.24)',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    gap:8,
  },
  scoreValue: {
    fontFamily:'var(--font-display)',
    fontSize:'0.98rem',
    fontWeight:800,
    lineHeight:1,
    color:'var(--text)',
  },
  scoreLabel: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.82rem',
    color:'var(--text-faint)',
    letterSpacing:'0.08em',
  },
  closeBtn: {
    width:52,
    height:52,
    minWidth:52,
    minHeight:52,
    aspectRatio:'1 / 1',
    boxSizing:'border-box',
    display:'inline-flex',
    alignItems:'center',
    justifyContent:'center',
    background:'rgba(255,255,255,0.78)',
    border:'1px solid var(--border)',
    color:'var(--text-dim)',
    padding:0,
    borderRadius:'50%',
    fontFamily:'var(--font-display)',
    fontWeight:700,
    fontSize:'1.15rem',
    lineHeight:1,
    cursor:'pointer',
  },
  body: {
    padding:'0 28px 28px',
    display:'flex',
    flexDirection:'column',
    gap:18,
  },
  sectionLabel: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.68rem',
    color:'var(--text-faint)',
    textTransform:'uppercase',
    letterSpacing:'0.12em',
    marginBottom:10,
  },
  confidencePill: {
    border:'1px solid',
    borderRadius:999,
    minHeight:52,
    padding:'0 18px',
    whiteSpace:'nowrap',
    display:'inline-flex',
    alignItems:'center',
    justifyContent:'center',
    fontFamily:'var(--font-display)',
    fontSize:'0.98rem',
    fontWeight:800,
  },
  breakdownList: {
    display:'flex',
    flexDirection:'column',
    gap:12,
  },
  breakdownRow: {
    display:'flex',
    flexDirection:'column',
    gap:6,
  },
  breakdownHead: {
    display:'flex',
    alignItems:'center',
    justifyContent:'space-between',
    fontSize:'0.88rem',
    color:'var(--text-dim)',
  },
  breakdownValue: {
    fontFamily:'var(--font-mono)',
    color:'var(--text)',
  },
  breakdownTrack: {
    height:6,
    background:'var(--surface2)',
    borderRadius:999,
    overflow:'hidden',
  },
  breakdownFill: {
    height:'100%',
    borderRadius:999,
  },
  grid: {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))',
    gap:16,
  },
  sideColumn: {
    display:'flex',
    flexDirection:'column',
    gap:16,
  },
  card: {
    border:'1px solid var(--border)',
    borderRadius:22,
    background:'rgba(255,255,255,0.62)',
    padding:'18px',
  },
  factGrid: {
    display:'grid',
    gridTemplateColumns:'repeat(2, minmax(0, 1fr))',
    gap:12,
  },
  factItem: {
    border:'1px solid var(--border)',
    borderRadius:16,
    background:'var(--surface)',
    padding:'12px 14px',
    position:'relative',
  },
  factLabel: {
    fontSize:'0.87rem',
    fontWeight:500,
    color:'var(--text)',
    marginBottom:8,
  },
  factValue: {
    fontFamily:'var(--font-display)',
    fontSize:'1.05rem',
    fontWeight:700,
  },
  factTooltip: {
    position:'absolute',
    left:'50%',
    bottom:'calc(100% + 10px)',
    transform:'translateX(-50%)',
    width:'min(260px, calc(100vw - 64px))',
    padding:'10px 12px',
    borderRadius:14,
    background:'#172033',
    color:'rgba(241,245,249,0.96)',
    fontSize:'0.78rem',
    lineHeight:1.6,
    boxShadow:'0 18px 40px rgba(15,23,42,0.26)',
    border:'1px solid rgba(148,163,184,0.18)',
    zIndex:2,
    pointerEvents:'none',
  },
  insightItem: {
    border:'1px solid rgba(42,184,163,0.14)',
    borderRadius:16,
    background:'rgba(42,184,163,0.06)',
    padding:'12px 14px',
    fontSize:'0.88rem',
    color:'var(--text-dim)',
    lineHeight:1.65,
  },
}
