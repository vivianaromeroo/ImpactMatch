from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    import google.generativeai as genai
except ImportError:  # pragma: no cover - library optional in mock environments
    genai = None


BASE_DIR = Path(__file__).resolve().parent
GRANTS_PATH = BASE_DIR / "grants.json"
DEFAULT_MODEL = os.getenv("GEMINI_MODEL")


def create_app() -> Flask:
    """Flask application factory."""
    app = Flask(__name__)
    CORS(app)

    @app.route("/health", methods=["GET"])
    def health() -> Tuple[str, int]:
        return "ok", 200

    @app.route("/match", methods=["POST"])
    def match_route():
        payload = request.get_json(force=True) or {}
        project_description: str = payload.get("projectDescription", "")
        if not project_description.strip():
            return jsonify({"error": "projectDescription is required"}), 400

        keywords = extract_keywords(project_description)
        matches = find_top_grants(keywords)

        response = {
            "keywords": keywords,
            "matches": [
                {
                    "id": grant["id"],
                    "title": grant["title"],
                    "score": grant["score"],
                    "summary": grant["summary"],
                    "eligibilityChecklist": grant["eligibility"],
                }
                for grant in matches
            ],
        }
        return jsonify(response)

    @app.route("/proposal", methods=["POST"])
    def proposal_route():
        payload = request.get_json(force=True) or {}
        project_description: str = payload.get("projectDescription", "")
        grant_id: str = payload.get("grantId", "")

        if not project_description.strip() or not grant_id.strip():
            return jsonify({"error": "grantId and projectDescription are required"}), 400

        matched_grant = next((grant for grant in load_grants() if grant["id"] == grant_id), None)
        if matched_grant is None:
            return jsonify({"error": f"Grant {grant_id} not found"}), 404

        proposal = generate_proposal(project_description, matched_grant)
        return jsonify({"grantId": grant_id, "proposal": proposal})

    return app


@lru_cache(maxsize=1)
def load_grants() -> List[Dict[str, Any]]:
    with GRANTS_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def load_grants_dataframe() -> pd.DataFrame:
    grants = load_grants()
    return pd.DataFrame(grants)


def extract_keywords(project_description: str, max_keywords: int = 8) -> List[str]:
    """Ask Gemini to extract keywords, fall back to simple heuristic if unavailable."""
    prompt = (
        "Extract up to {max_keywords} high-signal keywords or short phrases from the "
        "project description below. Respond with a comma-separated list, lowercase."
        "\n\nProject description:\n{description}"
    ).format(max_keywords=max_keywords, description=project_description.strip())

    if genai and os.getenv("GEMINI_API_KEY"):
        try:
            model = get_gemini_model()
            response = model.generate_content(prompt)
            text = response.text or ""
            keywords = parse_keywords(text)
            return keywords[:max_keywords] or simple_keyword_extract(project_description, max_keywords)
        except Exception as exc:  # pragma: no cover - logging side effect only
            get_app_logger().warning("Gemini keyword extraction failed: %s", exc)

    return simple_keyword_extract(project_description, max_keywords)


def parse_keywords(raw_text: str) -> List[str]:
    parts = re.split(r"[,\n]+", raw_text)
    cleaned = [part.strip().lower() for part in parts if part.strip()]
    return list(dict.fromkeys(cleaned))  # deduplicate while preserving order


def simple_keyword_extract(text: str, max_keywords: int) -> List[str]:
    tokens = re.findall(r"\b[a-zA-Z][a-zA-Z\-]{2,}\b", text.lower())
    stop_words = {
        "the",
        "and",
        "for",
        "with",
        "from",
        "that",
        "this",
        "project",
        "impact",
        "community",
        "program",
    }
    filtered = [token for token in tokens if token not in stop_words]
    unique = list(dict.fromkeys(filtered))
    return unique[:max_keywords]


def find_top_grants(keywords: List[str], limit: int = 3) -> List[Dict[str, Any]]:
    if not keywords:
        keywords = ["innovation"]

    df = load_grants_dataframe()

    def score_row(row: pd.Series) -> float:
        tags = list(row.get("focus_areas", [])) + list(row.get("geography", []))
        tags = [str(tag).lower() for tag in tags]
        summary = str(row.get("summary", "")).lower()
        matches = sum(
            1 for keyword in keywords if keyword.lower() in tags or keyword.lower() in summary
        )
        return matches / max(len(tags) + 1, 1)

    df = df.copy()
    df["score"] = df.apply(score_row, axis=1)
    df = df.sort_values(by="score", ascending=False)
    top = df.head(limit)
    return top.to_dict(orient="records")


def generate_proposal(project_description: str, grant: Dict[str, Any]) -> str:
    """Generate a short proposal draft referencing the selected grant."""
    prompt = (
        "You are drafting a concise grant proposal summary (150-200 words). "
        "Use the JSON objects below to tailor the draft. Structure the response with "
        "a brief opening, project impact, alignment with the funder's goals, and a closing call to action.\n\n"
        "Grant:\n{grant}\n\nProject description:\n{description}"
    ).format(grant=json.dumps(grant, indent=2), description=project_description.strip())

    if genai and os.getenv("GEMINI_API_KEY"):
        try:
            model = get_gemini_model()
            response = model.generate_content(prompt)
            text = response.text or ""
            if text.strip():
                return text.strip()
        except Exception as exc:  # pragma: no cover - logging side effect only
            get_app_logger().warning("Gemini proposal generation failed: %s", exc)

    return (
        f"Our project, described as '{project_description[:140]}...', aligns with the goals of {grant['title']}. "
        "We will leverage grant funds to accelerate measurable outcomes, collaborate with community partners, "
        "and deliver transparent reporting to the funder."
    )


@lru_cache(maxsize=1)
def get_gemini_model():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Set GEMINI_API_KEY to enable Gemini features.")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(DEFAULT_MODEL)


def get_app_logger():
    return app.logger


app = create_app()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=True)

