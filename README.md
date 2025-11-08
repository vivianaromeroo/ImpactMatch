# ImpactMatch

ImpactMatch helps mission-driven teams uncover the best-fit grants for their ideas. Paste a short project description, and the app will extract relevant themes with Gemini, cross-reference a grant catalog, and surface tailored opportunities with high-level proposal drafts.

This README is written as a guide so you can understand *why* each piece exists, not just how to run it.

---

## 1. Architecture tour

| Layer      | Location   | Responsibilities |
| ---------- | ---------- | ---------------- |
| Frontend   | `frontend/` | Collects user input, calls the API, renders grant cards and proposal drafts. |
| Backend    | `backend/`  | Talks to Gemini, loads grant data, scores matches, and exposes REST endpoints. |
| Data       | `backend/grants.json` | Mock grant catalog used for the prototype scoring engine. |

**End-to-end flow**
1. User submits a project description in the React app.
2. Frontend calls `POST /match`.
3. Flask loads the grants, extracts keywords (Gemini → heuristic fallback), scores each grant, and returns the top three with metadata.
4. User clicks “Generate Proposal”; frontend calls `POST /proposal`.
5. Flask crafts a prompt with the selected grant + project description and requests a Gemini proposal draft (with a fallback template).

---

## 2. Prerequisites & environment

- Node.js 18+ (or higher) for the React/Vite build.
- Python 3.11+ and `pip` for the Flask app.
- Gemini API key saved in `GEMINI_API_KEY` for live AI responses.

Create `backend/.env` (optional but recommended):

```
GEMINI_API_KEY=your-google-generative-ai-key
PORT=8000
```

If `GEMINI_API_KEY` is missing, the backend keeps working with deterministic fallbacks so you can still experiment.

---

## 3. Backend walkthrough (`backend/`)

### Install & run

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
flask --app app run --port 8000 --debug
```

### Key files

- `app.py`  
  - `extract_keywords()` first tries Gemini, then uses a regex-based heuristic that filters common stop words.  
  - `find_top_grants()` converts `grants.json` into a pandas DataFrame and scores each row by keyword overlap with focus areas, geographies, and summary text.  
  - `generate_proposal()` builds a structured prompt and calls Gemini. When Gemini is offline, it returns a templated string—a handy pattern for demos.
- `grants.json`  
  - Small mock dataset that includes focus areas, geographies, and eligibility items. These fields power the matching logic and the frontend checklist display.

### API reference

`POST /match`
```jsonc
{
  "projectDescription": "Solar-powered microgrids for rural clinics"
}
```
Response fields:
- `keywords`: Gemini (or heuristic) keywords
- `matches`: up to three grants with `id`, `title`, `score`, `summary`, and `eligibilityChecklist`

`POST /proposal`
```jsonc
{
  "projectDescription": "...",
  "grantId": "grant-001"
}
```
Returns `{ "grantId": "...", "proposal": "..." }`.

### Learning check

- Try adjusting the scoring function to weight `focus_areas` more heavily than `summary`.  
- Swap `pandas` for a pure-Python alternative to feel the trade-offs.  
- Add logging to see the raw Gemini prompts/responses (but never log secrets!).

---

## 4. Frontend walkthrough (`frontend/`)

### Install & run

```bash
cd frontend
npm install
npm run dev
```

Vite serves the app at `http://localhost:5173` and proxies `/api/*` to `http://127.0.0.1:8000`. Ensure the backend is running first.

### Key files

- `src/App.tsx`  
  - Manages the app state: project description, keywords, matches, proposal drafts, and loading/error flags.  
  - Renders the text area, the keyword chips, and a card grid.  
  - Provides optimistic defaults (`defaultMatches`) so the UI is populated even before you connect the backend.
- `src/api/client.ts`  
  - Axios instance that respects `VITE_API_BASE_URL` (set this in production).  
  - Exports `matchGrants()` and `generateProposal()` helpers.
- `src/components/GrantCard.tsx`  
  - Reusable UI for grant results, including the eligibility checklist and the “Generate Proposal” button.

### Learning check

- Add form validation (e.g., enforce a minimum description length).  
- Replace Axios with the Fetch API to compare ergonomics.  
- Theme the UI by customizing Tailwind’s `primary` color scale in `tailwind.config.js`.

---

## 5. Development workflow tips

- The proxy rule in `vite.config.ts` keeps local development simple; once you deploy the backend, update `VITE_API_BASE_URL` and redeploy the frontend.  
- Keep credentials out of source control—use `.env` files locally and platform secrets in production.  
- Run `npm run lint` and Python formatting tools (`ruff`, `black`, etc.) as you extend the project.

---

## 6. Deploying

### Frontend → Cloudflare Pages

1. Push the repo to GitHub (or another git host).
2. In Cloudflare Pages, create a new project from the repo.
3. Build configuration:
   - Build command: `npm run build`
   - Build directory: `frontend/dist`
   - Install command: `npm install`
   - Node version: `18`
4. Configure environment variables (e.g., `VITE_API_BASE_URL=https://your-backend.com`).
5. Deploy. Cloudflare builds the static assets and serves them globally.

### Backend → Render (example)

1. Create a new Render Web Service, pointing at this repo.
2. Settings:
   - Runtime: Python 3.11
   - Build command: `pip install -r backend/requirements.txt`
   - Start command: `gunicorn app:app`
   - Working directory: `backend`
3. Environment variables: `GEMINI_API_KEY`, `PORT=8000`
4. Render publishes a public URL such as `https://impactmatch-backend.onrender.com`.

Plug this URL into the frontend’s `VITE_API_BASE_URL` before rebuilding/deploying the client.

---

## 7. Sample API calls

```bash
curl -X POST http://127.0.0.1:8000/match \
  -H "Content-Type: application/json" \
  -d '{"projectDescription": "Solar-powered microgrids for rural clinics"}'

curl -X POST http://127.0.0.1:8000/proposal \
  -H "Content-Type: application/json" \
  -d '{"projectDescription": "Solar-powered microgrids for rural clinics", "grantId": "grant-001"}'
```

Try modifying the `projectDescription` to see how keyword extraction and scoring shift.

---

## 8. Stretch ideas

- Replace the heuristic scoring with semantic search (e.g., embeddings).  
- Add pagination and filtering in the frontend for bigger grant catalogs.  
- Persist proposal drafts so users can download or email them.  
- Instrument the app with analytics or logging to learn how users interact with the tool.

---

Happy building—and have fun experimenting with ImpactMatch! 🎯

