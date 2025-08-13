# Headless Coding Agent API

The **Headless Coding Agent API** enables programmatic automation and management of coding tasks using a simple HTTP interface. This API allows clients to submit, track, update, and retrieve coding tasks in a headless environment—ideal for CI/CD pipelines, integration with developer tools, or building your own AI-powered developer assistant.

---

## Table of Contents

- [Overview](#overview)
- [Task Context Schema](#task-context-schema)
- [API Endpoints](#api-endpoints)
  - [GET /task](#get-task)
  - [POST /task](#post-task)
  - [PUT /task](#put-task)
  - [PATCH /task](#patch-task)
- [Example Payloads](#example-payloads)
- [Acceptance Criteria & Results](#acceptance-criteria--results)
- [Usage Notes](#usage-notes)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

The API manages **tasks** representing code changes, each with:

- A target repository
- Human or AI-generated instructions
- Clear acceptance criteria (tests)
- Results (as Git patches or diffs)

---

## Task Context Schema

Each `task` object follows this schema:

```json
{
  "repo": "string (location of target repository)",
  "instructions": "string (description of what to do)",
  "acceptance_criteria": "string (test steps or checks)",
  "persona": "string (role creating the task: project manager, QA engineer, devops engineer, software engineer, product owner)",
  "results": "string (git diff or patch, outcome details)"
}
```

## Environment Setup

Use **Python 3.11** (matching the Docker image) and create a virtual
environment before installing dependencies:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and update the values to configure environment
variables such as `TASKS_FILE` and `GITHUB_TOKEN`.

For a fully reproducible environment you can instead install from
`requirements.lock` which contains a list of pinned packages produced
via `pip freeze`.

## Running with Docker

The container runs the FastAPI application defined in `main.py`. Build
the image and start the API using Docker Compose:

```bash
docker-compose up --build
```

## Running the Server Locally

If you prefer not to use Docker you can launch the server directly with
Uvicorn:

```bash
uvicorn main:app --reload
```

### Persistent Task Storage

By default tasks are kept only in memory. Set the `TASKS_FILE` variable in your
`.env` file to a path on disk to enable simple JSON-based persistence. The file
will be created if it does not exist and updated whenever tasks are modified.

## Tests and Coverage

Run the unit tests and generate a coverage report:

```bash
pip install -r requirements.lock
coverage run -m pytest
coverage report
```

A recent coverage run is included in `coverage.txt`.

## GitHub Integration

The API can query open issues from GitHub repositories.

### `GET /github/issues`

Retrieve open issues for one or more repositories. Specify repositories via the
`repo` query parameter which may be repeated or contain comma-separated values.

Example:

```bash
curl 'http://localhost:8000/github/issues?repo=octocat/Hello-World'
```

Response:

```json
{
  "octocat/Hello-World": [
    { "title": "Example", "number": 1, "url": "https://github.com/...", "state": "open" }
  ]
}
```

### `GET /github/issues/{repo}`

Retrieve open issues for a single repository.

### Authentication

If the `GITHUB_TOKEN` variable is set in your `.env` file, it will be used for
authenticated requests to increase rate limits.

## Example Payloads

Create a new task as a QA engineer:

```bash
curl -X POST http://localhost:8000/task \
     -H 'Content-Type: application/json' \
     -d '{
           "repo": "example/repo",
           "instructions": "Add tests",
           "acceptance_criteria": "All tests pass",
           "persona": "QA engineer"
         }'
```

Response snippet:

```json
{
  "id": "123e4567-e89b-12d3-a456-426655440000",
  "repo": "example/repo",
  "instructions": "Add tests",
  "acceptance_criteria": "All tests pass",
  "persona": "QA engineer",
  "results": null
}
```

A task created by a project manager might specify a different persona.
