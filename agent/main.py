from __future__ import annotations

import os
import json
from fastapi import FastAPI, HTTPException, Path, Query
from enum import Enum
import httpx
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from uuid import uuid4, UUID
from typing import Dict, List, Optional
from dotenv import load_dotenv

app = FastAPI(title="Headless Coding Agent")
load_dotenv()

# Allow all origins for simplicity; in production, restrict as needed
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event() -> None:
    """Load tasks from disk if a persistence file is configured."""
    load_tasks()

# In-memory storage for tasks
TASKS: Dict[UUID, "Task"] = {}

# Optional file path for persistence
TASKS_FILE = os.getenv("TASKS_FILE")


def load_tasks() -> None:
    """Load tasks from ``TASKS_FILE`` if configured."""
    global TASKS
    if not TASKS_FILE or not os.path.exists(TASKS_FILE):
        return
    with open(TASKS_FILE, "r") as f:
        data = json.load(f)
    for item in data:
        item["id"] = UUID(item["id"])
        task = Task(**item)
        TASKS[task.id] = task


def save_tasks() -> None:
    """Persist tasks to ``TASKS_FILE`` if configured."""
    if not TASKS_FILE:
        return
    with open(TASKS_FILE, "w") as f:
        serialized = [dict(task.model_dump(), id=str(task.id)) for task in TASKS.values()]
        json.dump(serialized, f, indent=2)


class Persona(str, Enum):
    """Supported personas for tasks."""

    PROJECT_MANAGER = "project manager"
    QA_ENGINEER = "QA engineer"
    DEVOPS_ENGINEER = "devops engineer"
    SOFTWARE_ENGINEER = "software engineer"
    PRODUCT_OWNER = "product owner"

class TaskBase(BaseModel):
    repo: str = Field(..., description="Repository location, e.g., a git URL")
    instructions: str = Field(..., description="Instructions for what to do")
    acceptance_criteria: str = Field(..., description="Test steps or acceptance requirements")
    persona: Persona = Field(
        ...,
        description="Persona associated with the task",
        examples=[Persona.SOFTWARE_ENGINEER],
    )
    results: str | None = Field(
        None,
        description="Git diff or patch, or results summary; may be empty at first",
    )

class TaskCreate(TaskBase):
    """Model for creating a new task (results optional)."""
    results: str | None = None

class Task(TaskBase):
    id: UUID = Field(..., description="Unique identifier for the task")

    class Config:
        orm_mode = True

class TaskUpdate(BaseModel):
    """Model for partial task updates."""
    repo: Optional[str] = None
    instructions: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    persona: Optional[Persona] = None
    results: Optional[str] = None

class TaskReplace(TaskBase):
    """Model for full replacement of a task."""
    pass


GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")


async def fetch_open_issues(repo: str) -> List[Dict[str, str]]:
    """Fetch open issues for a given GitHub repository."""
    url = f"https://api.github.com/repos/{repo}/issues"
    headers = {"Accept": "application/vnd.github+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"token {GITHUB_TOKEN}"
    params = {"state": "open"}

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, headers=headers, params=params, timeout=10)
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"GitHub request error: {exc}")

    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Repository '{repo}' not found")
    if resp.status_code == 403:
        raise HTTPException(status_code=429, detail="GitHub API rate limit exceeded")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail="GitHub API error")

    issues = []
    for issue in resp.json():
        # Exclude pull requests from issues list
        if "pull_request" in issue:
            continue
        issues.append(
            {
                "title": issue["title"],
                "number": issue["number"],
                "url": issue["html_url"],
                "state": issue["state"],
            }
        )
    return issues

@app.get("/task", response_model=List[Task])
async def list_tasks(
    repo: Optional[str] = Query(None, description="Filter by repository"),
    persona: Optional[Persona] = Query(None, description="Filter by persona"),
):
    """Retrieve all tasks. Optionally filter by repo or persona."""
    tasks = list(TASKS.values())
    if repo:
        tasks = [t for t in tasks if t.repo == repo]
    if persona:
        tasks = [t for t in tasks if t.persona == persona]
    return tasks

@app.post("/task", response_model=Task, status_code=201)
async def create_task(task_in: TaskCreate):
    """Create a new task."""
    task_id = uuid4()
    task = Task(id=task_id, **task_in.model_dump())
    TASKS[task_id] = task
    save_tasks()
    return task

@app.put("/task/{task_id}", response_model=Task)
async def replace_task(task_id: UUID = Path(...), task_in: TaskReplace = ...):
    """Replace an existing task entirely."""
    if task_id not in TASKS:
        raise HTTPException(status_code=404, detail="Task not found")
    task = Task(id=task_id, **task_in.model_dump())
    TASKS[task_id] = task
    save_tasks()
    return task

@app.patch("/task/{task_id}", response_model=Task)
async def update_task(task_id: UUID, task_in: TaskUpdate):
    """Partially update an existing task."""
    if task_id not in TASKS:
        raise HTTPException(status_code=404, detail="Task not found")
    stored_task = TASKS[task_id]
    update_data = task_in.model_dump(exclude_unset=True)
    updated_task = stored_task.model_copy(update=update_data)
    TASKS[task_id] = updated_task
    save_tasks()
    return updated_task


@app.get("/github/issues")
async def get_github_issues(
    repo: List[str] = Query(
        ...,
        description="Repository identifier(s) like 'owner/repo'. May be provided multiple times or as a comma-separated list.",
    )
):
    """Retrieve open issues for one or more repositories."""
    repositories: List[str] = []
    for r in repo:
        repositories.extend([part.strip() for part in r.split(",") if part.strip()])

    results: Dict[str, List[Dict[str, str]]] = {}
    for repository in repositories:
        issues = await fetch_open_issues(repository)
        results[repository] = issues
    return results


@app.get("/github/issues/{repo_path:path}")
async def get_github_issues_single(repo_path: str = Path(..., description="Repository identifier like 'owner/repo'")):
    """Retrieve open issues for a single repository."""
    return await fetch_open_issues(repo_path)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000)
