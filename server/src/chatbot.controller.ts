import { Body, Controller, Post, Req, HttpException } from "@nestjs/common";
import { DbService } from "./db.service";
import { GoogleGenAI } from "@google/genai";
import * as crypto from "node:crypto";

const err = (code: number, msg: string) => new HttpException({ error: msg }, code);

// Provider order: Groq (reliable free) -> Gemini (if key) -> rule-based (always
// works, no key). Any LLM failure falls through so the chatbot never breaks.
@Controller("chatbot")
export class ChatbotController {
  private ai: GoogleGenAI | null = null;

  constructor(private db: DbService) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (apiKey) this.ai = new GoogleGenAI({ apiKey });
  }

  // ---------- Providers ----------
  private async generateGemini(params: any, tries = 3): Promise<string> {
    for (let i = 0; i < tries; i++) {
      try {
        const r = await this.ai!.models.generateContent(params);
        return r.text || "";
      } catch (e: any) {
        if ((e?.status ?? e?.code) === 503 && i < tries - 1) {
          await new Promise(r => setTimeout(r, 600 * (i + 1)));
          continue;
        }
        throw e;
      }
    }
    return "";
  }

  // Groq: OpenAI-compatible chat completions. Free key at console.groq.com.
  private async groqChat(messages: any[], json = false): Promise<string> {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: json ? 0.1 : 0.3,
        max_tokens: 500,
        ...(json ? { response_format: { type: "json_object" } } : {})
      })
    });
    if (!resp.ok) throw new Error("Groq " + resp.status);
    const d: any = await resp.json();
    return d.choices?.[0]?.message?.content || "";
  }

  // ---------- Rule-based fallback (no API key) ----------
  private fmtPrice(prop: any): string {
    const v = Number(prop.price_inr);
    const rent = prop.type === "rent";
    if (rent) return `₹${v.toLocaleString("en-IN")}/month`;
    if (v >= 1e7) return `₹${(v / 1e7).toFixed(2).replace(/\.00$/, "")} Cr`;
    if (v >= 1e5) return `₹${(v / 1e5).toFixed(2).replace(/\.00$/, "")} L`;
    return `₹${v.toLocaleString("en-IN")}`;
  }

  private ruleReply(prop: any, message: string): string {
    const t = (message || "").toLowerCase();
    const has = (...w: string[]) => w.some(x => t.includes(x));
    const desc = (prop.description || "").toLowerCase();
    const name = `${prop.title} in ${prop.area}, ${prop.city}`;

    if (has("hi", "hello", "hey")) return `Hi! I can help with details on ${name}. Ask me about the price, size, location, furnishing or availability, or book a visit.`;
    if (has("price", "cost", "rate", "how much", "budget", "emi")) return `${prop.title} is priced at ${this.fmtPrice(prop)} (${prop.type === "rent" ? "monthly rent" : "for sale"}). You can discuss terms with the owner during a visit.`;
    if (has("bedroom", "bhk", "how many bed", "beds", "room")) return `It's a ${prop.beds} BHK with ${prop.baths} bathroom${prop.baths > 1 ? "s" : ""} and a built-up area of ${prop.sqft} sqft.`;
    if (has("bath", "washroom", "toilet")) return `This home has ${prop.baths} bathroom${prop.baths > 1 ? "s" : ""}.`;
    if (has("size", "sqft", "square", "area of", "how big", "carpet")) return `The built-up area is ${prop.sqft} sqft, configured as ${prop.beds} BHK.`;
    if (has("where", "location", "address", "locality", "which area", "pin")) return `It's located in ${prop.area}, ${prop.city} (pincode ${prop.pincode}).`;
    if (has("furnish")) { const f = prop.furnishing === "semi" ? "semi-furnished" : prop.furnishing || "unfurnished"; return `This property is ${f}.`; }
    if (has("parking", "car")) return desc.includes("parking") ? `Yes, parking is available — the listing mentions covered/reserved parking.` : `The listing doesn't specify parking; please confirm with the owner during your visit.`;
    if (has("available", "availability", "still there", "sold", "taken")) return `Yes, ${prop.title} is currently listed and available. You can schedule a visit to see it in person.`;
    if (has("visit", "book", "schedule", "see it", "viewing", "appointment")) return `You can book a site visit right from this page — tap "Schedule a visit" and pick a date. It's free and the owner will confirm your slot.`;
    if (has("pet", "dog", "cat")) return desc.includes("pet") ? `The listing mentions pets are welcome.` : `Pet policy isn't listed; the owner can confirm this for you.`;
    if (has("amenit", "gym", "pool", "clubhouse", "security", "lift", "power")) {
      const hits = ["gym", "pool", "clubhouse", "security", "lift", "power backup", "play", "garden"].filter(a => desc.includes(a));
      return hits.length ? `The listing mentions: ${hits.join(", ")}.` : `Amenities aren't fully listed here — "${prop.description}". The owner can share more.`;
    }
    if (has("negotiat", "discount", "lower", "offer")) return `Pricing is set by the owner. You can discuss any negotiation directly during your visit.`;
    if (has("loan", "mortgage", "finance")) return `You can estimate your monthly EMI using the mortgage calculator on this property page.`;
    if (has("description", "tell me", "about", "detail")) return `${prop.title}: ${prop.description}`;
    // default
    return `Here's a quick summary — ${prop.title}, a ${prop.beds} BHK (${prop.sqft} sqft) in ${prop.area}, ${prop.city}, priced at ${this.fmtPrice(prop)}. Ask me about price, size, location, furnishing, amenities or availability, or book a visit.`;
  }

  // Heuristic lead scoring when no LLM is available.
  private ruleLead(history: any[], prop: any): { summary: string; confidence: number } {
    const userMsgs = history.filter(h => h.who === "user");
    const text = userMsgs.map(m => m.text.toLowerCase()).join(" ");
    let score = 2 + Math.min(userMsgs.length, 4); // engagement
    const intent = ["interested", "buy", "rent", "visit", "book", "budget", "move", "loan", "when can", "available", "contact", "call", "price"];
    score += intent.filter(k => text.includes(k)).length;
    const confidence = Math.max(1, Math.min(10, score));
    const asked = ["price", "location", "size", "furnish", "parking", "visit"].filter(k => text.includes(k));
    const summary = `Buyer exchanged ${userMsgs.length} message${userMsgs.length === 1 ? "" : "s"} about ${prop.title} (${prop.area}, ${prop.city})` +
      (asked.length ? `, asking about ${asked.join(", ")}.` : ".") +
      (text.match(/visit|book|interested|buy|move/) ? " Showed buying intent." : " Appeared to be exploring.");
    return { summary, confidence };
  }

  // ---------- Endpoints ----------
  @Post("chat")
  async chat(@Req() req: any, @Body() body: any) {
    const { propertyId, message, sessionId: providedSession } = body;
    if (!propertyId || !message) throw err(400, "propertyId and message are required");

    const { rows: [prop] } = await this.db.q("SELECT * FROM properties WHERE id = $1", [propertyId]);
    if (!prop) throw err(404, "Property not found");

    const sessionId = providedSession || crypto.randomBytes(12).toString("hex");
    await this.db.q("INSERT INTO chat_messages (session, who, text) VALUES ($1, $2, $3)", [sessionId, "user", message]);
    const { rows: history } = await this.db.q(
      "SELECT who, text FROM chat_messages WHERE session = $1 ORDER BY id ASC LIMIT 20", [sessionId]);

    const systemInstruction = `You are a helpful, professional real estate assistant for a property platform called Nestora.
You are helping a user looking at a specific property.
Property Details:
- Title: ${prop.title}
- Type: ${prop.type} (${prop.category})
- Location: ${prop.area}, ${prop.city}
- Price: ₹${prop.price_inr}
- Configuration: ${prop.beds} Beds, ${prop.baths} Baths, ${prop.sqft} sqft
- Furnishing: ${prop.furnishing}
- Description: ${prop.description}
Rules: Answer ONLY from the details above. If unknown, say the owner/agent can confirm. Only discuss real estate. Keep replies to 2-3 sentences.`;

    let reply = "";

    // 1) Groq
    if (!reply && process.env.GROQ_API_KEY) {
      try {
        const msgs = [{ role: "system", content: systemInstruction },
          ...history.map(h => ({ role: h.who === "user" ? "user" : "assistant", content: h.text }))];
        reply = (await this.groqChat(msgs)).trim();
      } catch (e) { console.warn("Groq failed, trying next:", (e as any).message); }
    }

    // 2) Gemini
    if (!reply && this.ai) {
      try {
        const merged: any[] = [];
        for (const h of history) {
          const role = h.who === "user" ? "user" : "model";
          if (merged.length && merged[merged.length - 1].role === role) merged[merged.length - 1].parts[0].text += "\n" + h.text;
          else merged.push({ role, parts: [{ text: h.text }] });
        }
        reply = (await this.generateGemini({ model: "gemini-flash-latest", contents: merged, config: { systemInstruction, temperature: 0.3 } })).trim();
      } catch (e) { console.warn("Gemini failed, using rules:", (e as any).message); }
    }

    // 3) Rule-based (always works)
    if (!reply) reply = this.ruleReply(prop, message);

    await this.db.q("INSERT INTO chat_messages (session, who, text) VALUES ($1, $2, $3)", [sessionId, "bot", reply]);
    return { sessionId, reply };
  }

  @Post("end")
  async endChat(@Req() req: any, @Body() body: any) {
    const { propertyId, sessionId, buyerEmail } = body;
    if (!propertyId || !sessionId || !buyerEmail) throw err(400, "propertyId, sessionId, and buyerEmail are required");

    const { rows: [prop] } = await this.db.q("SELECT * FROM properties WHERE id = $1", [propertyId]);
    if (!prop) throw err(404, "Property not found");
    const sellerEmail = prop.posted_by;
    if (!sellerEmail) throw err(400, "Property has no seller assigned");

    const { rows: history } = await this.db.q(
      "SELECT who, text FROM chat_messages WHERE session = $1 ORDER BY id ASC", [sessionId]);
    if (history.length < 2) throw err(400, "Not enough chat history to generate a lead");

    const transcript = history.map(h => `${h.who.toUpperCase()}: ${h.text}`).join("\n");
    const prompt = `Review this chat between a user and a real estate assistant about a property.
Property: ${prop.title} in ${prop.area}, ${prop.city} (Price: ₹${prop.price_inr})
Transcript:
${transcript}
Respond ONLY with valid JSON: {"summary": "2-3 sentence summary of the user's interest and requirements", "confidence": <1-10 integer of how serious a buyer they are>}`;

    let result: { summary: string; confidence: number } | null = null;

    if (process.env.GROQ_API_KEY) {
      try {
        const out = await this.groqChat([{ role: "user", content: prompt }], true);
        const p = JSON.parse(out);
        if (p.summary && typeof p.confidence === "number") result = p;
      } catch (e) { console.warn("Groq lead failed:", (e as any).message); }
    }
    if (!result && this.ai) {
      try {
        const out = await this.generateGemini({ model: "gemini-flash-latest", contents: prompt, config: { responseMimeType: "application/json", temperature: 0.1 } });
        const p = JSON.parse(out || "{}");
        if (p.summary && typeof p.confidence === "number") result = p;
      } catch (e) { console.warn("Gemini lead failed:", (e as any).message); }
    }
    if (!result) result = this.ruleLead(history, prop);

    const leadId = "lead-" + crypto.randomBytes(6).toString("hex");
    await this.db.q(
      "INSERT INTO leads (id, property_id, buyer_email, seller_email, chat_summary, confidence_rating) VALUES ($1, $2, $3, $4, $5, $6)",
      [leadId, propertyId, buyerEmail, sellerEmail, result.summary, result.confidence]);

    return { ok: true, leadId, summary: result.summary, confidence: result.confidence };
  }
}
