# Ethereum Workspace - Huong dan cai dat va ket noi

Thu muc `ethereum/` la workspace smart contract cua he thong bo phieu blockchain.  
Muc tieu cua workspace nay:
- Bien dich va deploy contract len mang local (Ganache)
- Cung cap artifact (`abi`, contract address) de frontend/API su dung
- Ho tro quy trinh test va demo bo phieu on-chain

## 1) Tong quan thanh phan

- `contracts/`: source Solidity (`AdvancedElection.sol`, `MultiElection.sol`, `SimpleElection.sol`)
- `migrations/`: script deploy contract bang Truffle
- `truffle-config.js`: cau hinh mang local (`127.0.0.1:7545`)
- `build/contracts/`: artifact sau khi `migrate`

Luu y: `build/`, `artifacts/`, `cache/`, `node_modules/` la file sinh ra, khong commit len git.

## 2) Yeu cau moi truong

- Node.js 18+ (khuyen nghi LTS)
- npm
- Ganache (GUI hoac CLI)
- MetaMask (trinh duyet)
- Firebase project (Auth + Firestore)

## 3) Cai dat va deploy contract

Tu root project:

```bash
npm install
npm --prefix ethereum install
npm run eth:compile
npm run eth:migrate
```

Hoac chay truc tiep trong `ethereum/`:

```bash
cd ethereum
npm install
npm run compile
npm run migrate
```

Neu can deploy lai tu dau:

```bash
npm run eth:migrate:reset
```

## 4) Ket noi Ganache

### Cach nhanh (Ganache GUI)
1. Mo Ganache -> **Quickstart Ethereum**
2. Kiem tra thong so:
   - RPC URL: thuong `http://127.0.0.1:7545`
   - Network ID: thuong `5777`
   - Chain ID: tuy phien ban Ganache (thuong `1337`)
3. Dam bao `ethereum/truffle-config.js` dang tro den dung host/port.

### Neu dung Ganache CLI

Vi du:

```bash
ganache --host 127.0.0.1 --port 7545 --chain.chainId 1337
```

## 5) Ket noi MetaMask voi mang local

1. Mo MetaMask -> Add network manually
2. Dien thong so:
   - Network Name: `Ganache Local`
   - RPC URL: `http://127.0.0.1:7545`
   - Chain ID: `1337` (hoac gia tri Ganache hien thi)
   - Currency Symbol: `ETH`
3. Import 1 tai khoan tu private key do Ganache cung cap
4. Chon dung account admin khi thao tac trang Admin On-chain

## 6) Cau hinh Firebase va env

Project nay can ca client Firebase (dang nhap) va service account (API server):

- Client env:
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- Server env (chon 1 trong 2 cach):
  - `FIREBASE_SERVICE_ACCOUNT_PATH` (duong dan toi file JSON service account), hoac
  - `FIREBASE_SERVICE_ACCOUNT` (JSON string)
- Blockchain env:
  - `ETH_RPC_URL` (mac dinh fallback: `http://127.0.0.1:7545`)
  - `ETH_NETWORK_ID` (khuyen nghi set trung network id artifact, vd `5777`)
  - `ADMIN_WALLET_ADDRESS` (vi admin bat buoc de thao tac nhay cam)

### Vi du `.env.local` (dat o root project)

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id

FIREBASE_SERVICE_ACCOUNT_PATH=C:/path/to/firebase-service-account.json
# Hoac thay bang FIREBASE_SERVICE_ACCOUNT={...json...}

ETH_RPC_URL=http://127.0.0.1:7545
ETH_NETWORK_ID=5777
ADMIN_WALLET_ADDRESS=0xYourAdminWalletAddress
```

Khong commit `.env*` va file service-account len git.

## 7) Quy trinh chay full local

1. Bat Ganache
2. Deploy contract:
   - `npm run eth:migrate` (hoac `eth:migrate:reset`)
3. Bat frontend/API o root:
   - `npm run dev`
4. Dang nhap, vao trang admin, thao tac khoi tao election on-chain
5. Bo phieu va xac minh giao dich

## 8) Xu ly loi thuong gap

- **Khong co bytecode tai contract address**
  - Thuong do Ganache reset -> can migrate lai: `npm run eth:migrate:reset`
- **Sai chain MetaMask**
  - Chuyen sang dung network Ganache, dung chain id
- **Khong doc duoc Firebase service account**
  - Kiem tra `FIREBASE_SERVICE_ACCOUNT_PATH` hoac format JSON trong `FIREBASE_SERVICE_ACCOUNT`
- **Sai network artifact**
  - Dat `ETH_NETWORK_ID` khop voi network id vua deploy

---
Neu ban muon, minh co the viet them file mau `.env.example` dong bo voi README nay de team setup nhanh hon.

