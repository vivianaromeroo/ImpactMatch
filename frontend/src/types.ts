export interface GrantMatch {
  id: string;
  title: string;
  score: number;
  summary: string;
  eligibilityChecklist: string[];
  fundingRange: string;
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
  customTemplate?: string;
}

export interface ProposalResponse {
  grantId: string;
  proposal: string;
}

export interface UploadTemplateResponse {
  template_text: string;
}

