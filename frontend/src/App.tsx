import { useState } from "react";
import impactLogo from "./assets/Logo.png";
import GrantCard from "./components/GrantCard";
import { matchGrants, generateProposal } from "./api/client";
import type {
  GrantMatch,
  MatchResponse,
  ProposalResponse,
} from "./types";

const defaultMatches: GrantMatch[] = [
  {
    id: "sample-1",
    title: "Community Climate Action Fund",
    score: 0.92,
    summary:
      "Supports grassroots initiatives reducing greenhouse gas emissions in underserved communities.",
    eligibilityChecklist: [
      "501(c)(3) nonprofit or fiscal sponsorship in place",
      "Serves communities under 100k population",
      "Project duration under 18 months",
    ],
  },
];

function App() {
  const [projectDescription, setProjectDescription] = useState(
    "Introduce your project idea and the impact you aim to create.",
  );
  const [keywords, setKeywords] = useState<string[]>([]);
  const [matches, setMatches] = useState<GrantMatch[]>(defaultMatches);
  const [proposalDraft, setProposalDraft] = useState<string>("");
  const [isMatching, setIsMatching] = useState(false);
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMatch = async () => {
    try {
      setIsMatching(true);
      setError(null);
      setProposalDraft("");
      const payload = { projectDescription };
      const response: MatchResponse = await matchGrants(payload);
      setMatches(response.matches);
      setKeywords(response.keywords);
    } catch (err) {
      console.error(err);
      setError("We hit a snag while fetching grant matches. Try again soon.");
    } finally {
      setIsMatching(false);
    }
  };

  const handleGenerateProposal = async (grant: GrantMatch) => {
    try {
      setIsGeneratingProposal(true);
      setError(null);
      const payload = {
        grantId: grant.id,
        projectDescription,
      };
      const response: ProposalResponse = await generateProposal(payload);
      setProposalDraft(response.proposal);
    } catch (err) {
      console.error(err);
      setError("Proposal draft not available right now. Please retry.");
    } finally {
      setIsGeneratingProposal(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-4 py-10">
      <nav className="flex items-center justify-between rounded-2xl px-6 py-4 shadow-lg">
        <img
          src={impactLogo}
          alt="ImpactMatch logo"
          className="h-19 w-auto"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-full border border-primary-500 px-4 py-2 text-sm font-semibold text-primary-100 transition hover:bg-primary-500/10"
          >
            Applicants
          </button>
          <button
            type="button"
            className="rounded-full bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-400"
          >
            Sponsors
          </button>
        </div>
      </nav>

      <header className="space-y-4 text-center">
        <h1 className="text-4xl font-bold text-white">
          Find grants tailored to your mission
        </h1>
        <p className="mx-auto max-w-2xl text-base text-slate-300">
          Paste a short description of your project. ImpactMatch will pull key
          themes with Gemini, compare thousands of grants, and surface the top
          opportunities to help you fund your impact.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
          <label htmlFor="project-description" className="text-sm font-medium">
            Project description
          </label>
          <textarea
            id="project-description"
            value={projectDescription}
            onChange={(event) => setProjectDescription(event.target.value)}
            className="mt-3 min-h-[180px] rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-100 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-500/40"
            placeholder="Describe the problem you are tackling, the community impacted, and the solution you propose."
          />
          <button
            type="button"
            onClick={handleMatch}
            disabled={isMatching}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {isMatching ? "Finding matches..." : "Find my grants"}
          </button>
          {error && (
            <p className="mt-3 rounded-lg border border-rose-900 bg-rose-500/10 p-3 text-sm text-rose-200">
              {error}
            </p>
          )}
          {keywords.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-wide text-slate-300"
                >
                  {keyword}
                </span>
              ))}
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
          <h2 className="text-lg font-semibold text-white">
            Gemini proposal draft
          </h2>
          <p className="text-sm text-slate-300">
            Select a grant match to generate a tailored summary you can use in
            your application.
          </p>
          <div className="relative mt-3 min-h-[180px] rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm">
            {proposalDraft ? (
              <pre className="whitespace-pre-wrap font-sans text-slate-200">
                {proposalDraft}
              </pre>
            ) : (
              <p className="text-slate-500">
                Your proposal draft will appear here once generated.
              </p>
            )}
          </div>
        </aside>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        {matches.map((grant) => (
          <GrantCard
            key={grant.id}
            grant={grant}
            onGenerateProposal={handleGenerateProposal}
            isLoading={isGeneratingProposal}
          />
        ))}
      </section>
    </div>
  );
}

export default App;

