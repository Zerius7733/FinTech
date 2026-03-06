// ── App config ─────────────────────────────────────────────────────────────
export const WS_CONFIG = {
  API_BASE: 'http://localhost:8000/api',
  RISK_FACTORS: { conservative: 1.0, balanced: 0.7, aggressive: 0.5 },
  RISK_ALLOCATIONS: {
    conservative: { equity: 30, bonds: 60, alt: 10 },
    balanced:     { equity: 60, bonds: 30, alt: 10 },
    aggressive:   { equity: 90, bonds:  5, alt:  5 },
  },
}

// ── Portfolio nodes ─────────────────────────────────────────────────────────
// Nodes are clustered by investment TYPE, each mapped into its corresponding
// zone territory on the globe (not by geography).
export const MOCK_NODES = [

  // ═══ EQUITIES ZONE (abstract · lat≈32, lng≈-117) ═════════════════════════
  {
    id:'stocks_us', lat:42, lng:-126, label:'US Stocks', flag:'📈', region:'Equities',
    color:0x60a5fa, type:'equity', aum:184250, mtd:3.2,
    holdings:[
      { ticker:'GOOGL', name:'Alphabet Inc.',    price:178.42, change: 2.14, shares:45, dir:'up' },
      { ticker:'MSFT',  name:'Microsoft Corp.',  price:414.80, change: 0.87, shares:28, dir:'up' },
      { ticker:'NVDA',  name:'NVIDIA Corp.',     price:875.25, change:-1.23, shares:15, dir:'dn' },
      { ticker:'AMZN',  name:'Amazon.com Inc.',  price:196.10, change: 1.55, shares:52, dir:'up' },
    ],
    alloc:[
      { label:'Technology',  pct:58, color:'#60a5fa' },
      { label:'Consumer',    pct:22, color:'#93c5fd' },
      { label:'Healthcare',  pct:12, color:'#34d399'  },
      { label:'Other',       pct:8,  color:'#475569'  },
    ],
    wellness:82, returnPct:'+18.4%',
  },
  {
    id:'stocks_global', lat:25, lng:-110, label:'Global Equities', flag:'🌐', region:'Equities',
    color:0x60a5fa, type:'equity', aum:134500, mtd:2.1,
    holdings:[
      { ticker:'SAP',      name:'SAP SE',             price:186.40, change: 1.8,  shares:80,  dir:'up' },
      { ticker:'NESN',     name:'Nestlé S.A.',         price:94.50,  change: 0.2,  shares:150, dir:'up' },
      { ticker:'RELIANCE', name:'Reliance Ind.',       price:2820,   change: 2.4,  shares:50,  dir:'up' },
      { ticker:'BABA',     name:'Alibaba Group',       price:74,     change:-3.2,  shares:300, dir:'dn' },
    ],
    alloc:[
      { label:'Europe',    pct:38, color:'#60a5fa' },
      { label:'Asia',      pct:42, color:'#3b82f6'  },
      { label:'LatAm',     pct:12, color:'#1d4ed8'  },
      { label:'Other',     pct:8,  color:'#475569'  },
    ],
    wellness:74, returnPct:'+11.2%',
  },
  {
    id:'stocks_em', lat:36, lng:-102, label:'Emerging Markets', flag:'🚀', region:'Equities',
    color:0x60a5fa, type:'equity', aum:68400, mtd:-1.4,
    holdings:[
      { ticker:'VALE3',    name:'Vale S.A.',            price:68.20,  change:-2.1,  shares:200, dir:'dn' },
      { ticker:'TCS',      name:'Tata Consultancy',     price:3940,   change: 1.8,  shares:30,  dir:'up' },
      { ticker:'0700.HK',  name:'Tencent Holdings',     price:362,    change:-1.8,  shares:120, dir:'dn' },
      { ticker:'ITUB4',    name:'Itaú Unibanco',        price:28.90,  change:-0.6,  shares:500, dir:'dn' },
    ],
    alloc:[
      { label:'LatAm',     pct:30, color:'#60a5fa' },
      { label:'South Asia',pct:38, color:'#2563eb'  },
      { label:'East Asia', pct:24, color:'#1d4ed8'  },
      { label:'Other',     pct:8,  color:'#475569'  },
    ],
    wellness:61, returnPct:'+7.3%',
  },

  // ═══ BONDS ZONE (abstract · lat≈53, lng≈-31) ════════════════════════════
  {
    id:'bonds_gov', lat:59, lng:-38, label:'Government Bonds', flag:'🏛️', region:'Bonds',
    color:0xa78bfa, type:'bond', aum:95000, mtd:0.8,
    holdings:[
      { ticker:'T-10Y',  name:'US 10Yr Treasury',   price:97.80,  change: 0.12, shares:200, dir:'up' },
      { ticker:'GILT',   name:'UK 10Yr Gilt',        price:95.40,  change:-0.08, shares:100, dir:'dn' },
      { ticker:'BUND',   name:'German Bund 10Yr',    price:99.10,  change: 0.05, shares:150, dir:'up' },
    ],
    alloc:[
      { label:'US Treasuries',  pct:48, color:'#a78bfa' },
      { label:'EU Sovereign',   pct:32, color:'#7c3aed'  },
      { label:'Asia Sovereign', pct:20, color:'#6d28d9'  },
    ],
    wellness:80, returnPct:'+2.8%',
  },
  {
    id:'bonds_corp', lat:47, lng:-24, label:'Corporate Bonds', flag:'🏢', region:'Bonds',
    color:0xa78bfa, type:'bond', aum:62000, mtd:0.5,
    holdings:[
      { ticker:'MSFT-5Y', name:'Microsoft 5Yr Bond',  price:101.20, change: 0.08, shares:100, dir:'up' },
      { ticker:'JPM-3Y',  name:'JPMorgan 3Yr Note',   price:99.80,  change:-0.05, shares:150, dir:'dn' },
      { ticker:'AAPL-7Y', name:'Apple 7Yr Bond',      price:102.40, change: 0.11, shares:80,  dir:'up' },
    ],
    alloc:[
      { label:'IG Corporate', pct:60, color:'#a78bfa' },
      { label:'HY Corporate', pct:25, color:'#8b5cf6'  },
      { label:'EM Debt',      pct:15, color:'#7c3aed'  },
    ],
    wellness:74, returnPct:'+3.2%',
  },

  // ═══ REAL ASSETS ZONE (abstract · lat≈14, lng≈40) ══════════════════════
  {
    id:'real_estate', lat:21, lng:31, label:'Real Estate', flag:'🏠', region:'Real Assets',
    color:0x34d399, type:'real', aum:320000, mtd:1.1,
    holdings:[
      { ticker:'CBD-01',  name:'CBD Office Unit',    price:850000, change: 1.1,  shares:1,    dir:'up' },
      { ticker:'REIT-AX', name:'Ascendas REIT',      price:2.84,   change: 0.35, shares:5000, dir:'up' },
      { ticker:'VNQ',     name:'Vanguard REIT ETF',  price:88.40,  change:-0.4,  shares:200,  dir:'dn' },
      { ticker:'CICT',    name:'CapitaLand Int.',    price:1.98,   change:-0.1,  shares:8000, dir:'dn' },
    ],
    alloc:[
      { label:'Direct Property', pct:55, color:'#c9a84c' },
      { label:'REITs',           pct:30, color:'#a16207'  },
      { label:'Mortgages',       pct:15, color:'#78350f'  },
    ],
    wellness:68, returnPct:'+5.8%',
  },
  {
    id:'infrastructure', lat:8, lng:49, label:'Infrastructure', flag:'🏗️', region:'Real Assets',
    color:0x34d399, type:'real', aum:67300, mtd:0.9,
    holdings:[
      { ticker:'ENB',  name:'Enbridge Inc.',      price:47.32, change: 1.2, shares:320, dir:'up' },
      { ticker:'BIP',  name:'Brookfield Infra.',  price:36.80, change: 0.6, shares:250, dir:'up' },
      { ticker:'TRPL', name:'Transurban Group',   price:13.20, change:-0.3, shares:600, dir:'dn' },
    ],
    alloc:[
      { label:'Utilities',  pct:40, color:'#c9a84c' },
      { label:'Transport',  pct:35, color:'#a16207'  },
      { label:'Telecoms',   pct:25, color:'#92400e'  },
    ],
    wellness:72, returnPct:'+6.4%',
  },

  // ═══ DIGITAL ASSETS ZONE (abstract · lat≈41, lng≈115) ════════════════════
  {
    id:'crypto_major', lat:48, lng:106, label:'Major Crypto', flag:'₿', region:'Digital Assets',
    color:0x2dd4bf, type:'crypto', aum:38500, mtd:12.4,
    holdings:[
      { ticker:'BTC', name:'Bitcoin',   price:67420, change: 5.21, shares:0.42, dir:'up' },
      { ticker:'ETH', name:'Ethereum',  price:3420,  change:-2.10, shares:3.5,  dir:'dn' },
      { ticker:'SOL', name:'Solana',    price:182,   change: 8.40, shares:20,   dir:'up' },
    ],
    alloc:[
      { label:'Bitcoin',  pct:62, color:'#2dd4bf' },
      { label:'Ethereum', pct:28, color:'#0f766e'  },
      { label:'Solana',   pct:10, color:'#14b8a6'  },
    ],
    wellness:55, returnPct:'+41.2%',
  },
  {
    id:'defi', lat:34, lng:124, label:'DeFi & Web3', flag:'🔗', region:'Digital Assets',
    color:0x2dd4bf, type:'crypto', aum:10000, mtd:8.6,
    holdings:[
      { ticker:'ARB',  name:'Arbitrum', price:1.28,  change: 4.20, shares:5000, dir:'up' },
      { ticker:'UNI',  name:'Uniswap',  price:8.42,  change: 2.80, shares:800,  dir:'up' },
      { ticker:'AAVE', name:'Aave',     price:142,   change:-3.10, shares:25,   dir:'dn' },
    ],
    alloc:[
      { label:'L2 Scaling', pct:45, color:'#2dd4bf' },
      { label:'DEX / AMM',  pct:30, color:'#0f766e'  },
      { label:'Lending',    pct:25, color:'#14b8a6'  },
    ],
    wellness:48, returnPct:'+28.4%',
  },

  // ═══ COMMODITIES ZONE (lat≈-38, lng≈-4) ════════════════════════════
  // All commodities cluster in one southern zone — no geographic split
  {
    id:'precious_metals', lat:-29, lng:-15, label:'Precious Metals', flag:'🪙', region:'Commodities',
    color:0xfbbf24, type:'commodity', aum:46400, mtd:2.7,
    holdings:[
      { ticker:'GOLD', name:'Gold ETF',         price:2320,  change:1.4,  shares:6,   dir:'up' },
      { ticker:'SLV',  name:'Silver ETF',        price:27,    change:2.1,  shares:80,  dir:'up' },
      { ticker:'GFI',  name:'Gold Fields Ltd.',  price:14.50, change:1.4,  shares:400, dir:'up' },
    ],
    alloc:[
      { label:'Gold',     pct:65, color:'#fbbf24' },
      { label:'Silver',   pct:20, color:'#f59e0b'  },
      { label:'Platinum', pct:15, color:'#d97706'  },
    ],
    wellness:75, returnPct:'+9.8%',
  },
  {
    id:'energy', lat:-44, lng:-5, label:'Energy & Oil', flag:'⛽', region:'Commodities',
    color:0xfbbf24, type:'commodity', aum:41800, mtd:1.8,
    holdings:[
      { ticker:'SU',   name:'Suncor Energy', price:52.10,  change: 0.9, shares:180, dir:'up' },
      { ticker:'XOM',  name:'ExxonMobil',    price:114.50, change: 1.4, shares:90,  dir:'up' },
      { ticker:'SHEL', name:'Shell PLC',     price:31.80,  change:-0.5, shares:200, dir:'dn' },
    ],
    alloc:[
      { label:'Oil & Gas',  pct:65, color:'#fbbf24' },
      { label:'Pipelines',  pct:22, color:'#f59e0b'  },
      { label:'Renewables', pct:13, color:'#92400e'  },
    ],
    wellness:70, returnPct:'+7.3%',
  },
  // Australia cluster comment removed — all in same commodities zone
  {
    id:'mining', lat:-38, lng:9, label:'Natural Resources', flag:'⛏️', region:'Commodities',
    color:0xfbbf24, type:'commodity', aum:28000, mtd:1.2,
    holdings:[
      { ticker:'BHP',  name:'BHP Group',      price:44,    change:1.9,  shares:200, dir:'up' },
      { ticker:'IRON', name:'Iron Ore Fund',  price:118,   change:3.2,  shares:50,  dir:'up' },
      { ticker:'AGL',  name:'Anglo American', price:22.80, change:0.8,  shares:300, dir:'up' },
    ],
    alloc:[
      { label:'Mining',   pct:55, color:'#fbbf24' },
      { label:'Iron Ore', pct:28, color:'#f59e0b'  },
      { label:'Lithium',  pct:17, color:'#d97706'  },
    ],
    wellness:69, returnPct:'+8.1%',
  },
]

