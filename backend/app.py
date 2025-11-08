from __future__ import annotations

import json
import math
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

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
EMBEDDING_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "models/text-embedding-004")
SEMANTIC_WEIGHT = 0.6
KEYWORD_WEIGHT = 0.4
COSINE_MIN = float(os.getenv("GEMINI_COSINE_MIN", "0.3"))
COSINE_MAX = float(os.getenv("GEMINI_COSINE_MAX", "0.7"))
FOCUS_MATCH_BONUS = float(os.getenv("FOCUS_MATCH_BONUS", "1.5"))
MIN_MATCH_SCORE = float(os.getenv("MIN_MATCH_SCORE", "0.25"))

_embedding_cache: Dict[str, List[float]] = {}
_genai_configured = False


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
        matches = find_top_grants(keywords, project_description)

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


def extract_keywords(project_description: str) -> List[str]:
    num_words = len(project_description.split())
    max_keywords = max(5, int(num_words * 0.2))
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


def find_top_grants(
    keywords: List[str], project_description: str, limit: Optional[int] = None
) -> List[Dict[str, Any]]:
    if not keywords:
        keywords = ["innovation"]

    df = load_grants_dataframe()
    project_embedding = embed_text(project_description)
    has_embeddings = project_embedding is not None
    semantic_weight = SEMANTIC_WEIGHT if has_embeddings else 0.0
    keyword_weight = KEYWORD_WEIGHT if has_embeddings else 1.0
    keyword_weights = compute_keyword_weights(project_description, keywords)
    total_possible_keyword_weight = sum(weight * FOCUS_MATCH_BONUS for weight in keyword_weights.values()) or 1.0

    semantic_similarities: Dict[str, float] = {}
    similarity_values: List[float] = []

    if has_embeddings:
        for _, row in df.iterrows():
            grant_id = str(row.get("id"))
            grant_embedding = embed_grant(row)
            if grant_embedding:
                similarity = cosine_similarity(project_embedding, grant_embedding)
                semantic_similarities[grant_id] = similarity
                similarity_values.append(similarity)

        min_sim, max_sim = compute_similarity_bounds(similarity_values)

    def score_row(row: pd.Series) -> float:
        tags = list(row.get("focus_areas", [])) + list(row.get("geography", []))
        titles = [row.get("title", "")] + row.get("focus_areas", [])
        tag_set = {normalize_phrase(str(tag)) for tag in tags if tag}
        title_tokens = {normalize_phrase(str(title)) for title in titles if title}
        summary_text = normalize_phrase(str(row.get("summary", "")))
        keyword_score_weighted = 0.0

        for keyword in keywords:
            kw_normalized = normalize_phrase(keyword)
            weight = keyword_weights.get(keyword, 0.0)
            if weight <= 0.0:
                continue

            in_focus = kw_normalized in tag_set or any(
                keyword_in_text(normalize_phrase(str(tag)), kw_normalized) for tag in tags
            )
            in_title = any(keyword_in_text(token, kw_normalized) for token in title_tokens)
            in_summary = keyword_in_text(summary_text, kw_normalized)

            if in_focus or in_title:
                keyword_score_weighted += weight * FOCUS_MATCH_BONUS
            elif in_summary:
                keyword_score_weighted += weight

        keyword_score = keyword_score_weighted / total_possible_keyword_weight

        semantic_similarity = 0.0
        if has_embeddings and project_embedding:
            grant_id = str(row.get("id"))
            raw_similarity = semantic_similarities.get(grant_id)
            if raw_similarity is not None:
                semantic_similarity = normalize_cosine_similarity(raw_similarity, min_sim, max_sim)

        final_score = (semantic_weight * semantic_similarity) + (keyword_weight * keyword_score)
        final_score *= 1.13
        return max(0.0, min(1.0, final_score))

    df = df.copy()
    df["score"] = df.apply(score_row, axis=1)
    df = df.sort_values(by="score", ascending=False)
    filtered = df[df["score"] >= MIN_MATCH_SCORE]

    if not filtered.empty:
        return filtered.to_dict(orient="records")

    if limit is not None:
        return df.head(limit).to_dict(orient="records")

    return df.to_dict(orient="records")


def generate_proposal(project_description: str, grant: Dict[str, Any]) -> str:
    """Generate a short proposal draft referencing the selected grant."""
    prompt = """
        You are a professional grant writer creating a concise proposal draft for a potential funder.

        Your goal is to align the applicant’s project with the selected grant’s goals, based solely on the provided information.
        Use the details from the grant JSON and project description to complete the following template faithfully.

        Guidelines:
        - Keep the tone professional, clear, and persuasive.
        - Use factual language only. Do not invent or assume data (dates, names, budgets, etc.). Write “TBD” where unknown.
        - Stay under 500 words total if possible.
        - Do NOT include section labels like [LABEL] or any markdown formatting.
        - Return only the proposal text — no commentary, notes, or explanations.

        Follow this exact structure:

        1. A short, impactful headline that summarizes the project’s alignment with the grant’s mission.

        2. Objective:
        A concise summary showing how the project uniquely addresses the funder’s goals or focus areas.

        3. Scope:
        Define exactly what the proposal will cover, focusing on measurable outcomes and beneficiaries.

        4. Deliverables / Timeline / Investment:
        Deliverable #1 - Description | Delivery Date #1 | Budget Item #1
        Deliverable #2 - Description | Delivery Date #2 | Budget Item #2
        Deliverable #3 - Description | Delivery Date #3 | Budget Item #3

        5. Contact Details:
        Representative Name – TBD
        Email – TBD
        Phone – TBD
        Organization – Short description and website link (if available)

        Grant JSON:
        {grant}

        Project Description:
        {description}
    """.format(
            grant=json.dumps(grant, indent=2),
            description=project_description.strip()
        )

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
        "DUMMY DATA\n"
        "The Title: The Most Important Phrase\n\n"
        f"{grant['title']} Partnership Momentum\n\n\n"
        "Objective\n\n\n"
        f"{project_description.strip()} Our initiative aligns with the funder's focus by advancing {', '.join(grant.get('focus_areas', []))} priorities.\n\n\n"
        "Scope\n\n\n"
        f"We will collaborate with stakeholders to execute programming that reflects the grant's goals, centering the community described in the project narrative and the outcomes highlighted in the grant summary.\n\n\n"
        "Deliverables Timeline Investment\n\n\n"
        "Deliverable #1 - Detailed kickoff and stakeholder alignment | Delivery Date #1: TBD | Budget Item #1: TBD\n"
        "Deliverable #2 - Core program activities and community reporting | Delivery Date #2: TBD | Budget Item #2: TBD\n"
        "Deliverable #3 - Final impact summary with lessons learned | Delivery Date #3: TBD | Budget Item #3: TBD\n\n\n"
        "Contact Details\n\n\n"
        "Representative Name: TBD | Contact: TBD | Organization overview and website: TBD"
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


