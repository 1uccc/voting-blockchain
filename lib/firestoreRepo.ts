import { getFirestore } from "./firebaseAdmin";
import { db as seedDb } from "./db";

export type FireVoter = {
  id: string;
  name: string;
  email: string;
  emailLower: string;
  password: string;
  locationId: string;
  createdAt: string;
};

export type FireWallet = {
  voterId: string;
  emailLower: string;
  publicKey: string;
  publicKeyLower: string;
  tokens: number;
  createdAt: string;
};

export type FireVote = {
  voterId: string;
  electionId: string;
  candidateId: string;
  transactionKey: string;
  signature: string;
  commitment: string;
  timestamp: string;
};

export async function ensureSeedData() {
  const fs = getFirestore();
  const electionsSnap = await fs.collection("elections").limit(1).get();
  if (!electionsSnap.empty) return;

  const batch = fs.batch();

  for (const e of seedDb.elections) {
    batch.set(fs.collection("elections").doc(e._id), {
      ...e,
      seededAt: new Date().toISOString(),
    });
  }

  for (const c of seedDb.candidates) {
    batch.set(fs.collection("candidates").doc(c.id), {
      ...c,
      seededAt: new Date().toISOString(),
    });
  }

  await batch.commit();
}

export async function findVoterByEmailAndPassword(emailLower: string, password: string) {
  const fs = getFirestore();
  const snap = await fs
    .collection("voters")
    .where("emailLower", "==", emailLower)
    .where("password", "==", password)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data() as FireVoter;
}

export async function findVoterByEmail(emailLower: string) {
  const fs = getFirestore();
  const snap = await fs
    .collection("voters")
    .where("emailLower", "==", emailLower)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data() as FireVoter;
}

export async function findWalletByPublicKey(publicKeyLower: string) {
  const fs = getFirestore();
  const snap = await fs
    .collection("wallets")
    .where("publicKeyLower", "==", publicKeyLower)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data() as FireWallet;
}

export async function getWalletByVoterId(voterId: string) {
  const fs = getFirestore();
  const doc = await fs.collection("wallets").doc(voterId).get();
  return doc.exists ? (doc.data() as FireWallet) : null;
}

export async function getWalletForToken(params: { id: string; emailLower?: string }) {
  const fs = getFirestore();
  const byId = await fs.collection("wallets").doc(params.id).get();
  if (byId.exists) return byId.data() as FireWallet;
  if (!params.emailLower) return null;
  const snap = await fs
    .collection("wallets")
    .where("emailLower", "==", params.emailLower)
    .limit(1)
    .get();
  return snap.empty ? null : (snap.docs[0].data() as FireWallet);
}

export async function createVoterWithWallet(params: {
  name: string;
  emailLower: string;
  email: string;
  password: string;
  locationId: string;
  publicKey: string;
}) {
  const fs = getFirestore();
  const now = new Date().toISOString();

  // Create unique voterId based on timestamp; avoids contention with counters.
  const voterId = `voter-${Date.now().toString(36)}`;

  await fs.runTransaction(async (tx) => {
    const pkLower = params.publicKey.toLowerCase();
    // unique email
    const existingEmail = await tx.get(
      fs.collection("voters").where("emailLower", "==", params.emailLower).limit(1)
    );
    if (!existingEmail.empty) throw new Error("EMAIL_EXISTS");

    // unique wallet
    const existingWallet = await tx.get(
      fs.collection("wallets").where("publicKeyLower", "==", pkLower).limit(1)
    );
    if (!existingWallet.empty) throw new Error("WALLET_EXISTS");

    // voterElections for all elections (MUST be read before any writes)
    const elections = await tx.get(fs.collection("elections"));

    const voter: FireVoter = {
      id: voterId,
      name: params.name,
      email: params.email,
      emailLower: params.emailLower,
      password: params.password,
      locationId: params.locationId,
      createdAt: now,
    };

    const wallet: FireWallet = {
      voterId,
      emailLower: params.emailLower,
      publicKey: params.publicKey,
      publicKeyLower: pkLower,
      tokens: 2,
      createdAt: now,
    };

    tx.set(fs.collection("voters").doc(voterId), voter);
    tx.set(fs.collection("wallets").doc(voterId), wallet);

    elections.docs.forEach((eDoc) => {
      const electionId = eDoc.id;
      tx.set(fs.collection("voterElections").doc(`${voterId}_${electionId}`), {
        voterId,
        electionId,
        status: "incomplete",
        createdAt: now,
      });
    });
  });

  return voterId;
}

