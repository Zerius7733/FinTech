import json
import os
import threading
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict
from uuid import uuid4


_STATE_LOCK = threading.Lock()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _state_path() -> Path:
    configured = os.getenv("TEAM_DASHBOARD_STATE_PATH", "").strip()
    if configured:
        return Path(configured)
    return _repo_root() / ".codex-team" / "dashboard-state.json"


def _default_state() -> Dict[str, Any]:
    now = _utc_now_iso()
    return {
        "branch": "zian",
        "objective": "Establish a branch baseline for continued development and keep the team shipping visible work.",
        "mode": "running",
        "stop": {
            "requested": False,
            "requested_at": None,
            "reason": None,
            "message": "Team is running. Press stop to finish the active task, then pause before starting the next one.",
        },
        "agents": [
            {
                "id": "manager",
                "role": "manager",
                "name": "Manager",
                "status": "active",
                "ownership": ["backlog", "delegation", "lifecycle", "stop control"],
                "current_task": "Coordinate the branch roadmap and honor graceful stop requests between tasks.",
            },
            {
                "id": "developer-1",
                "role": "developer",
                "name": "Developer 1",
                "status": "active",
                "ownership": ["frontend/src", "chrome-extension"],
                "current_task": "Unify runtime configuration between web app and extension.",
            },
            {
                "id": "developer-2",
                "role": "developer",
                "name": "Developer 2",
                "status": "active",
                "ownership": ["backend/app.py", "backend/services", "backend/tests"],
                "current_task": "Add coverage for screenshot import and a critical API path.",
            },
            {
                "id": "qa",
                "role": "qa",
                "name": "QA",
                "status": "active",
                "ownership": ["verification", "acceptance checklist"],
                "current_task": "Track regression risks across login, import, and market data flows.",
            },
            {
                "id": "researcher",
                "role": "researcher",
                "name": "Researcher",
                "status": "active",
                "ownership": ["repo-specific technology bets"],
                "current_task": "Refine proposals around shared config, import quality, and insight caching.",
            },
        ],
        "tasks": [
            {
                "id": "task-shared-runtime-config",
                "title": "Shared runtime config across web app and extension",
                "description": "Unify API base and related client runtime settings so environments do not drift silently.",
                "status": "in_progress",
                "owner_id": "developer-1",
                "area": "frontend",
                "created_at": now,
                "started_at": now,
                "completed_at": None,
                "outcome": None,
            },
            {
                "id": "task-import-api-tests",
                "title": "Import and API coverage",
                "description": "Add focused backend coverage for screenshot import paths and one critical API seam.",
                "status": "queued",
                "owner_id": "developer-2",
                "area": "backend",
                "created_at": now,
                "started_at": None,
                "completed_at": None,
                "outcome": None,
            },
            {
                "id": "task-qa-baseline",
                "title": "Acceptance checklist baseline",
                "description": "Define what QA checks every cycle for login, import, and market data flows.",
                "status": "queued",
                "owner_id": "qa",
                "area": "qa",
                "created_at": now,
                "started_at": None,
                "completed_at": None,
                "outcome": None,
            },
            {
                "id": "task-bundle-splitting",
                "title": "Globe route bundle splitting",
                "description": "Break out heavy Globe route code to reduce the initial frontend bundle cost.",
                "status": "queued",
                "owner_id": "developer-1",
                "area": "frontend",
                "created_at": now,
                "started_at": None,
                "completed_at": None,
                "outcome": None,
            },
            {
                "id": "task-research-next-bets",
                "title": "Research next bets",
                "description": "Rank app-specific bets around shared config, import evaluation, and insight caching.",
                "status": "completed",
                "owner_id": "researcher",
                "area": "research",
                "created_at": now,
                "started_at": now,
                "completed_at": now,
                "outcome": "Initial recommendations recorded in .codex-team/team-state.md.",
            },
        ],
        "updated_at": now,
        "last_event": {
            "type": "seeded",
            "message": "Dashboard state initialized from the first manager cycle.",
            "at": now,
        },
    }


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _normalize_state(payload: Dict[str, Any]) -> Dict[str, Any]:
    state = deepcopy(payload or {})
    defaults = _default_state()
    for key, value in defaults.items():
        state.setdefault(key, deepcopy(value))
    state["updated_at"] = state.get("updated_at") or _utc_now_iso()
    if not isinstance(state.get("agents"), list):
        state["agents"] = deepcopy(defaults["agents"])
    if not isinstance(state.get("tasks"), list):
        state["tasks"] = deepcopy(defaults["tasks"])
    if not isinstance(state.get("stop"), dict):
        state["stop"] = deepcopy(defaults["stop"])
    if not isinstance(state.get("last_event"), dict):
        state["last_event"] = deepcopy(defaults["last_event"])
    return state


def _set_last_event(state: Dict[str, Any], event_type: str, message: str) -> None:
    state["last_event"] = {
        "type": event_type,
        "message": message,
        "at": _utc_now_iso(),
    }


def _find_task(state: Dict[str, Any], task_id: str) -> Dict[str, Any] | None:
    for task in state.get("tasks", []):
        if str(task.get("id")) == str(task_id):
            return task
    return None


