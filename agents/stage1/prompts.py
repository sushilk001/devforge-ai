PARSE_REQUEST_PROMPT = """
You are a senior product manager at a software company.
A feature request has come in. Your job is to deeply understand it and extract structured information.

Feature Request:
\"\"\"
{raw_text}
\"\"\"

Extract the following and respond ONLY with valid JSON matching this structure:
{{
  "problem_statement": "What problem does this solve? Be specific.",
  "proposed_solution": "What is being asked to be built?",
  "target_users": ["list", "of", "user", "types"],
  "business_value": "Why does this matter to the business?",
  "is_complete": true or false,
  "missing_info": ["list any critical missing details needed to write a PRD"]
}}

Set is_complete to FALSE only if the request is truly unusable — missing ALL of:
- who the users are, AND
- what the core problem is, AND
- any notion of success or goal

If the request has a problem statement, target users, and at least one goal or success metric — set is_complete to TRUE and leave missing_info empty. Do not block reasonable requests.
"""


GENERATE_PRD_PROMPT = """
You are a senior product manager. Write a complete, professional Product Requirements Document (PRD).

Original Feature Request:
\"\"\"
{raw_text}
\"\"\"

Parsed Understanding:
- Problem: {problem_statement}
- Proposed Solution: {proposed_solution}
- Target Users: {target_users}
- Business Value: {business_value}

Respond ONLY with valid JSON matching this exact structure:
{{
  "title": "Short, clear feature title",
  "version": "1.0",
  "problem_statement": "2-3 sentence clear problem description",
  "goals": [
    "Specific, measurable goal 1",
    "Specific, measurable goal 2",
    "Specific, measurable goal 3"
  ],
  "non_goals": [
    "What this feature will NOT do",
    "Explicit out-of-scope item"
  ],
  "user_stories": [
    {{
      "as_a": "user role",
      "i_want": "specific action or feature",
      "so_that": "the benefit or outcome"
    }}
  ],
  "acceptance_criteria": [
    {{
      "given": "a specific starting state",
      "when": "the user takes this action",
      "then": "this is the expected result"
    }}
  ],
  "technical_notes": [
    "Any relevant technical consideration or constraint"
  ],
  "open_questions": [
    "Any unresolved question that needs stakeholder input"
  ]
}}

Write at least 3 user stories and 3 acceptance criteria. Be specific and actionable.
"""


REVISE_PRD_PROMPT = """
You are a senior product manager revising a PRD based on stakeholder feedback.

Original PRD:
{original_prd}

Feedback received:
\"\"\"
{feedback}
\"\"\"

Incorporate ALL feedback points and produce a revised PRD.
Respond ONLY with valid JSON using the same structure as the original PRD.
Bump the version to {new_version}.
"""
