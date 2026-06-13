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

def create_issue(title: str, description: str, label: str = "PRD") -> str | None:
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

def create_task_issue(
    title:          str,
    description:    str,
    task_type:      str           = "feature",
    priority:       int           = 3,
    estimate_hours: float | None  = None,
    labels:         list[str]     | None = None,
    blocked_by_ids: list[str]     | None = None,
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

    data = _gql(query, {"input": issue_input})
    if not (data and data.get("data", {}).get("issueCreate", {}).get("success")):
        logger.error(f"[Linear] create_task_issue failed: {data}")
        return None

    issue = data["data"]["issueCreate"]["issue"]
    logger.info(f"[Linear] Task issue created: {issue['identifier']} — {issue['url']}")

    # Wire up blocker relations after creation
    if blocked_by_ids:
        for blocker_id in blocked_by_ids:
            _create_relation(issue["id"], blocker_id, "blocked_by")

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
