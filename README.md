# Mô tả dự án Blockchain-based E-voting System

---

## 1) Tổng quan kiến trúc

Hệ thống chia làm 2 workspace chính:

1. **Root (Next.js + TypeScript)**  
   - Giao diện người dùng (voter/admin)
   - API nội bộ (`pages/api/*`) xử lý Auth, Firestore, và cầu nối on-chain

2. **`ethereum/` (Truffle + Solidity)**  
   - Smart contract bầu cử
   - Script compile/migrate deploy lên Ganache local

Các thành phần chính:
- **Frontend**: trang đăng nhập, dashboard voter, trang election, trang admin.
- **Backend API (Next API Routes)**: xác thực token, thao tác Firestore, truy vấn/ghi blockchain.
- **Firestore**: lưu dữ liệu nghiệp vụ (elections, candidates, voters, wallets, votes, voterElections).
- **Blockchain (Ganache + contract MultiElection)**: lưu trạng thái bầu cử và tally on-chain.
- **MetaMask**: ví người dùng/admin để ký giao dịch on-chain.

---

## 2) Dữ liệu cốt lõi (Firestore)

Các collection chính:
- `voters`: hồ sơ voter.
- `wallets`: ánh xạ user -> ví, token bỏ phiếu còn lại.
- `elections`: metadata cuộc bầu cử (id, tên, ngày, trạng thái...).
- `candidates`: danh sách ứng viên theo `electionId`.
- `voterElections`: trạng thái mỗi voter theo từng election (`incomplete`/`complete`).
- `votes`: bản ghi phiếu bầu (transactionKey/signature/commitment/timestamp).
- `admins`: đánh dấu email nào là admin.

---

## 3) Luồng hoạt động end-to-end

## 3.1 Đăng nhập và liên kết ví

1. User vào `pages/index.tsx`.
2. Đăng nhập Firebase:
   - Voter: Google Sign-In.
   - Admin: email/password (được giới hạn chính sách).
3. Gọi `POST /api/auth/firebase-login` để đổi Firebase ID token thành token app nội bộ (`lib/auth.ts`).
4. Gọi `POST /api/auth/link-wallet` để liên kết địa chỉ MetaMask với user.
5. Auth được lưu local qua `components/AuthPersistor.tsx` + Recoil state.

## 3.2 Voter xem dashboard và bầu cử

1. `pages/dashboard.tsx` gọi:
   - `GET /api/voter/my-data` -> profile + danh sách election user tham gia.
   - `GET /api/eth/voting-status?electionId=...` -> phase on-chain.
2. Vào `pages/elections/[id].tsx`:
   - `POST /api/voter/get-election-candidates` lấy candidates active.
   - Kiểm tra election đang mở bỏ phiếu hay chưa (on-chain).
3. Khi bầu:
   - Flow off-chain: `POST /api/voter/cast-vote` ghi `votes` + trừ token ví.
   - Flow on-chain (trong UI candidates): gửi tx `vote(...)` lên contract.
   - Có endpoint `POST /api/voter/record-onchain-vote` để ghi nhận txHash vào Firestore theo kiểu one-shot.

## 3.3 Admin quản trị và on-chain control

Trang `pages/admin/index.tsx` cho phép:
- CRUD election qua `POST/PUT/DELETE /api/admin/elections`.
- CRUD candidate qua `POST/PUT/DELETE /api/admin/candidates`.
- Xem overview qua `GET /api/admin/overview`.
- Điều khiển on-chain:
  - Init election on-chain
  - Add candidate on-chain
  - Start voting
  - Close voting

## 3.4 Kiểm chứng phiếu

- `POST /api/validate-vote` với `TransactionKey`.
- API tìm vote record trong Firestore và trả thông tin election/candidate/timestamp.
- Admin tab kết quả dùng `GET /api/candidate-wallets` để tổng hợp tally (ưu tiên số liệu on-chain nếu đọc được RPC).

---

## 4) Smart contract và chức năng các hàm

## 4.1 `ethereum/contracts/MultiElection.sol` (contract chính đang dùng)

