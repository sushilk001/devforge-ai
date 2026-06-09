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


def create_issue(title: str, description: str, label: str = "PRD") -> str | None:
    """
    Create a Linear issue for the feature request.
    Returns the issue ID if successful.
    """
    query = """
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier title url }
      }
    }
    """
    variables = {
        "input": {
            "title":       title,
            "description": description,
            "teamId":      settings.linear_team_id,
        }
    }

    try:
        response = httpx.post(
            LINEAR_API_URL,
            json={"query": query, "variables": variables},
            headers=_headers(),
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("data", {}).get("issueCreate", {}).get("success"):
            issue = data["data"]["issueCreate"]["issue"]
            logger.info(f"[Linear] Issue created: {issue['identifier']} — {issue['url']}")
            return issue["id"]
        else:
            logger.error(f"[Linear] Issue creation failed: {data}")
            return None
    except httpx.HTTPError as e:
        logger.error(f"[Linear] HTTP error: {e}")
        return None


def get_issue(issue_id: str) -> dict | None:
    """Fetch a Linear issue by ID."""
    query = """
    query Issue($id: String!) {
      issue(id: $id) {
        id identifier title description state { name } url
      }
    }
    """
    try:
        response = httpx.post(
            LINEAR_API_URL,
            json={"query": query, "variables": {"id": issue_id}},
            headers=_headers(),
            timeout=10,
        )
        response.raise_for_status()
        return response.json().get("data", {}).get("issue")
    except httpx.HTTPError as e:
        logger.error(f"[Linear] HTTP error: {e}")
        return None
