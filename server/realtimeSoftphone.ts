import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { randomUUID } from "crypto";

// Mirrors collection_software's server/realtimeSoftphone.ts (built for the
// opposite direction - DMP pushing screen-pop/parked-call events to its own
// collector browsers). This is the channel DMP's click-to-dial uses to
// reach a specific Chiamo user's live softphone tab: a plain HTTP call from
// DMP can trigger a server-side Twilio REST action (that's how parked-call
// pickup works), but placing a brand new outbound call requires the Twilio
// Voice SDK's device.connect(), which only runs inside that browser tab.
interface PendingToken {
  userId: string;
  tenantId: string;
  expiresAt: number;
}

const TOKEN_TTL_MS = 30_000;
const pendingTokens = new Map<string, PendingToken>();

// A user may have more than one tab/window open, so each userId maps to a
// set of live sockets rather than a single one.
const userSockets = new Map<string, Set<WebSocket>>();

export function mintRealtimeToken(userId: string, tenantId: string): string {
  const token = randomUUID();
  pendingTokens.set(token, { userId, tenantId, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

function consumeRealtimeToken(token: string): PendingToken | null {
  const entry = pendingTokens.get(token);
  if (!entry) return null;
  // One-time use: a token is only ever good for the single connection it
  // was minted for.
  pendingTokens.delete(token);
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}

export function initRealtimeSoftphone(httpServer: Server): void {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/softphone" });

  wss.on("connection", (ws: WebSocket, req) => {
    const url = new URL(req.url || "", "http://localhost");
    const token = url.searchParams.get("token") || "";
    const identity = consumeRealtimeToken(token);

    if (!identity) {
      ws.close(4001, "Invalid or expired token");
      return;
    }

    let sockets = userSockets.get(identity.userId);
    if (!sockets) {
      sockets = new Set();
      userSockets.set(identity.userId, sockets);
    }
    sockets.add(ws);

    ws.on("close", () => {
      const current = userSockets.get(identity.userId);
      if (!current) return;
      current.delete(ws);
      if (current.size === 0) {
        userSockets.delete(identity.userId);
      }
    });

    ws.on("error", () => {
      // The 'close' event still fires after 'error', so cleanup happens
      // above - this handler just stops an unhandled 'error' event from
      // crashing the process.
    });

    ws.send(JSON.stringify({ type: "connected" }));
  });

  // Tokens that were minted but never used to open a connection (the tab
  // was closed before the WebSocket connected, a network hiccup, etc.)
  // would otherwise sit in the map forever.
  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [token, entry] of Array.from(pendingTokens.entries())) {
      if (entry.expiresAt < now) {
        pendingTokens.delete(token);
      }
    }
  }, 60_000);
  sweepInterval.unref();
}

/** Returns true if at least one live connection for this user received the message. */
export function pushToUser(userId: string, message: unknown): boolean {
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) return false;

  const payload = JSON.stringify(message);
  let sent = false;
  for (const ws of Array.from(sockets)) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
      sent = true;
    }
  }
  return sent;
}
