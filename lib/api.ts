// Backend API client — all calls go to Next.js internal API routes

const BASE = "/api/voter";

export const Login = async (email: string, password: string) => {
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
};

export const AdminChallenge = async () => {
  throw new Error("AdminChallenge removed (use Google Sign-In).");
};

export const AdminLogin = async (payload: {
  email: string;
  walletAddress: string;
  challengeId: string;
  signature: string;
}) => {
  throw new Error("AdminLogin removed (use Google Sign-In).");
};

export const Register = async (payload: {
  name: string;
  email: string;
  password: string;
  walletAddress: string;
  locationId?: string;
}) => {
  const res = await fetch(`${BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
};

export const GetVoterByID = async (token: string) => {
  const res = await fetch(`${BASE}/my-data`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
};

export const GetVoterWallet = async (token: string) => {
  const res = await fetch(`${BASE}/get-wallet`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
};

export const GetElectionCandidates = async (
  token: string,
  electionId: string,
  locationId: string
) => {
  const res = await fetch(`${BASE}/get-election-candidates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ electionId, locationId }),
  });
  return res.json();
};

export const CastVote = async (token: string, electionId: string, candidateId: string) => {
  const res = await fetch(`${BASE}/cast-vote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ electionId, candidateId }),
  });
  return res.json();
};

export const GetCandidateWallets = async (electionId?: string) => {
  const q = electionId ? `?electionId=${encodeURIComponent(electionId)}` : "";
  const res = await fetch(`/api/candidate-wallets${q}`);
  return res.json();
};

export const VerifyVote = async (TransactionKey: string) => {
  const res = await fetch(`/api/validate-vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ TransactionKey }),
  });
  return res.json();
};
