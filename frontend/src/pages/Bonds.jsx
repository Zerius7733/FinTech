import MarketTablePage from '../components/MarketTablePage.jsx'

export default function Bonds() {
  return (
    <MarketTablePage
      endpoint="bonds"
      title="Bonds"
      accentLabel="Fixed income shown"
      description="Track liquid bond ETFs and treasury-linked fixed-income vehicles with live pricing and short-term move context."
    />
  )
}
