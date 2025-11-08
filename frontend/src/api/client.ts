import axios from "axios";
import type {
  MatchRequest,
  MatchResponse,
  ProposalRequest,
  ProposalResponse,
} from "../types";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api",
  timeout: 15000,
});

export const matchGrants = async (
  payload: MatchRequest,
): Promise<MatchResponse> => {
  const { data } = await api.post<MatchResponse>("/match", payload);
  return data;
};

export const generateProposal = async (
  payload: ProposalRequest,
): Promise<ProposalResponse> => {
  const { data } = await api.post<ProposalResponse>("/proposal", payload);
  return data;
};

