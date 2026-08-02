// ── DEMO_RUNS ────────────────────────────────────────────────────────────────
// Captured, deterministic pipeline runs — one per request mode. Demo Mode replays
// the matching run through the live animation engine so an on-stage demo never
// depends on real LLM latency or third-party APIs.
//   add_feature  → adds to an existing enterprise app, ends in a GitHub PR.
//   new_software → builds a brand-new service from scratch, ends in a DEPLOYED app.

// ── Add Feature: self-service password reset ─────────────────────────────────
const ADD_FEATURE = {
  label: "Feature: Self-Service Password Reset",
  prompt:
    "Users cannot reset passwords without calling support (200+ tickets/week). Add self-service forgot-password via email for enterprise JWT users. Reset link via SES, token expires 24h, max 3 requests/hour, password complexity rules, admin audit log. Success = 80% ticket drop in 60 days.",

  prd: {
    title: "Self-Service Password Reset",
    version: "1.0",
    problem_statement:
      "Enterprise users cannot reset passwords without contacting support, generating 200+ tickets/week. There is no self-service forgot-password flow, driving support cost and login friction.",
    goals: [
      "Cut password-related support tickets by 80% within 60 days",
      "Let JWT-auth enterprise users reset their own password via email",
      "Enforce security: 24h token expiry, 3 requests/hour, password complexity",
    ],
    non_goals: ["SSO / SAML users", "Passwordless / magic-link auth"],
    user_stories: [
      { as_a: "enterprise user", i_want: "reset my password from a link emailed to me" },
      { as_a: "enterprise user", i_want: "be told when a reset link has expired" },
      { as_a: "security admin", i_want: "see every reset attempt in an audit log" },
    ],
    acceptance_criteria: [
      "Reset link delivered via SES within 30s",
      "Token expires after 24h and is single-use",
      "Max 3 reset requests per hour per account",
      "New password enforces min 8 chars, 1 uppercase, 1 number",
      "Every attempt written to the admin audit log",
    ],
    technical_notes: ["JWT auth", "AWS SES for email", "Rate limit via Redis"],
  },

  tasks: [
    { id: "T-001", title: "Password-reset schema & token store", type: "chore",   priority: "high",   estimate_hours: 3, dependencies: [],                 linear_issue_id: "DEV-101" },
    { id: "T-002", title: "Generate & email reset token (SES)",   type: "feature", priority: "high",   estimate_hours: 5, dependencies: ["T-001"],          linear_issue_id: "DEV-102" },
    { id: "T-003", title: "Token validation + password update",   type: "feature", priority: "urgent", estimate_hours: 5, dependencies: ["T-001"],          linear_issue_id: "DEV-103" },
    { id: "T-004", title: "Rate limiting + admin audit log",       type: "feature", priority: "medium", estimate_hours: 4, dependencies: ["T-001"],          linear_issue_id: "DEV-104" },
    { id: "T-005", title: "Forgot-password UI + branded email",    type: "feature", priority: "high",   estimate_hours: 6, dependencies: ["T-002"],          linear_issue_id: "DEV-105" },
    { id: "T-006", title: "E2E + unit tests for reset flow",       type: "testing", priority: "medium", estimate_hours: 4, dependencies: ["T-003", "T-005"], linear_issue_id: "DEV-106" },
  ],

  depGraph: {
    total_estimated_hours: 27,
    critical_path: ["T-001", "T-002", "T-005", "T-006"],
    parallel_tracks: [["T-001"], ["T-002", "T-003", "T-004"], ["T-005"], ["T-006"]],
    edges: [
      { from_task: "T-001", to_task: "T-002" },
      { from_task: "T-001", to_task: "T-003" },
      { from_task: "T-001", to_task: "T-004" },
      { from_task: "T-002", to_task: "T-005" },
      { from_task: "T-003", to_task: "T-006" },
      { from_task: "T-005", to_task: "T-006" },
    ],
  },

  review: {
    verdict: "APPROVED WITH SUGGESTIONS — 0 blockers · 1 warning · 2 suggestions",
    findings: [
      { agent: "security",     severity: "warning", title: "Non-constant-time token compare", recommendation: "Use hmac.compare_digest() when validating the reset token to prevent timing attacks." },
      { agent: "quality",      severity: "info",    title: "Inline email template",           recommendation: "Move the branded HTML email into a template file for easier iteration." },
      { agent: "architecture", severity: "info",    title: "TokenService abstraction",        recommendation: "Wrap create/verify/expire logic in a TokenService to isolate storage concerns." },
    ],
  },

  codeGen: {
    total_files: 9,
    message: "Generated 5 tasks → output/self-service-password-reset",
    generated: [
      { task_id: "T-001", task_title: "Password-reset schema & token store", files: [
        { filename: "src/models/reset_token.py", content: "from datetime import datetime, timedelta\nimport secrets\n\nclass ResetToken:\n    def __init__(self, user_id):\n        self.user_id = user_id\n        self.token = secrets.token_urlsafe(32)\n        self.created_at = datetime.utcnow()\n        self.expires_at = self.created_at + timedelta(hours=24)\n        self.used = False\n\n    def is_valid(self):\n        return (not self.used) and datetime.utcnow() < self.expires_at\n" },
      ]},
      { task_id: "T-002", task_title: "Generate & email reset token (SES)", files: [
        { filename: "src/services/email.py", content: "import boto3\n\nses = boto3.client('ses')\n\ndef send_reset_email(to_addr, token):\n    link = f'https://app.example.com/reset?token={token}'\n    ses.send_email(\n        Source='no-reply@example.com',\n        Destination={'ToAddresses': [to_addr]},\n        Message={'Subject': {'Data': 'Reset your password'},\n                 'Body': {'Html': {'Data': render_reset_email(link)}}},\n    )\n" },
      ]},
      { task_id: "T-003", task_title: "Token validation + password update", files: [
        { filename: "src/api/reset.py", content: "from fastapi import APIRouter, HTTPException\n\nrouter = APIRouter()\n\n@router.post('/reset/confirm')\ndef confirm_reset(token: str, new_password: str):\n    rec = store.get(token)\n    if not rec or not rec.is_valid():\n        raise HTTPException(400, 'Invalid or expired token')\n    validate_complexity(new_password)\n    update_password(rec.user_id, new_password)\n    rec.used = True\n    audit.log('password_reset', rec.user_id)\n    return {'status': 'ok'}\n" },
        { filename: "src/api/validators.py", content: "import re\n\ndef validate_complexity(pw):\n    if len(pw) < 8 or not re.search(r'[A-Z]', pw) or not re.search(r'\\d', pw):\n        raise ValueError('Password must be 8+ chars with 1 uppercase and 1 number')\n" },
      ]},
      { task_id: "T-004", task_title: "Rate limiting + admin audit log", files: [
        { filename: "src/middleware/rate_limit.py", content: "import time\n\ndef allow_request(redis, key, limit=3, window=3600):\n    now = int(time.time())\n    redis.zremrangebyscore(key, 0, now - window)\n    if redis.zcard(key) >= limit:\n        return False\n    redis.zadd(key, {str(now): now})\n    return True\n" },
        { filename: "src/services/audit.py", content: "import logging\n\naudit_log = logging.getLogger('audit')\n\ndef log(event, user_id, **meta):\n    audit_log.info('%s user=%s meta=%s', event, user_id, meta)\n" },
      ]},
      { task_id: "T-005", task_title: "Forgot-password UI + branded email", files: [
        { filename: "src/ui/ForgotPassword.jsx", content: "import { useState } from 'react';\n\nexport default function ForgotPassword() {\n  const [email, setEmail] = useState('');\n  const [sent, setSent] = useState(false);\n  const submit = async () => {\n    await fetch('/reset/request', { method: 'POST', body: JSON.stringify({ email }) });\n    setSent(true);\n  };\n  if (sent) return <p>Check your inbox for a reset link.</p>;\n  return <form onSubmit={submit}><input value={email} onChange={e=>setEmail(e.target.value)} /><button>Send reset link</button></form>;\n}\n" },
        { filename: "src/ui/email_template.html", content: "<div style=\"font-family:sans-serif;padding:24px\">\n  <h2>Reset your password</h2>\n  <p>Click below to choose a new password. This link expires in 24 hours.</p>\n  <a href=\"{{link}}\" style=\"background:#00d4ff;padding:10px 18px;border-radius:4px\">Reset password</a>\n</div>\n" },
      ]},
    ],
  },

  qa: {
    status: "complete",
    result: {
      passed: 18, failed: 0, errors: 0, total: 18,
      tests: [
        { name: "test_token_is_single_use", status: "PASSED" },
        { name: "test_token_expires_after_24h", status: "PASSED" },
        { name: "test_rate_limit_blocks_4th_request", status: "PASSED" },
        { name: "test_password_complexity_enforced", status: "PASSED" },
        { name: "test_reset_writes_audit_log", status: "PASSED" },
        { name: "test_forgot_password_e2e_flow", status: "PASSED" },
      ],
      categories: {
        unit:        { total: 11, passed: 11, failed: 0, errors: 0, badge: "PASS" },
        integration: { total: 4,  passed: 4,  failed: 0, errors: 0, badge: "PASS" },
        e2e:         { total: 3,  passed: 3,  failed: 0, errors: 0, badge: "PASS" },
        visual:      { total: 0,  passed: 0,  failed: 0, errors: 0, badge: "—" },
      },
    },
  },

  deploy: {
    status: "complete",
    step: "done",
    branch: "devforge/self-service-password-reset",
    files_pushed: 9,
    pr_url: "https://github.com/sushilk001/devforge-ai-output/pull/42",
    pr_number: 42,
    linear_issues_closed: 6,
  },

  llmCalls: [
    { id: 1,  stage: "requirements", label: "parse_request",   model: "claude-sonnet-4-6", inputTok: 327,  outputTok: 283,  latencyMs: 7894,  cost: 0.005226 },
    { id: 2,  stage: "requirements", label: "generate_prd",    model: "claude-sonnet-4-6", inputTok: 651,  outputTok: 2319, latencyMs: 12704, cost: 0.036738 },
    { id: 3,  stage: "tasks",        label: "decompose_tasks", model: "claude-sonnet-4-6", inputTok: 2774, outputTok: 3703, latencyMs: 14677, cost: 0.063867 },
    { id: 4,  stage: "code_gen",     label: "T-001",           model: "claude-sonnet-4-6", inputTok: 1027, outputTok: 1366, latencyMs: 8697,  cost: 0.023571 },
    { id: 5,  stage: "code_gen",     label: "T-002",           model: "claude-sonnet-4-6", inputTok: 1028, outputTok: 2082, latencyMs: 9161,  cost: 0.034314 },
    { id: 6,  stage: "code_gen",     label: "T-003",           model: "claude-sonnet-4-6", inputTok: 1034, outputTok: 2300, latencyMs: 9896,  cost: 0.037602 },
    { id: 7,  stage: "code_gen",     label: "T-004",           model: "claude-sonnet-4-6", inputTok: 1051, outputTok: 2072, latencyMs: 9393,  cost: 0.034233 },
    { id: 8,  stage: "code_gen",     label: "T-005",           model: "claude-sonnet-4-6", inputTok: 1034, outputTok: 1938, latencyMs: 8641,  cost: 0.032172 },
    { id: 9,  stage: "pr_review",    label: "security",        model: "claude-sonnet-4-6", inputTok: 7619, outputTok: 1061, latencyMs: 10260, cost: 0.038772 },
    { id: 10, stage: "pr_review",    label: "quality",         model: "claude-sonnet-4-6", inputTok: 7608, outputTok: 1126, latencyMs: 10970, cost: 0.039714 },
    { id: 11, stage: "pr_review",    label: "architecture",    model: "claude-sonnet-4-6", inputTok: 7632, outputTok: 1172, latencyMs: 11928, cost: 0.040476 },
    { id: 12, stage: "pr_review",    label: "coverage",        model: "claude-sonnet-4-6", inputTok: 7624, outputTok: 1264, latencyMs: 12568, cost: 0.041832 },
    { id: 13, stage: "deploy",       label: "pr-description",  model: "claude-sonnet-4-6", inputTok: 3892, outputTok: 612,  latencyMs: 6120,  cost: 0.020856 },
  ],
};

