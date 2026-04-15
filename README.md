## Blockchain-based E-voting System

This repository is organized as two clear workspaces:
- `root` (Next.js + TypeScript frontend and API routes)
- `ethereum/` (Truffle smart contracts and migrations)

## Project Structure

- `pages/`: Next.js pages and API endpoints
- `components/ui/`: shared UI primitives (`Button`, `Input`, `Modal`, `Spinner`)
- `components/layout/`: layout components (`Navbar`)
- `features/`: domain-based wrappers (`auth`, `wallet`, `elections`)
- `lib/`: shared utilities and API client (`lib/api.ts`)
- `ethereum/contracts/`: Solidity contracts
- `ethereum/migrations/`: Truffle migration scripts

## Setup

### 1) Frontend (root)

```bash
npm install
npm run dev
```

Frontend runs at [http://localhost:3000](http://localhost:3000).

### 2) Smart Contracts (`ethereum/`)

```bash
npm --prefix ethereum install
npm run eth:compile
npm run eth:migrate
```

Useful scripts:
- `npm run eth:compile`
- `npm run eth:migrate`
- `npm run eth:migrate:reset`

## Security and Git Hygiene

This project ignores generated and sensitive files, including:
- `**/node_modules/`
- `ethereum/artifacts/`, `ethereum/cache/`, `ethereum/build/`, `ethereum/typechain-types/`
- `.env*` local files
- `*firebase-adminsdk*.json` and other service-account JSON keys

Never commit secrets to git. If a key is exposed, rotate/revoke it immediately.

## Artifact Policy

- Source of truth for contracts is `ethereum/contracts/`.
- Build artifacts are generated locally and should not be committed.
- Frontend reads normalized app-facing helpers from `lib/` (for example `lib/simpleElectionArtifact.ts`).

## Quality Checks

```bash
npm run lint
npm run build
```
