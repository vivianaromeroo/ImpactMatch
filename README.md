## Inspiration
I saw mission-driven founders and nonprofits with powerful ideas struggle to secure funding—not because their projects lacked potential, but because proposal writing was overwhelming. Between eligibility criteria, timelines, and dense application forms, the process felt like a full-time job. I wanted to make grant writing as intuitive as sharing your story — and empower changemakers to focus on impact, not paperwork.

## What it does
ImpactMatch automatically generates tailored grant proposals from a simple project description. Users paste their idea or mission statement, and the platform extracts key themes using AI, compares them against hundreds of social-impact grants, and drafts a professional proposal aligned with each opportunity.

Each proposal includes sections like objectives, scope, deliverables, and budget placeholders — all structured according to real grant expectations. The app turns hours of writing and research into minutes of guided automation.

## How I built it
I built a FastAPI backend to manage data flow and orchestrate proposal generation. Grant data is parsed and cleaned, then processed through an Gemini-powered matching engine that blends keyword overlap with semantic similarity for accuracy.

On the frontend, a React + Tailwind interface enables users to describe their projects, browse recommended grants, preview auto-generated proposals, and copy the best one. Every part of the stack was designed for clarity, speed, and accessibility.

## Challenges I ran into
Designing a fair and meaningful grant–project matching algorithm turned out to be more complex than expected. Simple keyword overlap worked for exact matches but missed projects that described similar goals in different language. Pure semantic similarity, on the other hand, sometimes felt too abstract — connecting unrelated projects just because their tone was similar.

After multiple iterations, I developed a hybrid scoring system that blends both:
- Keyword overlap (40%) ensures specificity and factual alignment.
- Semantic similarity (60%) captures conceptual relevance and intent.

Tuning this balance required testing dozens of prompts and embeddings to get results that “felt right” to human reviewers. Getting the AI to distinguish between adjacent but distinct themes (e.g., “youth empowerment” vs. “education access”) was especially challenging — but ultimately made the matches far more trustworthy.

## Accomplishments that we're proud of
Before this hackathon, I had taught myself HTML, CSS, and some basic React concepts but had never built a full application from scratch. Getting a fully functional frontend, backend, and AI-powered proposal generator working together was a huge milestone. Seeing real Gemini API responses flow through my own app felt incredibly rewarding and validated everything I’ve been learning.

## What I learned
This project pushed me to deepen my understanding of every layer of development. I went from beginner to confident with Python APIs, gained practical experience integrating AI models, and learned how to connect a frontend framework like React to a live backend. More than anything, I learned how to experiment, debug, and keep pushing through technical roadblocks to make the full system come together.

## What's next for ImpactMatch
Next, I’d love to expand ImpactMatch with a web-scraping system to automatically find and populate new grant opportunities. I also plan to add an inline proposal editor, letting users refine and format their drafts directly in the app before exporting to .docx or PDF. In the future, user profiles could even help the AI learn your unique writing style from past proposals to generate even more personalized drafts.