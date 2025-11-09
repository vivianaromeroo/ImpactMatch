import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import impactLogo from "./assets/Logo.png";
import GrantCard from "./components/GrantCard";
import { matchGrants, generateProposal, uploadTemplate } from "./api/client";
import type { GrantMatch, MatchResponse, ProposalResponse } from "./types";

type SortOption =
  | "score-desc"
  | "score-asc"
  | "funding-desc"
  | "funding-asc"
  | "title-asc";

function App() {
  const [projectDescription, setProjectDescription] = useState("",);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [matches, setMatches] = useState<GrantMatch[]>([]);
  const [proposalDraft, setProposalDraft] = useState<string>("");
  const [isMatching, setIsMatching] = useState(false);
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedGrantId, setSelectedGrantId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [sortOption, setSortOption] = useState<SortOption>("score-desc");
  const [customTemplate, setCustomTemplate] = useState<string>("");
  const [templateStatus, setTemplateStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [templateError, setTemplateError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleMatch = async () => {
    try {
      setIsMatching(true);
      setHasSearched(true);
      setError(null);
      setSelectedGrantId(null);
      setProposalDraft("");
      const payload = { projectDescription };
      const response: MatchResponse = await matchGrants(payload);
      setMatches(response.matches);
      setKeywords(response.keywords);
      setSortOption("score-desc");
    } catch (err) {
      console.error(err);
      setError("We hit a snag while fetching grant matches. Try again soon.");
    } finally {
      setIsMatching(false);
    }
  };

  const handleGenerateProposal = async (
    grant: GrantMatch,
    options?: { regenerate?: boolean },
  ) => {
    try {
      setSelectedGrantId(grant.id);
      setIsGeneratingProposal(true);
      setError(null);
      const payload = {
        grantId: grant.id,
        projectDescription,
        customTemplate: customTemplate || undefined,
        regenerate: options?.regenerate ?? undefined,
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

  useEffect(() => {
    if (copyStatus === "idle") {
      return;
    }
    const timeoutId = window.setTimeout(() => setCopyStatus("idle"), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [copyStatus]);

  const handleCopyProposal = async () => {
    if (!proposalDraft.trim()) {
      return;
    }

    if (!navigator?.clipboard?.writeText) {
      setCopyStatus("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(proposalDraft);
      setCopyStatus("copied");
    } catch (copyError) {
      console.error(copyError);
      setCopyStatus("error");
    }
  };

  const handleTemplateUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleTemplateFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setTemplateStatus("uploading");
    setTemplateError(null);

    try {
      const response = await uploadTemplate(file);
      setCustomTemplate(response.template_text);
      setTemplateStatus("success");
    } catch (uploadErr) {
      console.error(uploadErr);
      setTemplateStatus("error");
      setTemplateError(
        "We couldn't process that file. Upload a .docx or .pdf template.",
      );
    }
  };

  const handleClearTemplate = () => {
    setCustomTemplate("");
    setTemplateStatus("idle");
    setTemplateError(null);
  };

  const getFundingMaximum = (grant: GrantMatch): number => {
    const range = grant.fundingRange ?? "";
    const matches = range.match(/[\d,]+/g);
    if (!matches) {
      return 0;
    }
    const amounts = matches
      .map((value) => parseInt(value.replace(/[^\d]/g, ""), 10))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (amounts.length === 0) {
      return 0;
    }
    return Math.max(...amounts);
  };

  const sortedMatches = useMemo(() => {
    const sorted = [...matches];
    switch (sortOption) {
      case "score-asc":
        sorted.sort((a, b) => a.score - b.score);
        break;
      case "funding-desc":
        sorted.sort((a, b) => getFundingMaximum(b) - getFundingMaximum(a));
        break;
      case "funding-asc":
        sorted.sort((a, b) => getFundingMaximum(a) - getFundingMaximum(b));
        break;
      case "title-asc":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "score-desc":
      default:
        sorted.sort((a, b) => b.score - a.score);
        break;
    }
    return sorted;
  }, [matches, sortOption]);

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-4 py-10">
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
          <label>
            <h2 className="text-lg font-semibold text-white">
                Project Description
            </h2>
          </label>
          <textarea
            id="project-description"
            value={projectDescription}
            onChange={(event) => setProjectDescription(event.target.value)}
            className="mt-3 min-h-[180px] rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-100 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-500/40"
            placeholder="Describe your project in detail — what challenge or need are you addressing, who is most affected, and how your proposed solution will create measurable impact or change."
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleMatch}
              disabled={isMatching}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {isMatching ? "Finding matches..." : "Find my grants"}
            </button>
            <button
              type="button"
              onClick={handleTemplateUploadClick}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary-400 px-5 py-3 text-sm font-semibold text-primary-200 transition hover:bg-primary-500/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
            >
              {templateStatus === "uploading" ? "Uploading..." : "Upload template"}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.pdf"
            onChange={handleTemplateFileChange}
            className="hidden"
          />
          {error && (
            <p className="mt-3 rounded-lg border border-rose-900 bg-rose-500/10 p-3 text-sm text-rose-200">
              {error}
            </p>
          )}
          {templateStatus === "success" && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-primary-500/20 bg-primary-500/10 px-3 py-2 text-xs text-primary-100">
              <span>Custom template uploaded and will be used for new drafts.</span>
              <button
                type="button"
                onClick={handleClearTemplate}
                className="text-primary-200 underline transition hover:text-primary-100"
              >
                Clear
              </button>
            </div>
          )}
          {templateStatus === "error" && templateError && (
            <p className="mt-3 text-xs text-rose-300">{templateError}</p>
          )}
          {customTemplate && templateStatus !== "success" && (
            <p className="mt-3 text-xs text-slate-400">
              A custom template is active and will shape generated proposals.
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
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">
              Grant Proposal Draft
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyProposal}
                disabled={!proposalDraft.trim()}
                aria-label={
                  copyStatus === "copied"
                    ? "Proposal copied"
                    : copyStatus === "error"
                    ? "Copy failed"
                    : "Copy proposal"
                }
                title={
                  copyStatus === "copied"
                    ? "Copied"
                    : copyStatus === "error"
                    ? "Copy failed"
                    : "Copy proposal"
                }
                className="inline-flex items-center justify-center rounded-lg border border-slate-600 px-3 py-1.5 text-base text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                <span aria-hidden="true">
                  {copyStatus === "copied"
                    ? "✔︎"
                    : copyStatus === "error"
                    ? "⚠︎"
                    : "⧉"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedGrantId) {
                    return;
                  }
                  const grant = matches.find((item) => item.id === selectedGrantId);
                  if (grant) {
                    handleGenerateProposal(grant, { regenerate: true });
                  }
                }}
                disabled={!selectedGrantId || isGeneratingProposal}
                aria-label={
                  isGeneratingProposal && selectedGrantId
                    ? "Refreshing proposal"
                    : "Refresh proposal"
                }
                title={
                  isGeneratingProposal && selectedGrantId
                    ? "Refreshing..."
                    : "Refresh proposal"
                }
                className="inline-flex items-center justify-center rounded-lg border border-primary-400 px-3 py-1.5 text-base text-primary-200 transition hover:bg-primary-500/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                <span aria-hidden="true">
                  {isGeneratingProposal && selectedGrantId ? "…" : "↻"}
                </span>
              </button>
            </div>
          </div>
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
          {copyStatus === "error" && (
            <p className="text-xs text-rose-300">
              We couldn&apos;t copy the text. Please try again manually.
            </p>
          )}
        </aside>
      </section>

      <div className="mt-8 border-t border-slate-800 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-white">Grant Matches</h2>
          {hasSearched && matches.length > 0 && (
            <label className="flex items-center gap-3 text-sm text-slate-300">
              <span>Sort by</span>
              <select
                value={sortOption}
                onChange={(event) =>
                  setSortOption(event.target.value as SortOption)
                }
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 transition focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
              >
                <option value="score-desc">Match score (high to low)</option>
                <option value="score-asc">Match score (low to high)</option>
                <option value="funding-desc">Funding amount (high to low)</option>
                <option value="funding-asc">Funding amount (low to high)</option>
                <option value="title-asc">Title (A to Z)</option>
              </select>
            </label>
          )}
        </div>
      </div>

      <section className="grid gap-6 md:grid-cols-2">
        {hasSearched ? (
          matches.length > 0 ? (
            sortedMatches.map((grant) => (
              <GrantCard
                key={grant.id}
                grant={grant}
                onGenerateProposal={handleGenerateProposal}
                isGenerating={
                  isGeneratingProposal && selectedGrantId === grant.id
                }
                isDisabled={isGeneratingProposal}
                isSelected={selectedGrantId === grant.id}
              />
            ))
          ) : (
            <p className="col-span-full rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center text-slate-300">
              {isMatching ? "Matching your project with grants..." : "No matches found."}
            </p>
          )
        ) : (
          <p className="col-span-full rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center text-slate-400">
            Click &quot;Find my grants&quot; to see tailored opportunities here.
          </p>
        )}
      </section>
    </div>
  );
}

export default App;

