export interface GrantMatch {
  id: string;
  title: string;
  score: number;
  summary: string;
  eligibilityChecklist: string[];
}

export interface MatchRequest {
  projectDescription: string;
}

export interface MatchResponse {
  matches: GrantMatch[];
  keywords: string[];
}

export interface ProposalRequest {
  projectDescription: string;
  grantId: string;
}

export interface ProposalResponse {
  grantId: string;
  proposal: string;
}

