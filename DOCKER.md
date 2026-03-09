# Docker Setup Guide - FinTech Application

This guide explains how to use Docker to run the FinTech application with both frontend and backend services.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Environment Configuration](#environment-configuration)
- [Running the Application](#running-the-application)
- [Verification](#verification)
- [Common Commands](#common-commands)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

1. **Docker Desktop** - Download from [docker.com](https://www.docker.com/products/docker-desktop)
   - For Windows: Ensure WSL 2 is installed
   - For Mac: Apple Silicon (M1/M2) or Intel-based systems supported
   - For Linux: Docker Engine and Docker Compose

2. **Git** (optional, but recommended for version control)

### Verify Installation

To verify Docker is properly installed:

```powershell
docker --version
docker-compose --version
```

Both commands should return version numbers.

---

## Quick Start

```powershell
# Navigate to project root
cd "c:\Users\DELL G15\Desktop\SCHOOL\test\fintech proj\FinTech"

# Start both services
docker-compose up --build

# In browser, visit:
# Frontend: http://localhost:5173
# Backend API: http://localhost:8000/docs
```

That's it! Your application is running.

---

## Project Structure

```
FinTech/
├── backend/
│   ├── Dockerfile              # Backend container configuration
│   ├── app.py                  # FastAPI application entry point
│   ├── services/               # Business logic modules
│   ├── json_data/              # Data storage
│   └── csv_data/               # User data
│
├── frontend/
│   ├── Dockerfile              # Frontend container configuration
│   ├── src/                    # React source code
│   ├── package.json            # Node.js dependencies
│   └── vite.config.js          # Vite build config
│
├── docker-compose.yml          # Multi-container orchestration
├── .env                        # Development environment variables
├── .env.production             # Production environment variables
└── requirements.txt            # Python dependencies
```

---

## Environment Configuration

### Development Environment (`.env`)

Used when running locally. Contains API keys and local settings:

```env
# API Configuration
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8000,http://127.0.0.1:5173

# External Services
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b-instruct
NEWSAPI_KEY=your_key_here
```

### Production Environment (`.env.production`)

Used for Railway deployment:

```env
# Production CORS
ALLOWED_ORIGINS=https://frontend-production-6554.up.railway.app

# Production API
# Keep sensitive keys in Railway environment variables, not in files
```

### Frontend Environment Configuration

**`.env`** (Development):
```env
VITE_API_URL=http://localhost:8000
```

**`.env.production`** (Production):
```env
VITE_API_URL=https://fintech-production-d308.up.railway.app
```

---

## Running the Application

### Start Containers

```powershell
docker-compose up --build
```

**Flags:**
- `--build` - Rebuilds images (use this if you made code changes)
- `-d` - Run in detached mode (background)
- `-f` - Follow logs in real-time

**Example with options:**
```powershell
docker-compose up --build -d
docker-compose logs -f frontend
```

### Stop Containers

```powershell
# Stop without removing containers
docker-compose stop

# Stop and remove containers
docker-compose down
```

### Restart Containers

```powershell
docker-compose restart
```

---

## Verification

### Check Running Services

```powershell
docker-compose ps
```

Expected output:
```
NAME                    STATUS
fintech-backend         Up X seconds
fintech-frontend        Up X seconds
```

### Test Backend API

1. Visit: **http://localhost:8000/docs**
2. You should see the FastAPI Swagger documentation
3. Try a test endpoint (e.g., `/health` or `/users`)

### Test Frontend

1. Visit: **http://localhost:5173**
2. The React application should load
3. Open browser Console (F12) to check for any errors
4. Navigate around the app to verify functionality

### Check Logs

```powershell
# All logs
docker-compose logs

# Backend logs only
docker-compose logs backend

# Frontend logs only
docker-compose logs frontend

# Follow logs in real-time
docker-compose logs -f
```

---

## Common Commands

### View Container Status
```powershell
docker-compose ps
```

### Execute Commands in Container
```powershell
# Access backend shell
docker-compose exec backend sh

# Access frontend shell
docker-compose exec frontend sh

# Run Python command in backend
docker-compose exec backend python -c "import sys; print(sys.version)"
```

### View Container Resource Usage
```powershell
docker stats
```

### Clean Up Everything
```powershell
# Remove stopped containers
docker container prune

# Remove unused images
docker image prune

# Remove volumes
docker volume prune

# Complete cleanup
docker system prune -a
```

### Rebuild After Changes

**Backend Code Changes:**
```powershell
docker-compose up --build backend
```

**Frontend Code Changes:**
```powershell
docker-compose up --build frontend
```

**Both:**
```powershell
docker-compose up --build
```

---

## Troubleshooting

### Error: "Docker daemon is not running"

**Solution:** Start Docker Desktop
- Windows: Search for "Docker Desktop" and click to open
- Wait for the Docker icon in system tray to show a checkmark

### Error: "bind: address already in use"

**Solution:** Another process is using the port

```powershell
# Find what's using port 5173
netstat -ano | findstr :5173

# Kill the process (replace PID with actual number)
taskkill /PID <PID> /F

# Or change the port in docker-compose.yml
# Change "5173:80" to "3000:80"
```

### Error: "ModuleNotFoundError: No module named 'backend'"

**Solution:** The Python path is misconfigured
```powershell
docker-compose down
docker-compose up --build
```

### Frontend Shows "Cannot GET" Error

**Solution:** Check if backend is running
```powershell
docker-compose logs backend
```

Make sure API URLs match between frontend and backend environment variables.

### CORS Errors in Browser Console

**Solution:** Update `ALLOWED_ORIGINS` in environment file
```env
# In .env, add your frontend URL
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8000
```

Then restart:
```powershell
docker-compose down
docker-compose up --build
```

### Build Fails with "No such file or directory"

**Solution:** Ensure `requirements.txt` exists in project root
```powershell
ls requirements.txt
docker-compose up --build
```

### Port 80 is Already in Use

**Solution:** Change frontend port in docker-compose.yml
```yaml
frontend:
  ports:
    - "3000:80"  # Changed from 5173:80
```

Then access at: `http://localhost:3000`

---

## Service Details

### Backend Service

- **Image:** Python 3.11
- **Port:** 8000 (internal) → 8000 (host)
- **Entry Point:** `uvicorn backend.app:app`
- **Configuration:** `.env` file
- **Features:**
  - RESTful API with FastAPI
  - Swagger/OpenAPI documentation at `/docs`
  - CORS middleware for cross-origin requests
  - Rate limiting for insights endpoints

### Frontend Service

- **Image:** Node.js 20 with nginx
- **Port:** 80 (internal) → 5173 (host)
- **Build:** Vite React build
- **Configuration:** `.env` for API URL
- **Features:**
  - React single-page application
  - Static file serving with nginx
  - Production-optimized build

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `ALLOWED_ORIGINS` | `http://localhost:5173,...` | CORS allowed domains |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local LLM service URL |
| `OLLAMA_MODEL` | `qwen2.5:7b-instruct` | LLM model name |
| `NEWSAPI_KEY` | - | News API key |
| `INSIGHTS_RATE_LIMIT_ENABLED` | `1` | Enable rate limiting |
| `INSIGHTS_RATE_LIMIT_MAX_REQUESTS` | `10` | Max requests per window |

### Frontend (`.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_URL` | `http://localhost:8000` | Backend API endpoint |

---

## Performance Tips

1. **Use `--build` only when dependencies change**
   ```powershell
   # First time or after package changes
   docker-compose up --build
   
   # Subsequent runs (faster)
   docker-compose up
   ```

2. **Run in detached mode for background execution**
   ```powershell
   docker-compose up -d
   docker-compose logs -f  # Monitor in separate terminal
   ```

3. **Use volumes for development (optional)**
   - Add hot-reload by mounting code directories
   - Edit `docker-compose.yml` to add volume mounts

---

## Next Steps

1. ✅ Verify both services are running
2. ✅ Test the backend API at http://localhost:8000/docs
3. ✅ Test the frontend at http://localhost:5173
4. ✅ Check browser console for any errors
5. ✅ Monitor logs with `docker-compose logs -f`

---

## Support

For issues with:
- **Docker:** Check [Docker Documentation](https://docs.docker.com/)
- **FastAPI:** Check [FastAPI Docs](https://fastapi.tiangolo.com/)
- **React/Vite:** Check [Vite Docs](https://vitejs.dev/)

---

**Last Updated:** March 9, 2026  
**Docker Version Used:** 27.2.0+  
**Docker Compose Version:** Latest
