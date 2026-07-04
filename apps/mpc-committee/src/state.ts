import type { MpcIntent, SignedMatchBatch } from "@shade/mpc-crypto";

// In-memory state for the committee. In production each node would have its own
// persistent store; here all three nodes share this process but maintain
// separate per-node share maps so the isolation boundary is clear.

export type NodeShareEntry = {
  intentId: string;
  nodeId: string;
  encryptedShare: { ciphertext: string; nonce: string; senderPubkey: string };
  decryptedShare: { x: string; y: string } | null; // null until decrypted during matching
};

export type SessionState = {
  sessionId: string;
  startedAt: number;
  status: "open" | "matching" | "signed" | "failed";
  intents: Map<string, MpcIntent>;
  // nodeId -> intentId -> share
  shares: Map<string, Map<string, NodeShareEntry>>;
  signedBatch: SignedMatchBatch | null;
};

export class CommitteeState {
  private sessions = new Map<string, SessionState>();
  private intentToSession = new Map<string, string>();

  createSession(sessionId: string): SessionState {
    const s: SessionState = {
      sessionId,
      startedAt: Date.now(),
      status: "open",
      intents: new Map(),
      shares: new Map(),
      signedBatch: null
    };
    this.sessions.set(sessionId, s);
    return s;
  }

  getOrCreateOpenSession(): SessionState {
    for (const s of this.sessions.values()) {
      if (s.status === "open") return s;
    }
    const id = `session-${Date.now()}`;
    return this.createSession(id);
  }

  addIntent(intent: MpcIntent): string {
    const session = this.getOrCreateOpenSession();
    session.intents.set(intent.intentId, intent);
    this.intentToSession.set(intent.intentId, session.sessionId);

    // Store each encrypted share under the corresponding node's share map.
    for (const encShare of intent.encryptedShares) {
      if (!session.shares.has(encShare.nodeId)) {
        session.shares.set(encShare.nodeId, new Map());
      }
      session.shares.get(encShare.nodeId)!.set(intent.intentId, {
        intentId: intent.intentId,
        nodeId: encShare.nodeId,
        encryptedShare: { ciphertext: encShare.ciphertext, nonce: encShare.nonce, senderPubkey: encShare.senderPubkey },
        decryptedShare: null
      });
    }

    return session.sessionId;
  }

  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionForIntent(intentId: string): SessionState | undefined {
    const sid = this.intentToSession.get(intentId);
    return sid ? this.sessions.get(sid) : undefined;
  }

  getOpenSessions(): SessionState[] {
    return [...this.sessions.values()].filter(s => s.status === "open");
  }

  allSessions(): SessionState[] {
    return [...this.sessions.values()];
  }
}