Mỗi election là một thực thể riêng, key bằng `bytes32 electionKey` (thường hash từ electionId).

Hàm quan trọng:
- `createElection(electionKey, title)`: tạo election mới (admin only), phase `Setup`.
- `addCandidate(electionKey, name, party)`: thêm ứng viên trong phase Setup.
- `startVoting(electionKey)`: mở bỏ phiếu (Setup -> Voting).
- `closeVoting(electionKey)`: đóng bỏ phiếu (Voting -> Closed).
- `vote(electionKey, candidateId)`: voter bỏ 1 phiếu, chống vote lại qua `hasVoted`.
- `getElection(...)`: trả metadata election (`exists`, `title`, `phase`, `candidateCount`).
- `candidateCountOf(...)`, `getCandidate(...)`, `hasVotedIn(...)`: hàm đọc phục vụ UI/API.

## 4.2 `ethereum/contracts/SimpleElection.sol`

Contract đơn election, logic đơn giản setup/voting/closed. Có trong repo để tham khảo/legacy.

## 4.3 `ethereum/contracts/AdvancedElection.sol`

Contract commit-reveal (Draft -> Registration -> Commit -> Reveal -> Closed -> Finalized).  
Hiện UI chính mô tả rằng flow reveal đã không còn dùng trực tiếp.

---

## 5) API routes quan trọng (backend)

## 5.1 Nhóm Auth

- `POST /api/auth/firebase-login` (`pages/api/auth/firebase-login.ts`)
  - Verify Firebase token.
  - Phân vai `admin|voter` dựa vào `admins` collection.
  - Tạo app token bằng `signToken(...)`.

- `POST /api/auth/upsert-profile` (`pages/api/auth/upsert-profile.ts`)
  - Tạo/cập nhật hồ sơ voter trong `voters`.
  - Đảm bảo sinh `voterElections` cho tất cả election hiện có.

- `POST /api/auth/link-wallet` (`pages/api/auth/link-wallet.ts`)
  - Verify ID token.
  - Ràng buộc ví admin nếu có `ADMIN_WALLET_ADDRESS`.
  - Liên kết ví qua `linkWalletToFirebaseUser(...)`.

## 5.2 Nhóm Voter

- `GET /api/voter/my-data`
  - Trả hồ sơ voter + trạng thái theo từng election.
  - Gọi `ensureVoterElectionMappingsForVoter(...)` để tự bổ sung mapping thiếu.

- `GET /api/voter/get-wallet`
  - Trả ví liên kết và số token còn lại.

- `POST /api/voter/get-election-candidates`
  - Trả candidates active theo `electionId`.

- `POST /api/voter/cast-vote`
  - Check token + check chưa vote.
  - Check voter còn token.
  - Check candidate hợp lệ và active.
  - Tạo `transactionKey`, `signature`, `commitment`.
  - Transaction Firestore: ghi vote + trừ token + set voterElections=complete.

- `POST /api/voter/record-onchain-vote`
  - Ghi txHash on-chain như vote record off-chain.
  - Dùng khi luồng vote muốn ưu tiên bằng tx hash.

- `POST /api/voter/login` và `POST /api/voter/register`
  - Legacy endpoint, hiện trả `410` (đã tắt email/password voter).

## 5.3 Nhóm Admin

- `GET /api/admin/overview`
  - Trả toàn bộ elections + candidates cho trang quản trị.

- `POST/PUT/DELETE /api/admin/elections`
  - Tạo/sửa/xóa election.
  - Khi tạo mới, gọi `ensureVoterElectionForAllVotersForElection(...)`.

- `POST/PUT/DELETE /api/admin/candidates`
  - Tạo/sửa/xóa candidate.
  - Validate `electionId` tồn tại.

## 5.4 Nhóm Ethereum bridge và verify

- `GET /api/eth/advanced-election`
  - Trả địa chỉ + ABI + networkId contract deploy (đọc artifact).

- `GET /api/eth/voting-status?electionId=...`
  - Đọc phase election từ contract để biết có đang mở vote không.

