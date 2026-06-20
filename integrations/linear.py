import httpx
import logging
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

LINEAR_API_URL = "https://api.linear.app/graphql"


def _headers() -> dict:
    return {
        "Authorization": settings.linear_api_key,
        "Content-Type": "application/json",
    }


def _gql(query: str, variables: dict) -> dict | None:
    try:
        response = httpx.post(
            LINEAR_API_URL,
            json={"query": query, "variables": variables},
            headers=_headers(),
            timeout=15,
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as e:
        logger.error(f"[Linear] HTTP error: {e}")
        return None


# ── Stage 1: PRD issue ────────────────────────────────────────────────────────

def create_issue(title: str, description: str) -> str | None:
    """Create a single Linear issue (used by Stage 1). Returns issue ID."""
    query = """
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier title url }
      }
    }
    """
    data = _gql(query, {"input": {
        "title":       title,
        "description": description,
        "teamId":      settings.linear_team_id,
    }})

    if data and data.get("data", {}).get("issueCreate", {}).get("success"):
        issue = data["data"]["issueCreate"]["issue"]
        logger.info(f"[Linear] Created: {issue['identifier']} — {issue['url']}")
        return issue["id"]

    logger.error(f"[Linear] create_issue failed: {data}")
    return None


# ── Stage 2: Engineering tasks ────────────────────────────────────────────────

def create_project(name: str, description: str = "") -> dict | None:
    """Create a new Linear project for a pipeline run. Returns {id, name, url}."""
    query = """
    mutation ProjectCreate($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        success
        project { id name url }
      }
    }
    """
    data = _gql(query, {"input": {
        "name":        name[:255],
        "teamIds":     [settings.linear_team_id],
        "description": description[:255] if description else "",
    }})
    inner = (data or {}).get("data") or {}
    if inner.get("projectCreate", {}).get("success"):
        project = inner["projectCreate"]["project"]
        logger.info(f"[Linear] Project created: {project['name']} — {project['url']}")
        return project
    logger.error(f"[Linear] create_project failed: {data}")
    return None


def create_task_issue(
    title:          str,
    description:    str,
    task_type:      str           = "feature",
    priority:       int           = 3,
    estimate_hours: float | None  = None,
    blocked_by_ids: list[str]     | None = None,
    project_id:     str | None    = None,
) -> dict | None:
    """
    Create a Linear issue for a Stage 2 engineering task.
    Returns {id, identifier, url} on success, None on failure.
    """
    query = """
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier title url }
      }
    }
    """
    issue_input: dict = {
        "title":       f"[{task_type.upper()}] {title}",
        "description": description,
        "teamId":      settings.linear_team_id,
        "priority":    priority,
    }

    if estimate_hours is not None:
        issue_input["estimate"] = max(1, round(estimate_hours))

    if project_id is not None:
        issue_input["projectId"] = project_id

    data = _gql(query, {"input": issue_input})
    if not (data and data.get("data", {}).get("issueCreate", {}).get("success")):
        logger.error(f"[Linear] create_task_issue failed: {data}")
        return None

    issue = data["data"]["issueCreate"]["issue"]
    logger.info(f"[Linear] Task issue created: {issue['identifier']} — {issue['url']}")

    # Wire up blocker relations — Linear only accepts "blocks"; swap IDs so blocker blocks this issue
    if blocked_by_ids:
        for blocker_id in blocked_by_ids:
            _create_relation(blocker_id, issue["id"], "blocks")

    return issue


def _create_relation(issue_id: str, related_id: str, relation_type: str = "blocks") -> bool:
    """Create a dependency relation between two Linear issues."""
    query = """
    mutation IssueRelationCreate($input: IssueRelationCreateInput!) {
      issueRelationCreate(input: $input) {
        success
      }
    }
    """
    data = _gql(query, {"input": {
        "issueId":        issue_id,
        "relatedIssueId": related_id,
        "type":           relation_type,
    }})
    success = bool(data and data.get("data", {}).get("issueRelationCreate", {}).get("success"))
    if success:
        logger.info(f"[Linear] Relation: {issue_id} {relation_type} {related_id}")
    else:
        logger.warning(f"[Linear] Relation failed: {issue_id} {relation_type} {related_id}")
    return success


# ── Stage 4: Code generation updates ─────────────────────────────────────────

_state_cache: dict[str, list] = {}   # team_id → list of {id, name, type}


def _get_team_states() -> list[dict]:
    """Fetch and cache workflow states for the configured team."""
    global _state_cache
    team_id = settings.linear_team_id
    if team_id in _state_cache:
        return _state_cache[team_id]
    query = """
    query TeamStates($teamId: String!) {
      team(id: $teamId) {
        states { nodes { id name type } }
      }
    }
    """
    data = _gql(query, {"teamId": team_id})
    states = (
        (data or {}).get("data", {}).get("team", {}).get("states", {}).get("nodes", [])
    )
    _state_cache[team_id] = states
    return states


def _find_state_id(preferred_names: list[str], fallback_type: str) -> str | None:
    """Return a state ID matching one of the preferred names, or first of fallback_type."""
    states = _get_team_states()
    lower_names = [n.lower() for n in preferred_names]
    for s in states:
        if s["name"].lower() in lower_names:
            return s["id"]
    for s in states:
        if s.get("type") == fallback_type:
            return s["id"]
    return None


def update_issue_state(issue_id: str, state_id: str) -> bool:
    """Move a Linear issue to a specific workflow state."""
    query = """
    mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue { id state { name } }
      }
    }
    """
    data = _gql(query, {"id": issue_id, "input": {"stateId": state_id}})
    success = bool(data and data.get("data", {}).get("issueUpdate", {}).get("success"))
    if success:
        state_name = data["data"]["issueUpdate"]["issue"]["state"]["name"]
        logger.info(f"[Linear] Issue {issue_id} → state: {state_name}")
    else:
        logger.warning(f"[Linear] update_issue_state failed for {issue_id}")
    return success


def comment_on_issue(issue_id: str, body: str) -> bool:
    """Post a markdown comment on a Linear issue."""
    query = """
    mutation CommentCreate($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
      }
    }
    """
    data = _gql(query, {"input": {"issueId": issue_id, "body": body}})
    success = bool(data and data.get("data", {}).get("commentCreate", {}).get("success"))
    if not success:
        logger.warning(f"[Linear] comment_on_issue failed for {issue_id}")
    return success


def mark_code_generated(issue_id: str, files: list[dict], summary: str) -> None:
    """Comment generated file list on the issue and move it to In Progress."""
    file_lines = "\n".join(f"- `{f['filename']}` — {f['description']}" for f in files)
    body = (
        f"## 🤖 DevForge AI — Code Generated\n\n"
        f"**Summary:** {summary}\n\n"
        f"**Generated files ({len(files)}):**\n{file_lines}"
    )
    comment_on_issue(issue_id, body)

    state_id = _find_state_id(["in progress", "in-progress", "started"], "started")
    if state_id:
        update_issue_state(issue_id, state_id)


# ── Shared ────────────────────────────────────────────────────────────────────

def get_issue(issue_id: str) -> dict | None:
    """Fetch a Linear issue by ID."""
    query = """
    query Issue($id: String!) {
      issue(id: $id) {
        id identifier title description state { name } url
      }
    }
    """
    data = _gql(query, {"id": issue_id})
    return data.get("data", {}).get("issue") if data else None
