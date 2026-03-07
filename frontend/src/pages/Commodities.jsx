import MarketTablePage from '../components/MarketTablePage.jsx'

export default function Commodities() {
  return (
    <MarketTablePage
      endpoint="commodities"
      title="Commodities"
      accentLabel="Hard assets shown"
      description="Track major commodity benchmarks across energy, metals, and agriculture with live market moves."
    />
  )
}
