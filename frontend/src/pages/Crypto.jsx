import MarketTablePage from '../components/MarketTablePage.jsx'

export default function Crypto() {
  return (
    <MarketTablePage
      endpoint="cryptos"
      title="Crypto"
      accentLabel="Digital assets shown"
      description="Monitor leading digital assets with live pricing, daily momentum, and market activity in one view."
    />
  )
}
