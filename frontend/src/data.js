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
// Shape mirrors GET /api/portfolio/nodes
export const MOCK_NODES = [
  // ── Americas ──────────────────────────────────────────────────────────────
  {
    id:'us', lat:38, lng:-97, label:'US Equity', flag:'🇺🇸', region:'North America',
    color:0x60a5fa, type:'equity', aum:184250, mtd:3.2,
    holdings:[
      {ticker:'GOOGL',name:'Alphabet Inc.',   price:178.42, change: 2.14, shares:45,  dir:'up'},
      {ticker:'MSFT', name:'Microsoft Corp.', price:414.80, change: 0.87, shares:28,  dir:'up'},
      {ticker:'NVDA', name:'NVIDIA Corp.',    price:875.25, change:-1.23, shares:15,  dir:'dn'},
      {ticker:'AMZN', name:'Amazon.com Inc.', price:196.10, change: 1.55, shares:52,  dir:'up'},
    ],
    alloc:[
      {label:'Tech',       pct:58, color:'#60a5fa'},
      {label:'Consumer',   pct:22, color:'#a78bfa'},
      {label:'Healthcare', pct:12, color:'#34d399'},
      {label:'Other',      pct:8,  color:'#475569'},
    ],
    wellness:82, returnPct:'+18.4%',
  },
  {
    id:'ca', lat:56, lng:-106, label:'Canada Energy', flag:'🇨🇦', region:'North America',
    color:0xf97316, type:'commodity', aum:41800, mtd:1.8,
    holdings:[
      {ticker:'ENB',  name:'Enbridge Inc.',     price:47.32, change: 1.2, shares:320, dir:'up'},
      {ticker:'SU',   name:'Suncor Energy',     price:52.10, change: 0.9, shares:180, dir:'up'},
      {ticker:'CNQ',  name:'Canadian Natural',  price:88.40, change:-0.4, shares:90,  dir:'dn'},
    ],
    alloc:[
      {label:'Oil & Gas', pct:65, color:'#f97316'},
      {label:'Pipelines', pct:25, color:'#fb923c'},
      {label:'Utilities', pct:10, color:'#475569'},
    ],
    wellness:72, returnPct:'+9.3%',
  },
  {
    id:'br', lat:-14, lng:-51, label:'Brazil Growth', flag:'🇧🇷', region:'Latin America',
    color:0x4ade80, type:'equity', aum:29500, mtd:-1.4,
    holdings:[
      {ticker:'VALE3', name:'Vale S.A.',         price:68.20, change:-2.1, shares:200, dir:'dn'},
      {ticker:'PETR4', name:'Petrobras',         price:38.50, change: 0.8, shares:400, dir:'up'},
      {ticker:'ITUB4', name:'Itaú Unibanco',     price:28.90, change:-0.6, shares:500, dir:'dn'},
    ],
    alloc:[
      {label:'Mining',    pct:40, color:'#4ade80'},
      {label:'Energy',    pct:35, color:'#22c55e'},
      {label:'Financials',pct:25, color:'#16a34a'},
    ],
    wellness:58, returnPct:'+4.7%',
  },

  // ── Europe ────────────────────────────────────────────────────────────────
  {
    id:'uk', lat:51.5, lng:-0.1, label:'UK Bonds', flag:'🇬🇧', region:'Europe',
    color:0xa78bfa, type:'bond', aum:62000, mtd:0.8,
    holdings:[
      {ticker:'GILT-2Y', name:'UK 2Yr Gilt',   price:98.20, change: 0.12, shares:200, dir:'up'},
      {ticker:'GILT-10Y',name:'UK 10Yr Gilt',  price:95.40, change:-0.08, shares:100, dir:'dn'},
      {ticker:'ISF',     name:'iShares UK ETF',price:8.42,  change: 0.31, shares:600, dir:'up'},
    ],
    alloc:[{label:'Short Dur.',pct:55,color:'#a78bfa'},{label:'Long Dur.',pct:30,color:'#7c3aed'},{label:'IG Corp.',pct:15,color:'#6d28d9'}],
    wellness:74, returnPct:'+2.1%',
  },
  {
    id:'de', lat:51, lng:10, label:'EU Tech', flag:'🇩🇪', region:'Europe',
    color:0x38bdf8, type:'equity', aum:53200, mtd:2.1,
    holdings:[
      {ticker:'SAP',  name:'SAP SE',          price:186.40, change: 1.8, shares:80,  dir:'up'},
      {ticker:'SIE',  name:'Siemens AG',      price:176.20, change: 0.6, shares:60,  dir:'up'},
      {ticker:'BAYN', name:'Bayer AG',        price:29.50,  change:-1.2, shares:200, dir:'dn'},
    ],
    alloc:[
      {label:'Software',  pct:48, color:'#38bdf8'},
      {label:'Industrial',pct:32, color:'#0ea5e9'},
      {label:'Healthcare',pct:20, color:'#0284c7'},
    ],
    wellness:76, returnPct:'+11.2%',
  },
  {
    id:'ch', lat:46.8, lng:8.2, label:'Swiss Private', flag:'🇨🇭', region:'Europe',
    color:0xf0abfc, type:'bond', aum:95000, mtd:0.4,
    holdings:[
      {ticker:'NESN', name:'Nestlé S.A.',     price:94.50, change: 0.2, shares:150, dir:'up'},
      {ticker:'NOVN', name:'Novartis AG',     price:92.80, change: 0.5, shares:120, dir:'up'},
      {ticker:'ROG',  name:'Roche Holding',  price:256.40,change:-0.3, shares:40,  dir:'dn'},
    ],
    alloc:[
      {label:'Consumer',  pct:38, color:'#f0abfc'},
      {label:'Pharma',    pct:42, color:'#e879f9'},
      {label:'Financials',pct:20, color:'#c026d3'},
    ],
    wellness:88, returnPct:'+3.8%',
  },

  // ── Asia ──────────────────────────────────────────────────────────────────
  {
    id:'sg', lat:1.35, lng:103.82, label:'SG Real Estate', flag:'🇸🇬', region:'Southeast Asia',
    color:0xc9a84c, type:'real', aum:320000, mtd:1.1,
    holdings:[
      {ticker:'PRIV-01',name:'CBD Office Unit', price:850000,change: 1.1, shares:1,    dir:'up'},
      {ticker:'REIT-AX',name:'Ascendas REIT',   price:2.84,  change: 0.35,shares:5000, dir:'up'},
      {ticker:'CICT',   name:'CapitaLand Int.', price:1.98,  change:-0.1, shares:8000, dir:'dn'},
    ],
    alloc:[{label:'Direct',pct:62,color:'#c9a84c'},{label:'REITs',pct:28,color:'#92400e'},{label:'Dev.',pct:10,color:'#78350f'}],
    wellness:68, returnPct:'+5.8%',
  },
  {
    id:'jp', lat:35.7, lng:139.7, label:'Japan Equity', flag:'🇯🇵', region:'East Asia',
    color:0xf87171, type:'equity', aum:35000, mtd:-0.5,
    holdings:[
      {ticker:'7203.T',name:'Toyota Motor',  price:2845,  change:-0.5, shares:80,  dir:'dn'},
      {ticker:'6758.T',name:'Sony Group',    price:12480, change: 1.2, shares:15,  dir:'up'},
      {ticker:'9984.T',name:'SoftBank Group',price:7820,  change:-1.8, shares:30,  dir:'dn'},
    ],
    alloc:[{label:'Auto',pct:42,color:'#f87171'},{label:'Tech',pct:38,color:'#fca5a5'},{label:'Telecom',pct:20,color:'#fecaca'}],
    wellness:71, returnPct:'+4.2%',
  },
  {
    id:'in', lat:20, lng:77, label:'India Growth', flag:'🇮🇳', region:'South Asia',
    color:0xfbbf24, type:'equity', aum:67300, mtd:4.8,
    holdings:[
      {ticker:'RELIANCE',name:'Reliance Ind.',   price:2820, change: 2.4, shares:50,  dir:'up'},
      {ticker:'TCS',     name:'Tata Consultancy',price:3940, change: 1.8, shares:30,  dir:'up'},
      {ticker:'HDFCBANK',name:'HDFC Bank',       price:1580, change: 0.9, shares:100, dir:'up'},
      {ticker:'INFY',    name:'Infosys Ltd.',    price:1620, change:-0.6, shares:80,  dir:'dn'},
    ],
    alloc:[
      {label:'Tech & IT', pct:45, color:'#fbbf24'},
      {label:'Energy',    pct:25, color:'#f59e0b'},
      {label:'Financials',pct:20, color:'#d97706'},
      {label:'Consumer',  pct:10, color:'#92400e'},
    ],
    wellness:79, returnPct:'+22.1%',
  },
  {
    id:'cn', lat:35, lng:105, label:'China Tech', flag:'🇨🇳', region:'East Asia',
    color:0xfb7185, type:'equity', aum:48900, mtd:-2.3,
    holdings:[
      {ticker:'0700.HK',name:'Tencent Holdings', price:362, change:-1.8, shares:120, dir:'dn'},
      {ticker:'9988.HK',name:'Alibaba Group',    price:74,  change:-3.2, shares:300, dir:'dn'},
      {ticker:'3690.HK',name:'Meituan',          price:128, change: 0.9, shares:200, dir:'up'},
    ],
    alloc:[
      {label:'E-Commerce',pct:40, color:'#fb7185'},
      {label:'Social/Gaming',pct:38, color:'#f43f5e'},
      {label:'Delivery',  pct:22, color:'#e11d48'},
    ],
    wellness:52, returnPct:'-4.6%',
  },

  // ── Digital / Middle East ─────────────────────────────────────────────────
  {
    id:'crypto', lat:25, lng:55, label:'Digital Assets', flag:'₿', region:'Global',
    color:0x2dd4bf, type:'crypto', aum:48500, mtd:12.4,
    holdings:[
      {ticker:'BTC', name:'Bitcoin',   price:67420, change: 5.21, shares:0.42, dir:'up'},
      {ticker:'ETH', name:'Ethereum',  price: 3420, change:-2.10, shares:3.5,  dir:'dn'},
      {ticker:'SOL', name:'Solana',    price:  182, change: 8.40, shares:20,   dir:'up'},
      {ticker:'ARB', name:'Arbitrum',  price:  1.28,change: 4.20, shares:5000, dir:'up'},
    ],
    alloc:[
      {label:'Bitcoin',  pct:52, color:'#2dd4bf'},
      {label:'Ethereum', pct:28, color:'#0f766e'},
      {label:'L1 Alt',   pct:12, color:'#14b8a6'},
      {label:'L2 Alt',   pct:8,  color:'#0d9488'},
    ],
    wellness:55, returnPct:'+41.2%',
  },

  // ── Oceania / Africa ──────────────────────────────────────────────────────
  {
    id:'au', lat:-25, lng:133, label:'AU Commodities', flag:'🇦🇺', region:'Oceania',
    color:0xfbbf24, type:'commodity', aum:28000, mtd:2.7,
    holdings:[
      {ticker:'GOLD',name:'Gold ETF',      price:2320, change:1.4, shares:6,  dir:'up'},
      {ticker:'IRON',name:'Iron Ore Fund', price: 118, change:3.2, shares:50, dir:'up'},
      {ticker:'BHP', name:'BHP Group',     price: 44,  change:1.9, shares:200,dir:'up'},
    ],
    alloc:[{label:'Precious',pct:50,color:'#fbbf24'},{label:'Industrial',pct:35,color:'#f59e0b'},{label:'Mining Eq.',pct:15,color:'#92400e'}],
    wellness:77, returnPct:'+9.1%',
  },
  {
    id:'za', lat:-29, lng:25, label:'Africa Resources', flag:'🇿🇦', region:'Africa',
    color:0x86efac, type:'commodity', aum:18400, mtd:0.6,
    holdings:[
      {ticker:'AGL', name:'Anglo American',   price:22.80, change: 0.8, shares:300, dir:'up'},
      {ticker:'GFI', name:'Gold Fields Ltd.', price:14.50, change: 1.4, shares:400, dir:'up'},
      {ticker:'SSW', name:'Sibanye Stillwater',price:4.20, change:-1.1, shares:800, dir:'dn'},
    ],
    alloc:[
      {label:'Diversified', pct:42, color:'#86efac'},
      {label:'Gold',        pct:38, color:'#4ade80'},
      {label:'Platinum',    pct:20, color:'#22c55e'},
    ],
    wellness:61, returnPct:'+6.3%',
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