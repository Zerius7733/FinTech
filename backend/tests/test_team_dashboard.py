import json
import os
import tempfile
import unittest
from pathlib import Path
import sys

from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app import app


class TeamDashboardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.state_path = Path(self.temp_dir.name) / "dashboard-state.json"
        os.environ["TEAM_DASHBOARD_STATE_PATH"] = str(self.state_path)
        os.environ["TEAM_ADMIN_KEY"] = "test-admin-key"
        self.client = TestClient(app)
        self.admin_headers = {"X-Unova-Admin-Key": "test-admin-key"}

    def tearDown(self) -> None:
        os.environ.pop("TEAM_DASHBOARD_STATE_PATH", None)
        os.environ.pop("TEAM_ADMIN_KEY", None)
        self.temp_dir.cleanup()

    def test_get_team_state_seeds_default_dashboard(self) -> None:
        response = self.client.get("/team/state", headers=self.admin_headers)

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "ok")
        self.assertTrue(self.state_path.exists())
        self.assertEqual(payload["team"]["mode"], "running")
        self.assertTrue(any(task["status"] == "in_progress" for task in payload["team"]["tasks"]))

    def test_stop_and_resume_toggle_graceful_stop_state(self) -> None:
        stop_response = self.client.post("/team/stop", json={"reason": "pause after current task"}, headers=self.admin_headers)
        self.assertEqual(stop_response.status_code, 200)
        stopped = stop_response.json()["team"]
        self.assertEqual(stopped["mode"], "stopping")
        self.assertTrue(stopped["stop"]["requested"])
        self.assertEqual(stopped["stop"]["reason"], "pause after current task")

        resume_response = self.client.post("/team/resume", headers=self.admin_headers)
        self.assertEqual(resume_response.status_code, 200)
        resumed = resume_response.json()["team"]
        self.assertEqual(resumed["mode"], "running")
        self.assertFalse(resumed["stop"]["requested"])

        with open(self.state_path, "r", encoding="utf-8") as handle:
            persisted = json.load(handle)
        self.assertEqual(persisted["mode"], "running")
        self.assertFalse(persisted["stop"]["requested"])

    def test_update_objective_and_queue_task(self) -> None:
        objective_response = self.client.post("/team/objective", json={"objective": "Ship the next runtime config wave"}, headers=self.admin_headers)
        self.assertEqual(objective_response.status_code, 200)
        updated = objective_response.json()["team"]
        self.assertEqual(updated["objective"], "Ship the next runtime config wave")

        create_response = self.client.post(
            "/team/tasks",
            json={
                "title": "Add queue controls",
                "description": "Let the user add tasks from the dashboard.",
                "owner_id": "manager",
                "area": "ops",
            },
            headers=self.admin_headers,
        )
        self.assertEqual(create_response.status_code, 200)
        queued = create_response.json()["team"]["tasks"]
        self.assertTrue(any(task["title"] == "Add queue controls" and task["status"] == "queued" for task in queued))

    def test_complete_and_start_next_respect_stop_rules(self) -> None:
        initial = self.client.get("/team/state", headers=self.admin_headers).json()["team"]
        active_task = next(task for task in initial["tasks"] if task["status"] == "in_progress")

        complete_response = self.client.post(
            f"/team/tasks/{active_task['id']}/complete",
            json={"outcome": "Implemented and verified."},
            headers=self.admin_headers,
        )
        self.assertEqual(complete_response.status_code, 200)
        completed = complete_response.json()["team"]
        self.assertTrue(any(task["id"] == active_task["id"] and task["status"] == "completed" for task in completed["tasks"]))

        start_response = self.client.post("/team/tasks/start-next", headers=self.admin_headers)
        self.assertEqual(start_response.status_code, 200)
        started = start_response.json()["team"]
        self.assertTrue(any(task["status"] == "in_progress" for task in started["tasks"]))

        self.client.post("/team/stop", json={"reason": "finish current only"}, headers=self.admin_headers)
        blocked_response = self.client.post("/team/tasks/start-next", headers=self.admin_headers)
        self.assertEqual(blocked_response.status_code, 400)

    def test_team_endpoints_require_admin_key(self) -> None:
        response = self.client.get("/team/state")
        self.assertEqual(response.status_code, 401)

    def test_runtime_config_exposes_shared_defaults(self) -> None:
        response = self.client.get("/app/runtime-config")
        self.assertEqual(response.status_code, 200)
        config = response.json()["config"]
        self.assertIn("api_base", config)
        self.assertIn("vision_model", config)
        self.assertEqual(config["team_dashboard_path"], "/admin/team")
        self.assertEqual(config["admin_entry_path"], "/admin")