- `GET /api/candidate-wallets`
  - Tổng hợp kết quả theo candidate.
  - Ưu tiên tally on-chain; fallback Firestore nếu RPC lỗi.

- `POST /api/validate-vote`
  - Xác minh vote theo `TransactionKey`.

---

## 6) Thư viện (`lib/`) và hàm tiêu biểu

- `lib/auth.ts`
  - `signToken(payload)`: ký token nội bộ kiểu JWT nhẹ.
  - `verifyToken(token)`: verify chữ ký + hạn token.

- `lib/firebaseAdmin.ts`
  - `getFirestore()`: init firebase-admin bằng service account env và trả Firestore client.

- `lib/firebaseClient.ts`
  - `getFirebaseApp()`, `getFirebaseAuth()`, `googleProvider()`: init Firebase phía client.

- `lib/firestoreRepo.ts`
  - `ensureSeedData()`: seed dữ liệu mẫu election/candidate nếu DB trống.
  - `getWalletForToken(...)`, `getWalletByVoterId(...)`: đọc ví.
  - `linkWalletToFirebaseUser(...)`: liên kết ví và enforce uniqueness.
  - `ensureVoterElectionForAllVotersForElection(...)`: backfill mapping khi có election mới.
  - `ensureVoterElectionMappingsForVoter(...)`: sửa thiếu mapping cho 1 voter.

- `lib/simpleElectionArtifact.ts`
  - `loadSimpleElectionDeployment()`: đọc artifact deploy (`ethereum/build/contracts/MultiElection.json`) và chọn network/address hợp lệ.

- `lib/crypto.ts`
  - `generateTransactionKey(...)`, `generateSignature(...)`: tạo metadata giao dịch.
  - `createCommitment(...)`, `verifyCommitment(...)`: hash commitment demo.

- `lib/walletGuard.ts`
  - Kiểm tra ví MetaMask hiện tại có khớp ví đã liên kết.
  - Có cơ chế auto-fix qua popup permission MetaMask.

- `lib/evmMetaMask.ts`
  - `ensureMetaMaskChainMatchesArtifact(...)`: ép MetaMask sang chain đúng theo artifact network id.

- `lib/api.ts`
  - Client helper gọi các route `/api/*` từ frontend.

---

## 7) Frontend theo vai trò

- `pages/index.tsx`: màn login (Google cho voter, email/password cho admin), enforce link wallet.
- `pages/dashboard.tsx`: trang chính voter, danh sách election + trạng thái on-chain.
- `pages/elections/[id].tsx`: chi tiết election + danh sách candidate + thao tác vote.
- `pages/admin/index.tsx`: dashboard admin (CRUD election/candidate, điều khiển on-chain, xem kết quả).
- `pages/validate.tsx`: giao diện validate transaction key.
- `pages/reveal.tsx`: trang legacy, chỉ thông báo flow reveal không còn dùng.
- `pages/_app.tsx`: bọc toàn app với Recoil + Toaster + AuthPersistor.

State management:
- `atoms/index.ts`: `authState`, `WalletState`, `CandidateWalletsState`.

---

## 8) Cách chạy dự án nhanh

Từ root:

```bash
npm install
npm --prefix ethereum install
npm run eth:compile
npm run eth:migrate
npm run dev
```

Lưu ý:
- Cần bật Ganache đúng RPC/port.
- Cần cấu hình `.env.local` cho Firebase + Ethereum env.
- Nếu Ganache reset thì migrate lại để có contract address mới.

---


## 9) Ghi chú kỹ thuật quan trọng

- Dự án hiện là **hybrid**: dữ liệu nghiệp vụ chủ yếu ở Firestore, còn phase/tally có thể lấy từ blockchain.
- Có dấu hiệu legacy commit-reveal (`AdvancedElection.sol`, `reveal.tsx`) nhưng luồng chính hiện là vote một bước.
- Bảo mật hiện tại dùng token tự ký trong `lib/auth.ts` (demo); production nên thay JWT chuẩn + secret/env management tốt hơn.
- Tất cả thao tác nhạy cảm admin đều dựa vào role trong token và route guard phía API.
