import type { GrantMatch } from "../types";

interface GrantCardProps {
  grant: GrantMatch;
  onGenerateProposal: (grant: GrantMatch) => void;
  isLoading: boolean;
}

const GrantCard = ({ grant, onGenerateProposal, isLoading }: GrantCardProps) => {
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
      <header className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">{grant.title}</h3>
          <p className="mt-1 text-sm text-slate-400">ImpactMatch score</p>
        </div>
        <span className="rounded-full bg-primary-500/10 px-3 py-1 text-sm font-medium text-primary-200">
          {Math.round(grant.score * 100)}%
        </span>
      </header>

      <p className="text-sm text-slate-300">{grant.summary}</p>

      <section>
        <h4 className="text-sm font-semibold text-white">Eligibility check</h4>
        <ul className="mt-2 space-y-1 text-sm text-slate-300">
          {grant.eligibilityChecklist.map((item, index) => (
            <li key={`${grant.id}-eligibility-${index}`} className="flex gap-2">
              <span aria-hidden="true" className="text-primary-300">
                •
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:bg-slate-700"
          onClick={() => onGenerateProposal(grant)}
          disabled={isLoading}
        >
          {isLoading ? "Generating..." : "Generate Proposal"}
        </button>
      </footer>
    </article>
  );
};

export default GrantCard;