// ── Ticker tape ─────────────────────────────────────────────────────────────
// Shape mirrors GET /api/market/tickers
export const MOCK_TICKERS = [
  {sym:'GOOGL', price:'$178.42', chg:'+2.14%', up:true},
  {sym:'MSFT',  price:'$414.80', chg:'+0.87%', up:true},
  {sym:'NVDA',  price:'$875.25', chg:'-1.23%', up:false},
  {sym:'BTC',   price:'$67,420', chg:'+5.21%', up:true},
  {sym:'ETH',   price:'$3,420',  chg:'-2.10%', up:false},
  {sym:'SPY',   price:'$524.10', chg:'+0.44%', up:true},
  {sym:'GLD',   price:'$232.00', chg:'+1.40%', up:true},
  {sym:'AMZN',  price:'$196.10', chg:'+1.55%', up:true},
  {sym:'SOL',   price:'$182.00', chg:'+8.40%', up:true},
  {sym:'7203.T',price:'¥2,845',  chg:'-0.50%', up:false},
]

// ── User profile ─────────────────────────────────────────────────────────────
// Shape mirrors GET /api/user/profile
export const MOCK_USER = {
  id:'u_123', name:'Alex Chen', initials:'AC',
  ageGroup:'30–44', investorType:'Individual Investor',
  riskLevel:'balanced', riskFactor:0.7,
  currency:'SGD', country:'Singapore',
  horizon:'3–5yr', goals:['wealth_growth'],
  memberSince:'Jan 2024',
  totalAUM:677750, ytdReturn:18.4, dayPL:14432,
  wellnessScore:73, positions:14,
}

// ── Peer benchmark ───────────────────────────────────────────────────────────
// Shape mirrors GET /api/benchmark/peers?ageGroup=30-44
export const MOCK_BENCHMARK = {
  ageGroup:'30–44', sampleSize:2847,
  source:'MAS MoM Household Finance Survey · Q4 2024',
  medianAUM:420000, medianYTD:14.8,
  medianDiversification:60, medianAssetClasses:3, medianDigitalAlloc:6,
  percentiles:{ aum:84, returns:76, diversity:91 },
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export function genSparkline(dir, len = 20) {
  const pts = [0.5]
  for (let i = 1; i < len; i++) {
    const drift = dir === 'up' ? 0.03 : -0.03
    pts.push(Math.max(0.05, Math.min(0.95, pts[i-1] + drift + (Math.random()-0.5)*0.08)))
  }
  return pts
}

export function genPriceSeries(trend, len = 40) {
  const pts = [0.5]
  for (let i = 1; i < len; i++) {
    const drift = (trend / 100) * 0.04
    pts.push(Math.max(0.05, Math.min(0.95, pts[i-1] + drift + (Math.random()-0.48)*0.06)))
  }
  return pts
}