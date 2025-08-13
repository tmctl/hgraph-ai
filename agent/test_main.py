from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_create_and_get_task():
    data = {
        "repo": "https://github.com/example/repo.git",
        "instructions": "Do something",
        "acceptance_criteria": "It works",
        "persona": "software engineer",
    }
    response = client.post("/task", json=data)
    assert response.status_code == 201
    created = response.json()
    task_id = created["id"]

    response = client.get("/task")
    assert response.status_code == 200
    tasks = response.json()
    assert any(t["id"] == task_id for t in tasks)


def test_patch_task():
    data = {
        "repo": "https://github.com/example/repo.git",
        "instructions": "Initial",
        "acceptance_criteria": "Criteria",
        "persona": "QA engineer",
    }
    create_resp = client.post("/task", json=data)
    task_id = create_resp.json()["id"]

    patch_resp = client.patch(f"/task/{task_id}", json={"results": "Done"})
    assert patch_resp.status_code == 200
    assert patch_resp.json()["results"] == "Done"


def test_github_issues_endpoints():
    repo = "octocat/Hello-World"
    multi_resp = client.get("/github/issues", params={"repo": repo})
    assert multi_resp.status_code == 200
    data = multi_resp.json()
    assert repo in data
    assert isinstance(data[repo], list)
    if data[repo]:
        issue = data[repo][0]
        assert {"title", "number", "url", "state"} <= issue.keys()

    single_resp = client.get(f"/github/issues/{repo}")
    assert single_resp.status_code == 200
    issues = single_resp.json()
    assert isinstance(issues, list)


def test_create_task_missing_fields():
    """Posting with missing required fields should return 422."""
    resp = client.post("/task", json={"repo": "only-repo"})
    assert resp.status_code == 422


def test_invalid_uuid_returns_422():
    """Endpoints expecting UUIDs should reject invalid values."""
    resp = client.patch("/task/not-a-uuid", json={"results": "x"})
    assert resp.status_code == 422


def test_list_tasks_repo_filter():
    """Filtering tasks by repo should return only matching tasks."""
    data1 = {
        "repo": "filter/repo1",
        "instructions": "i1",
        "acceptance_criteria": "a1",
        "persona": "devops engineer",
    }
    data2 = {
        "repo": "filter/repo2",
        "instructions": "i2",
        "acceptance_criteria": "a2",
        "persona": "project manager",
    }

    resp1 = client.post("/task", json=data1)
    id1 = resp1.json()["id"]
    client.post("/task", json=data2)

    resp = client.get("/task", params={"repo": data1["repo"]})
    assert resp.status_code == 200
    tasks = resp.json()
    assert any(t["id"] == id1 for t in tasks)
    assert all(t["repo"] == data1["repo"] for t in tasks)


def test_list_tasks_persona_filter():
    """Filtering tasks by persona should return only matching tasks."""
    data1 = {
        "repo": "persona/repo1",
        "instructions": "p1",
        "acceptance_criteria": "c1",
        "persona": "product owner",
    }
    data2 = {
        "repo": "persona/repo2",
        "instructions": "p2",
        "acceptance_criteria": "c2",
        "persona": "software engineer",
    }

    r1 = client.post("/task", json=data1)
    id1 = r1.json()["id"]
    client.post("/task", json=data2)

    resp = client.get("/task", params={"persona": data1["persona"]})
    assert resp.status_code == 200
    tasks = resp.json()
    assert any(t["id"] == id1 for t in tasks)
    assert all(t["persona"] == data1["persona"] for t in tasks)


def test_invalid_persona():
    """Providing an unsupported persona should return 422."""
    data = {
        "repo": "invalid/persona",
        "instructions": "i",
        "acceptance_criteria": "c",
        "persona": "ghost",
    }
    resp = client.post("/task", json=data)
    assert resp.status_code == 422
