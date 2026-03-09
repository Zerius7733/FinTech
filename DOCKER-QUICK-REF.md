# Docker Quick Reference

## Start Application
```powershell
docker-compose up --build
```
→ Frontend: http://localhost:5173  
→ Backend: http://localhost:8000/docs

## Stop Application
```powershell
docker-compose down
```

## Common Tasks

### View Logs
```powershell
docker-compose logs -f          # All services
docker-compose logs -f backend  # Backend only
docker-compose logs -f frontend # Frontend only
```

### Check Status
```powershell
docker-compose ps
```

### Restart Services
```powershell
docker-compose restart
docker-compose restart backend   # Restart one service
```

### Run Commands Inside Container
```powershell
docker-compose exec backend sh              # Backend shell
docker-compose exec frontend sh             # Frontend shell
docker-compose exec backend python --version
```

### Rebuild After Code Changes
```powershell
docker-compose up --build       # Rebuild both
docker-compose up --build backend  # Backend only
docker-compose up --build frontend # Frontend only
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Docker daemon not running" | Start Docker Desktop |
| Port already in use | `netstat -ano \| findstr :5173` then kill PID |
| Import errors in backend | `docker-compose down && docker-compose up --build` |
| CORS errors | Check `ALLOWED_ORIGINS` in `.env` |
| Frontend can't reach API | Verify `VITE_API_URL` in frontend `.env` |

## File Locations
- **Configuration:** `.env`, `.env.production`
- **Backend:** `backend/app.py`, `backend/services/`
- **Frontend:** `frontend/src/App.jsx`, `frontend/src/pages/`
- **Orchestration:** `docker-compose.yml`

## Ports
- Frontend: **5173**
- Backend: **8000**
