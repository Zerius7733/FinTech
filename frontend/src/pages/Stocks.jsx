import MarketTablePage from '../components/MarketTablePage.jsx'

export default function Stocks() {
  return (
    <MarketTablePage
      endpoint="stocks"
      title="Stocks & ETFs"
      accentLabel="Markets shown"
      description="Browse equities, ETFs, and Singapore market instruments with current pricing and short-term price moves."
    />
  )
}