// ── New Software: Snip — URL shortener service (built from scratch) ───────────
const NEW_SOFTWARE = {
  label: "New software: Snip — URL Shortener Service",
  prompt:
    "Build a lightweight URL shortener service from scratch. Devs POST a long URL and get a short slug (custom slugs allowed); visiting the slug 302-redirects instantly; per-link click analytics; optional expiry; rate limited. FastAPI + Postgres + Redis, containerized, deployed with a public URL and API docs.",

  prd: {
    title: "Snip — URL Shortener Service",
    version: "1.0",
    problem_statement:
      "Teams paste long, unshareable links into docs and Slack with no branding and no visibility into clicks. There is no lightweight, self-hostable service to create short links and see per-link analytics.",
    goals: [
      "Create short links via API and a minimal web UI",
      "Redirect resolves in under 50ms via a Redis cache",
      "Per-link click analytics (count, last-seen, referrer)",
      "Support custom slugs and optional link expiry",
    ],
    non_goals: ["User accounts / teams (v1)", "QR-code generation", "Custom domains"],
    user_stories: [
      { as_a: "developer", i_want: "POST a long URL and get back a short slug" },
      { as_a: "end user", i_want: "the short link to redirect me instantly" },
      { as_a: "link owner", i_want: "see how many times each link was clicked" },
    ],
    acceptance_criteria: [
      "POST /links returns a unique slug; custom slug honored if free",
      "GET /{slug} issues a 302 redirect; 404 for unknown or expired",
      "Every resolve increments a click counter asynchronously",
      "Redirects are served from Redis with a Postgres fallback",
      "Create endpoint is rate limited per API key",
    ],
    technical_notes: ["FastAPI", "Postgres + SQLAlchemy", "Redis cache", "Dockerized", "Deploy on Railway"],
  },

  tasks: [
    { id: "T-001", title: "Project scaffold + Dockerfile + CI",     type: "chore",   priority: "high",   estimate_hours: 3, dependencies: [],                 linear_issue_id: "SNIP-1" },
    { id: "T-002", title: "Postgres schema + migrations",           type: "chore",   priority: "high",   estimate_hours: 3, dependencies: ["T-001"],          linear_issue_id: "SNIP-2" },
    { id: "T-003", title: "Create-link API (slug gen + custom)",    type: "feature", priority: "urgent", estimate_hours: 5, dependencies: ["T-002"],          linear_issue_id: "SNIP-3" },
    { id: "T-004", title: "Redirect endpoint + Redis cache",        type: "feature", priority: "urgent", estimate_hours: 4, dependencies: ["T-002"],          linear_issue_id: "SNIP-4" },
    { id: "T-005", title: "Click analytics tracking",               type: "feature", priority: "medium", estimate_hours: 4, dependencies: ["T-004"],          linear_issue_id: "SNIP-5" },
    { id: "T-006", title: "Minimal web UI (create + list)",         type: "feature", priority: "high",   estimate_hours: 5, dependencies: ["T-003"],          linear_issue_id: "SNIP-6" },
    { id: "T-007", title: "Unit + integration + E2E tests",         type: "testing", priority: "medium", estimate_hours: 5, dependencies: ["T-005", "T-006"], linear_issue_id: "SNIP-7" },
  ],

  depGraph: {
    total_estimated_hours: 29,
    critical_path: ["T-001", "T-002", "T-004", "T-005", "T-007"],
    parallel_tracks: [["T-001"], ["T-002"], ["T-003", "T-004"], ["T-005", "T-006"], ["T-007"]],
    edges: [
      { from_task: "T-001", to_task: "T-002" },
      { from_task: "T-002", to_task: "T-003" },
      { from_task: "T-002", to_task: "T-004" },
      { from_task: "T-004", to_task: "T-005" },
      { from_task: "T-003", to_task: "T-006" },
      { from_task: "T-005", to_task: "T-007" },
      { from_task: "T-006", to_task: "T-007" },
    ],
  },

  review: {
    verdict: "APPROVED WITH SUGGESTIONS — 0 blockers · 1 warning · 2 suggestions",
    findings: [
      { agent: "security",     severity: "warning", title: "Open-redirect risk on create", recommendation: "Validate the target URL scheme (allow only http/https) so the shortener can't be used to redirect to javascript: or data: URLs." },
      { agent: "quality",      severity: "info",    title: "Slug generation coupled to handler", recommendation: "Extract slug generation into a pure, unit-testable helper independent of the request handler." },
      { agent: "architecture", severity: "info",    title: "Solid cache-aside pattern",   recommendation: "Redirect path uses cache-aside cleanly; consider a short negative-cache TTL for 404s to shield Postgres." },
    ],
  },

  codeGen: {
    total_files: 10,
    message: "Generated 6 tasks → output/snip-url-shortener",
    generated: [
      { task_id: "T-001", task_title: "Project scaffold + Dockerfile + CI", files: [
        { filename: "Dockerfile", content: "FROM python:3.11-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY src ./src\nEXPOSE 8000\nCMD [\"uvicorn\", \"src.main:app\", \"--host\", \"0.0.0.0\", \"--port\", \"8000\"]\n" },
        { filename: "src/main.py", content: "from fastapi import FastAPI\nfrom src.api import links, redirect\n\napp = FastAPI(title=\"Snip — URL Shortener\")\napp.include_router(links.router)\napp.include_router(redirect.router)\n\n@app.get(\"/healthz\")\ndef healthz():\n    return {\"status\": \"ok\"}\n" },
      ]},
      { task_id: "T-002", task_title: "Postgres schema + migrations", files: [
        { filename: "src/models.py", content: "from sqlalchemy import Column, String, Integer, DateTime, func\nfrom src.db import Base\n\nclass Link(Base):\n    __tablename__ = \"links\"\n    slug = Column(String, primary_key=True)\n    target = Column(String, nullable=False)\n    clicks = Column(Integer, default=0)\n    created_at = Column(DateTime, server_default=func.now())\n    expires_at = Column(DateTime, nullable=True)\n" },
      ]},
      { task_id: "T-003", task_title: "Create-link API (slug gen + custom)", files: [
        { filename: "src/api/links.py", content: "from fastapi import APIRouter, HTTPException\nfrom src.slug import new_slug, valid_url\nfrom src import store\n\nrouter = APIRouter()\n\n@router.post(\"/links\")\ndef create_link(target: str, slug: str | None = None):\n    if not valid_url(target):\n        raise HTTPException(400, \"Only http/https URLs allowed\")\n    slug = slug or new_slug()\n    if store.exists(slug):\n        raise HTTPException(409, \"Slug already taken\")\n    store.save(slug, target)\n    return {\"slug\": slug, \"short_url\": f\"https://snip.dev/{slug}\"}\n" },
        { filename: "src/slug.py", content: "import secrets, string\nfrom urllib.parse import urlparse\n\n_ALPHABET = string.ascii_letters + string.digits\n\ndef new_slug(n: int = 7) -> str:\n    return \"\".join(secrets.choice(_ALPHABET) for _ in range(n))\n\ndef valid_url(url: str) -> bool:\n    return urlparse(url).scheme in (\"http\", \"https\")\n" },
      ]},
      { task_id: "T-004", task_title: "Redirect endpoint + Redis cache", files: [
        { filename: "src/api/redirect.py", content: "from fastapi import APIRouter, HTTPException\nfrom fastapi.responses import RedirectResponse\nfrom src import cache, store, analytics\n\nrouter = APIRouter()\n\n@router.get(\"/{slug}\")\ndef resolve(slug: str):\n    target = cache.get(slug) or store.target_for(slug)\n    if not target:\n        raise HTTPException(404, \"Unknown or expired link\")\n    cache.set(slug, target, ttl=3600)\n    analytics.record_click(slug)\n    return RedirectResponse(target, status_code=302)\n" },
      ]},
      { task_id: "T-005", task_title: "Click analytics tracking", files: [
        { filename: "src/analytics.py", content: "from src import store\n\ndef record_click(slug: str):\n    # fire-and-forget increment; never blocks the redirect\n    store.increment_clicks(slug)\n\ndef stats(slug: str):\n    row = store.get_row(slug)\n    return {\"slug\": slug, \"clicks\": row.clicks, \"created_at\": row.created_at}\n" },
      ]},
      { task_id: "T-006", task_title: "Minimal web UI (create + list)", files: [
        { filename: "src/ui/App.jsx", content: "import { useState } from 'react';\n\nexport default function App() {\n  const [url, setUrl] = useState('');\n  const [short, setShort] = useState(null);\n  const shorten = async () => {\n    const r = await fetch('/links', { method: 'POST', body: JSON.stringify({ target: url }) });\n    setShort((await r.json()).short_url);\n  };\n  return (\n    <div>\n      <input value={url} onChange={e => setUrl(e.target.value)} placeholder=\"Paste a long URL\" />\n      <button onClick={shorten}>Shorten</button>\n      {short && <a href={short}>{short}</a>}\n    </div>\n  );\n}\n" },
      ]},
    ],
  },

  qa: {
    status: "complete",
    result: {
      passed: 22, failed: 0, errors: 0, total: 22,
      tests: [
        { name: "test_create_link_returns_slug", status: "PASSED" },
        { name: "test_custom_slug_honored", status: "PASSED" },
        { name: "test_duplicate_slug_409", status: "PASSED" },
        { name: "test_redirect_302_and_target", status: "PASSED" },
        { name: "test_unknown_slug_404", status: "PASSED" },
        { name: "test_reject_javascript_url", status: "PASSED" },
        { name: "test_click_counter_increments", status: "PASSED" },
        { name: "test_ui_create_flow_e2e", status: "PASSED" },
      ],
      categories: {
        unit:        { total: 12, passed: 12, failed: 0, errors: 0, badge: "PASS" },
        integration: { total: 6,  passed: 6,  failed: 0, errors: 0, badge: "PASS" },
        e2e:         { total: 4,  passed: 4,  failed: 0, errors: 0, badge: "PASS" },
        visual:      { total: 0,  passed: 0,  failed: 0, errors: 0, badge: "—" },
      },
    },
  },

  deploy: {
    status: "complete",
    step: "done",
    branch: "devforge/snip-url-shortener",
    files_pushed: 12,
    pr_url: "https://github.com/sushilk001/devforge-ai-output/pull/43",
    pr_number: 43,
    linear_issues_closed: 7,
    app_url: "https://snip-devforge.up.railway.app",
    app_docs_url: "https://snip-devforge.up.railway.app/docs",
  },

  llmCalls: [
    { id: 1,  stage: "requirements", label: "parse_request",   model: "claude-sonnet-4-6", inputTok: 388,  outputTok: 341,  latencyMs: 8123,  cost: 0.006279 },
    { id: 2,  stage: "requirements", label: "generate_prd",    model: "claude-sonnet-4-6", inputTok: 712,  outputTok: 2564, latencyMs: 13411, cost: 0.040596 },
    { id: 3,  stage: "tasks",        label: "decompose_tasks", model: "claude-sonnet-4-6", inputTok: 3055, outputTok: 4187, latencyMs: 15984, cost: 0.072970 },
    { id: 4,  stage: "code_gen",     label: "T-001",           model: "claude-sonnet-4-6", inputTok: 986,  outputTok: 1244, latencyMs: 8012,  cost: 0.021618 },
    { id: 5,  stage: "code_gen",     label: "T-002",           model: "claude-sonnet-4-6", inputTok: 1042, outputTok: 1508, latencyMs: 8544,  cost: 0.025746 },
    { id: 6,  stage: "code_gen",     label: "T-003",           model: "claude-sonnet-4-6", inputTok: 1130, outputTok: 2416, latencyMs: 10233, cost: 0.039630 },
    { id: 7,  stage: "code_gen",     label: "T-004",           model: "claude-sonnet-4-6", inputTok: 1098, outputTok: 1962, latencyMs: 9187,  cost: 0.032724 },
    { id: 8,  stage: "code_gen",     label: "T-005",           model: "claude-sonnet-4-6", inputTok: 1074, outputTok: 1571, latencyMs: 8461,  cost: 0.026787 },
    { id: 9,  stage: "code_gen",     label: "T-006",           model: "claude-sonnet-4-6", inputTok: 1121, outputTok: 1834, latencyMs: 8992,  cost: 0.030873 },
    { id: 10, stage: "pr_review",    label: "security",        model: "claude-sonnet-4-6", inputTok: 8241, outputTok: 1187, latencyMs: 11024, cost: 0.042528 },
    { id: 11, stage: "pr_review",    label: "quality",         model: "claude-sonnet-4-6", inputTok: 8203, outputTok: 1094, latencyMs: 10761, cost: 0.041019 },
    { id: 12, stage: "pr_review",    label: "architecture",    model: "claude-sonnet-4-6", inputTok: 8267, outputTok: 1216, latencyMs: 11588, cost: 0.043041 },
    { id: 13, stage: "pr_review",    label: "coverage",        model: "claude-sonnet-4-6", inputTok: 8255, outputTok: 1358, latencyMs: 12233, cost: 0.045135 },
    { id: 14, stage: "deploy",       label: "pr-description",  model: "claude-sonnet-4-6", inputTok: 4318, outputTok: 689,  latencyMs: 6540,  cost: 0.023289 },
  ],
};

export const DEMO_RUNS = { add_feature: ADD_FEATURE, new_software: NEW_SOFTWARE };
export const DEMO_DATA = ADD_FEATURE; // backward-compat alias
