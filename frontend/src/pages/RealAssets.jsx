import MarketTablePage from '../components/MarketTablePage.jsx'

export default function RealAssets() {
  return (
    <MarketTablePage
      endpoint="real-assets"
      title="Real Assets"
      accentLabel="Hard asset proxies shown"
      description="Monitor listed real-estate and real-asset securities with current pricing, depth, and market leadership."
    />
  )
}