def _agent_map(state: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    return {
        str(agent.get("id")): agent
        for agent in state.get("agents", [])
        if isinstance(agent, dict) and agent.get("id")
    }


def _set_agent_task(state: Dict[str, Any], agent_id: str, task_title: str, status: str = "active") -> None:
    agent = _agent_map(state).get(agent_id)
    if not agent:
        return
    agent["status"] = status
    agent["current_task"] = task_title


def _sort_tasks(state: Dict[str, Any]) -> None:
    rank = {"in_progress": 0, "queued": 1, "blocked": 2, "completed": 3}
    state["tasks"] = sorted(
        state.get("tasks", []),
        key=lambda task: (
            rank.get(str(task.get("status")), 99),
            str(task.get("created_at") or ""),
        ),
    )


def load_state() -> Dict[str, Any]:
    path = _state_path()
    with _STATE_LOCK:
        if not path.exists():
            state = _default_state()
            _ensure_parent(path)
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(state, handle, indent=2)
            return state
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return _normalize_state(payload if isinstance(payload, dict) else {})


def save_state(state: Dict[str, Any]) -> Dict[str, Any]:
    path = _state_path()
    normalized = _normalize_state(state)
    normalized["updated_at"] = _utc_now_iso()
    with _STATE_LOCK:
        _ensure_parent(path)
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(normalized, handle, indent=2)
    return normalized


def request_graceful_stop(reason: str | None = None) -> Dict[str, Any]:
    state = load_state()
    state["mode"] = "stopping"
    state["stop"] = {
        "requested": True,
        "requested_at": _utc_now_iso(),
        "reason": reason or None,
        "message": "Stop requested. Finish the active task, then pause before starting the next one.",
    }
    state["last_event"] = {
        "type": "stop_requested",
        "message": "Graceful stop requested from the dashboard.",
        "at": state["stop"]["requested_at"],
    }
    return save_state(state)


def resume_team() -> Dict[str, Any]:
    state = load_state()
    state["mode"] = "running"
    state["stop"] = {
        "requested": False,
        "requested_at": None,
        "reason": None,
        "message": "Team is running. Press stop to finish the active task, then pause before starting the next one.",
    }
    state["last_event"] = {
        "type": "resumed",
        "message": "Team resume requested from the dashboard.",
        "at": _utc_now_iso(),
    }
    return save_state(state)


def update_objective(objective: str) -> Dict[str, Any]:
    cleaned = str(objective or "").strip()
    if not cleaned:
        raise ValueError("objective cannot be empty")
    state = load_state()
    state["objective"] = cleaned
    _set_last_event(state, "objective_updated", "Objective updated from the dashboard.")
    return save_state(state)


def add_task(title: str, description: str, owner_id: str, area: str) -> Dict[str, Any]:
    cleaned_title = str(title or "").strip()
    cleaned_description = str(description or "").strip()
    cleaned_owner = str(owner_id or "").strip()
    cleaned_area = str(area or "").strip().lower() or "general"
    if not cleaned_title:
        raise ValueError("title cannot be empty")
    if not cleaned_owner:
        raise ValueError("owner_id cannot be empty")

    state = load_state()
    task = {
        "id": f"task-{uuid4().hex[:10]}",
        "title": cleaned_title,
        "description": cleaned_description,
        "status": "queued",
        "owner_id": cleaned_owner,
        "area": cleaned_area,
        "created_at": _utc_now_iso(),
        "started_at": None,
        "completed_at": None,
        "outcome": None,
    }
    state["tasks"].append(task)
    _sort_tasks(state)
    _set_last_event(state, "task_added", f"Queued task: {cleaned_title}")
    return save_state(state)


def complete_task(task_id: str, outcome: str | None = None) -> Dict[str, Any]:
    state = load_state()
    task = _find_task(state, task_id)
    if task is None:
        raise ValueError("task not found")

    task["status"] = "completed"
    task["completed_at"] = _utc_now_iso()
    if not task.get("started_at"):
        task["started_at"] = task["completed_at"]
    task["outcome"] = str(outcome or "").strip() or "Completed from the team dashboard."

    agent = _agent_map(state).get(str(task.get("owner_id")))
    if agent:
        agent["current_task"] = "Awaiting next assignment."
        agent["status"] = "active"

    if state.get("stop", {}).get("requested"):
        state["mode"] = "paused"
        state["stop"]["message"] = "Team paused after completing the active task."
        _set_last_event(state, "paused", f"Completed {task['title']} and paused before the next task.")
    else:
        _set_last_event(state, "task_completed", f"Completed task: {task['title']}")

    _sort_tasks(state)
    return save_state(state)


def start_next_task() -> Dict[str, Any]:
    state = load_state()
    if state.get("stop", {}).get("requested"):
        raise ValueError("cannot start a new task while graceful stop is requested")

    for current in state.get("tasks", []):
        if current.get("status") == "in_progress":
            raise ValueError("an in-progress task already exists")

    next_task = None
    for task in state.get("tasks", []):
        if task.get("status") == "queued":
            next_task = task
            break

    if next_task is None:
        raise ValueError("no queued task available")

    next_task["status"] = "in_progress"
    next_task["started_at"] = _utc_now_iso()
    _set_agent_task(state, str(next_task.get("owner_id")), next_task["title"])
    state["mode"] = "running"
    _set_last_event(state, "task_started", f"Started task: {next_task['title']}")
    _sort_tasks(state)
    return save_state(state)