export async function linkWalletToFirebaseUser(params: {
  uid: string;
  emailLower: string;
  publicKey: string;
}) {
  const fs = getFirestore();
  const now = new Date().toISOString();
  const pkLower = params.publicKey.toLowerCase();
  const walletDocRef = fs.collection("wallets").doc(params.uid);

  await fs.runTransaction(async (tx) => {
    // Reads first
    const existingWalletByEmail = await tx.get(
      fs.collection("wallets").where("emailLower", "==", params.emailLower).limit(1)
    );
    if (!existingWalletByEmail.empty) {
      const doc = existingWalletByEmail.docs[0];
      if (doc.id !== params.uid) throw new Error("EMAIL_ALREADY_LINKED");
    }

    const existingWalletByPk = await tx.get(
      fs.collection("wallets").where("publicKeyLower", "==", pkLower).limit(1)
    );
    if (!existingWalletByPk.empty) {
      const doc = existingWalletByPk.docs[0];
      if (doc.id !== params.uid) throw new Error("WALLET_ALREADY_LINKED");
    }

    const existingWalletDoc = await tx.get(walletDocRef);

    const wallet: FireWallet = {
      voterId: params.uid,
      emailLower: params.emailLower,
      publicKey: params.publicKey,
      publicKeyLower: pkLower,
      tokens: existingWalletDoc.exists ? (existingWalletDoc.data() as any)?.tokens ?? 2 : 2,
      createdAt: existingWalletDoc.exists ? (existingWalletDoc.data() as any)?.createdAt ?? now : now,
    };

    tx.set(walletDocRef, wallet, { merge: true });
  });
}

/** Thêm voterElections cho mọi voter hiện có khi có cuộc bầu cử mới (admin tạo sau khi user đã đăng ký). */
export async function ensureVoterElectionForAllVotersForElection(electionId: string) {
  const fs = getFirestore();
  const now = new Date().toISOString();
  const votersSnap = await fs.collection("voters").get();
  let batch = fs.batch();
  let count = 0;
  for (const vDoc of votersSnap.docs) {
    const voterId = vDoc.id;
    const veRef = fs.collection("voterElections").doc(`${voterId}_${electionId}`);
    batch.set(
      veRef,
      { voterId, electionId, status: "incomplete", createdAt: now, updatedAt: now },
      { merge: true }
    );
    count++;
    if (count >= 450) {
      await batch.commit();
      batch = fs.batch();
      count = 0;
    }
  }
  if (count > 0) await batch.commit();
}

/** Bổ sung mapping thiếu cho một voter (cuộc bầu cử thêm sau khi đăng ký). */
export async function ensureVoterElectionMappingsForVoter(voterId: string) {
  const fs = getFirestore();
  const now = new Date().toISOString();
  const [electionsSnap, mappingsSnap] = await Promise.all([
    fs.collection("elections").get(),
    fs.collection("voterElections").where("voterId", "==", voterId).get(),
  ]);
  const mapped = new Set(mappingsSnap.docs.map((d) => (d.data() as any).electionId as string));
  let batch = fs.batch();
  let count = 0;
  for (const eDoc of electionsSnap.docs) {
    if (mapped.has(eDoc.id)) continue;
    const veRef = fs.collection("voterElections").doc(`${voterId}_${eDoc.id}`);
    batch.set(
      veRef,
      { voterId, electionId: eDoc.id, status: "incomplete", createdAt: now, updatedAt: now },
      { merge: true }
    );
    count++;
    if (count >= 450) {
      await batch.commit();
      batch = fs.batch();
      count = 0;
    }
  }
  if (count > 0) await batch.commit();
}

