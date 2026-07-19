// Google Calendar integration. A seller connects their Google account once
// (OAuth, calendar.events scope, offline access); we store their refresh token
// and, when a buyer books a visit, insert the event into the seller's calendar.
//
// SETUP (Google Cloud Console, same project as SSO):
//  1. Enable the "Google Calendar API".
//  2. OAuth consent screen → add scope: .../auth/calendar.events
//  3. OAuth client → Authorized redirect URI: <PUBLIC_URL>/api/calendar/callback
//  Uses the existing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
import { Injectable, OnModuleInit } from "@nestjs/common";
import * as crypto from "node:crypto";
import { DbService } from "./db.service";

const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:4173";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const REDIRECT = PUBLIC_URL + "/api/calendar/callback";

@Injectable()
export class CalendarService implements OnModuleInit {
  constructor(private db: DbService) {}

  // Short-lived state nonces (nonce -> {email, ts}); OAuth round-trips in seconds.
  private states = new Map<string, { email: string; ts: number }>();

  async onModuleInit() {
    await this.db.q(`CREATE TABLE IF NOT EXISTS calendar_tokens (
      email TEXT PRIMARY KEY, refresh_token TEXT, connected_at TIMESTAMPTZ DEFAULT now()
    )`);
  }

  get configured() {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }

  async isConnected(email: string): Promise<boolean> {
    const { rows } = await this.db.q("SELECT 1 FROM calendar_tokens WHERE email = $1", [email]);
    return rows.length > 0;
  }

  // Build the Google consent URL for a specific seller.
  buildConnectUrl(email: string): string {
    const nonce = crypto.randomBytes(16).toString("hex");
    this.states.set(nonce, { email, ts: Date.now() });
    // drop entries older than 10 min
    for (const [k, v] of this.states) if (Date.now() - v.ts > 6e5) this.states.delete(k);
    return "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: REDIRECT,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: SCOPE,
      state: nonce
    });
  }

  // Exchange the callback code and persist the seller's refresh token.
  async handleCallback(code: string, state: string): Promise<boolean> {
    const entry = this.states.get(state);
    if (!entry) return false;
    this.states.delete(state);
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: REDIRECT,
        grant_type: "authorization_code"
      })
    });
    if (!resp.ok) return false;
    const tok: any = await resp.json();
    if (!tok.refresh_token) return false; // needs prompt=consent to get one
    await this.db.q(
      `INSERT INTO calendar_tokens (email, refresh_token) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET refresh_token = $2, connected_at = now()`,
      [entry.email, tok.refresh_token]);
    return true;
  }

  private async accessToken(refreshToken: string): Promise<string | null> {
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    });
    if (!resp.ok) return null;
    return (await resp.json() as any).access_token || null;
  }

  // Create a visit event on the seller's calendar. Returns true on success.
  // Non-throwing: booking should never fail because of a calendar hiccup.
  async createSellerEvent(sellerEmail: string, ev: {
    summary: string; description: string; startISO: string; endISO: string; buyerEmail?: string;
  }): Promise<boolean> {
    try {
      const { rows: [t] } = await this.db.q("SELECT refresh_token FROM calendar_tokens WHERE email = $1", [sellerEmail]);
      if (!t) return false;
      const token = await this.accessToken(t.refresh_token);
      if (!token) return false;
      const resp = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: ev.summary,
          description: ev.description,
          start: { dateTime: ev.startISO, timeZone: "Asia/Kolkata" },
          end: { dateTime: ev.endISO, timeZone: "Asia/Kolkata" },
          attendees: ev.buyerEmail ? [{ email: ev.buyerEmail }] : [],
          reminders: { useDefault: true }
        })
      });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