def embed_text(text: str) -> Optional[List[float]]:
    if not genai:
        return None

    normalized = (text or "").strip()
    if not normalized:
        return None

    if normalized in _embedding_cache:
        return _embedding_cache[normalized]

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    try:
        configure_genai(api_key)
        response = genai.embed_content(model=EMBEDDING_MODEL, content=normalized)
        embedding = extract_embedding_values(response)
        if embedding:
            vector = [float(value) for value in embedding]
            _embedding_cache[normalized] = vector
            return vector
    except Exception as exc:  # pragma: no cover - logging side effect only
        get_app_logger().warning("Gemini embedding failed: %s", exc)

    return None


def embed_grant(grant: pd.Series) -> Optional[List[float]]:
    combined_text = combine_grant_text(grant)
    return embed_text(combined_text)


def combine_grant_text(grant: pd.Series) -> str:
    title = str(grant.get("title", ""))
    focus_areas = ", ".join(str(area) for area in grant.get("focus_areas", []) if area)
    geography = ", ".join(str(region) for region in grant.get("geography", []) if region)
    summary = str(grant.get("summary", ""))
    eligibility = "; ".join(str(item) for item in grant.get("eligibility", []) if item)
    parts = [part for part in [focus_areas, geography, summary] if part]
    if title:
        parts.insert(0, title)
    if eligibility:
        parts.append(eligibility)
    return " | ".join(parts)


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0

    dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))

    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0

    similarity = dot_product / (norm_a * norm_b)
    return max(0.0, min(1.0, similarity))


def extract_embedding_values(response: Any) -> Optional[List[float]]:
    if response is None:
        return None

    if isinstance(response, dict):
        embedding = response.get("embedding") or response.get("values")
    else:
        embedding = getattr(response, "embedding", None)

    if isinstance(embedding, dict):
        embedding = embedding.get("values") or embedding.get("embedding")

    if isinstance(embedding, list):
        return embedding

    return None


def configure_genai(api_key: str) -> None:
    global _genai_configured
    if _genai_configured:
        return

    genai.configure(api_key=api_key)
    _genai_configured = True


def normalize_cosine_similarity(value: float, min_sim: float, max_sim: float) -> float:
    if math.isnan(value):
        return 0.0

    if max_sim <= min_sim:
        return max(0.0, min(1.0, value))

    normalized = (value - min_sim) / (max_sim - min_sim)
    return max(0.0, min(1.0, normalized))


def compute_keyword_weights(project_description: str, keywords: List[str]) -> Dict[str, float]:
    normalized_text = normalize_phrase(project_description)
    weights: Dict[str, float] = {}
    total_weight = 0.0

    for keyword in keywords:
        keyword_normalized = normalize_phrase(keyword)
        if not keyword_normalized:
            continue

        pattern = r"\b" + re.escape(keyword_normalized) + r"\b"
        frequency = len(re.findall(pattern, normalized_text)) or 1
        phrase_bonus = 1.0 + 0.2 * max(len(keyword_normalized.split()) - 1, 0)
        weight = frequency * phrase_bonus
        weights[keyword] = weight
        total_weight += weight

    if not weights:
        return {keyword: 1.0 for keyword in keywords}

    if total_weight == 0.0:
        uniform = 1.0 / len(weights)
        return {keyword: uniform for keyword in weights}

    return {keyword: weight / total_weight for keyword, weight in weights.items()}


def normalize_phrase(phrase: str) -> str:
    cleaned = re.sub(r"[^\w\s-]", " ", phrase or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip().lower()
    return cleaned


def compute_similarity_bounds(values: List[float]) -> Tuple[float, float]:
    if not values:
        return (COSINE_MIN, COSINE_MAX)

    observed_min = min(values)
    observed_max = max(values)

    if observed_max - observed_min < 1e-6:
        return (observed_min - 0.05, observed_max + 0.05)

    return (observed_min, observed_max)


def keyword_in_text(text: str, keyword: str) -> bool:
    if not text or not keyword:
        return False

    if keyword in text:
        return True

    words = keyword.split()
    if not words:
        return False

    escaped_words = [re.escape(word) for word in words[:-1]]
    trailing = words[-1]
    trailing_pattern = re.escape(trailing) + r"(?:s|es)?"
    pattern_parts = escaped_words + [trailing_pattern]
    pattern = r"\b" + r"\s+".join(pattern_parts) + r"\b"
    return re.search(pattern, text) is not None


app = create_app()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=True)

