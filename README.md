# FinTech Wellness Application

A comprehensive financial wellness platform that helps users manage their investment portfolios, get personalized insights, and plan for retirement.

## 🚀 Features

- **Portfolio Management** - Track stocks, crypto, and commodities
- **Market Data** - Real-time price updates and market analysis
- **AI Insights** - Get personalized recommendations powered by GPT-4 and Ollama
- **Retirement Planning** - Plan your retirement with peer benchmarking
- **Screenshot Import** - Import portfolios from screenshots
- **Multi-Asset Support** - Stocks, cryptocurrencies, commodities, and more

---

## 📦 Tech Stack

### Frontend
- **React** with Vite
- **TailwindCSS** for styling
- **Axios** for API calls
- Responsive design with mobile support

### Backend
- **FastAPI** for REST API
- **Python 3.11**
- **PostgreSQL/JSON** for data storage
- Real-time market data integration

### DevOps
- **Docker & Docker Compose** for containerization
- **Railway** for cloud deployment
- **GitHub** for version control

---

## 🐳 Quick Start with Docker

The easiest way to run the application locally:

```powershell
docker-compose up --build
```

Then open:
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8000/docs

📖 **Detailed Setup Guide:** See [DOCKER.md](DOCKER.md) for comprehensive Docker instructions.

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [DOCKER.md](DOCKER.md) | Complete Docker setup and troubleshooting guide |
| [DOCKER-QUICK-REF.md](DOCKER-QUICK-REF.md) | Quick command reference |
| [backend/README.md](backend/README.md) | Backend API documentation |
| [frontend/README.md](frontend/README.md) | Frontend development guide |

---

## 🛠️ Local Development (Without Docker)

### Backend Setup
```powershell
# Navigate to project root
cd FinTech

# Create virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Configure environment
Copy-Item .env.example .env  # Edit with your API keys

# Run server
uvicorn backend.app:app --reload
```

Backend will be available at: **http://localhost:8000**

### Frontend Setup
```powershell
cd frontend

# Install dependencies
npm install

# Create environment file
Copy-Item .env.example .env  # Edit API URL

# Run development server
npm run dev
```

Frontend will be available at: **http://localhost:5173**

---

## 🚀 Deployment

### Deploy to Railway

1. **Backend:**
   - Connect your GitHub repository
   - Deploy using `Procfile` or `Dockerfile`
   - Set environment variables in Railway dashboard
   - Production URL: https://fintech-production-d308.up.railway.app

2. **Frontend:**
   - Deploy from `frontend/Dockerfile`
   - Set `VITE_API_URL` to production backend
   - Production URL: https://frontend-production-6554.up.railway.app

---

## 🔑 Environment Variables

### Development (`.env`)
```env
# Backend API
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8000

# Frontend
VITE_API_URL=http://localhost:8000

# External Services
NEWSAPI_KEY=your_key_here
ALPHAVANTAGE_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

See [.env.example](.env.example) for full list.

---

## 📂 Project Structure

```
FinTech/
├── backend/                    # FastAPI application
│   ├── app.py                 # Main application
│   ├── services/              # Business logic
│   ├── json_data/             # Data storage
│   └── Dockerfile             # Backend container
│
├── frontend/                   # React application
│   ├── src/
│   │   ├── pages/            # Page components
│   │   ├── components/       # Reusable components
│   │   └── utils/            # Helper functions
│   └── Dockerfile            # Frontend container
│
├── docker-compose.yml          # Multi-container orchestration
├── DOCKER.md                   # Docker setup guide
├── README.md                   # This file
└── requirements.txt            # Python dependencies
```

---

## 🐛 Troubleshooting

### Common Issues

**Docker containers won't start:**
```powershell
docker-compose down
docker-compose up --build
```

**Port already in use:**
```powershell
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

**Backend import errors:**
```powershell
docker-compose down
docker-compose up --build
```

See [DOCKER.md](DOCKER.md) for more troubleshooting solutions.

---

## 👥 Team Workflow

1. **Setup:** Follow [DOCKER.md](DOCKER.md) for first-time setup
2. **Development:** Use `docker-compose up --build` to run locally
3. **Testing:** Check both frontend (5173) and backend (8000) endpoints
4. **Deployment:** Push to GitHub, Railway auto-deploys

---

## 📊 API Documentation

Once the backend is running, visit:

**http://localhost:8000/docs**

This provides an interactive Swagger UI to test all API endpoints.

---

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test locally with Docker
4. Push to GitHub
5. Create a pull request

---

## 📝 License

This project is proprietary. All rights reserved.

---

## 📞 Support

For issues or questions:
- Check [DOCKER.md](DOCKER.md) troubleshooting section
- Review API documentation at `/docs`
- Check backend/frontend README files

---

**Last Updated:** March 9, 2026  
**Current Branch:** docker  
**Status:** Development
