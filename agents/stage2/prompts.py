DECOMPOSE_TASKS_PROMPT = """
You are a senior software architect breaking an approved PRD into actionable engineering tasks.

PRD:
{prd_json}

Create 8–14 concrete engineering tasks that fully implement this PRD.

Rules:
- Each task must be completable in 1–8 hours (split larger work)
- Dependencies form a DAG — no cycles
- Include infra/setup tasks as type "chore" before features that depend on them
- Include at least one testing task per major feature area
- Assign realistic priorities; blockers should be higher priority than what they unblock

For each task provide:
  id:                  sequential "T-001", "T-002", ...
  title:               concise, action-oriented (e.g. "Add POST /auth/reset endpoint")
  description:         what to build (not how), 2–3 sentences
  type:                "feature" | "chore" | "spike" | "docs" | "bug"
  priority:            "urgent" | "high" | "medium" | "low"
  estimate_hours:      float between 0.5 and 8.0
  acceptance_criteria: 2–3 specific, testable criteria
  dependencies:        list of task IDs this task is BLOCKED BY (empty list if none)
  labels:              1–3 labels from: backend, frontend, api, database, auth, testing, infra, ui, mobile, devops

Respond ONLY with valid JSON:
{{
  "tasks": [
    {{
      "id": "T-001",
      "title": "...",
      "description": "...",
      "type": "chore",
      "priority": "high",
      "estimate_hours": 2.0,
      "acceptance_criteria": ["...", "..."],
      "dependencies": [],
      "labels": ["infra", "backend"]
    }}
  ]
}}
"""


REVISE_TASKS_PROMPT = """
You are a senior software architect revising an engineering task list based on reviewer feedback.

Current task list (revision #{revision_count}):
{tasks_json}

Reviewer feedback:
\"\"\"{feedback}\"\"\"

Incorporate ALL feedback. You may add, remove, split, or rewrite tasks.
Maintain existing task IDs where possible; renumber only if tasks are added or removed.

Respond ONLY with the same JSON format:
{{
  "tasks": [...]
}}
"""
