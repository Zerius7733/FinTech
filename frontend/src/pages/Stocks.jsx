import MarketTablePage from '../components/MarketTablePage.jsx'

export default function Stocks() {
  return (
    <MarketTablePage
      endpoint="stocks"
      title="Stocks"
      accentLabel="Equities shown"
      description="Browse listed equities with current pricing, market-cap leadership, and short-term price moves."
    />
  )
}
