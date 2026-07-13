import { Body, Controller, Post, Req, HttpException } from "@nestjs/common";
import { DbService } from "./db.service";
import { GoogleGenAI } from "@google/genai";
import * as crypto from "node:crypto";

const err = (code: number, msg: string) => new HttpException({ error: msg }, code);

@Controller("chatbot")
export class ChatbotController {
  private ai: GoogleGenAI;
  
  constructor(private db: DbService) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing Gemini API key. Set GEMINI_API_KEY or GOOGLE_API_KEY in the server environment.");
    }

    this.ai = new GoogleGenAI({ apiKey });
  }

  @Post("chat")
  async chat(@Req() req: any, @Body() body: any) {
    const { propertyId, message, sessionId: providedSession } = body;
    if (!propertyId || !message) throw err(400, "propertyId and message are required");
    
    // Check if property exists
    const { rows: [prop] } = await this.db.q("SELECT * FROM properties WHERE id = $1", [propertyId]);
    if (!prop) throw err(404, "Property not found");
    
    // Create or reuse session
    const sessionId = providedSession || crypto.randomBytes(12).toString("hex");
    
    // Save user message to DB
    await this.db.q("INSERT INTO chat_messages (session, who, text) VALUES ($1, $2, $3)", [sessionId, "user", message]);
    
    // Fetch previous chat history for this session (up to last 10 messages for context)
    const { rows: history } = await this.db.q(
      "SELECT who, text FROM chat_messages WHERE session = $1 ORDER BY id ASC LIMIT 20", 
      [sessionId]
    );

    // Build the prompt for Gemini
    const systemInstruction = `You are a helpful, professional real estate assistant for a property platform called Nestora.
You are currently helping a user who is looking at a specific property.
Property Details:
- Title: ${prop.title}
- Type: ${prop.type} (${prop.category})
- Location: ${prop.area}, ${prop.city}
- Price: ₹${prop.price_inr}
- Configuration: ${prop.beds} Beds, ${prop.baths} Baths, ${prop.sqft} sqft
- Furnishing: ${prop.furnishing}
- Description: ${prop.description}

Your goal is to:
1. Answer the user's questions about this specific property based ONLY on the details provided above.
2. If you don't know the answer based on the details, politely say you don't have that specific information but the owner/agent might.
3. Assess their interest. Ask relevant follow-up questions to understand their timeline and requirements.
4. ONLY talk about real estate. If the user asks about unrelated topics, politely redirect them to the property.
5. Keep your responses concise (2-3 sentences max).`;

    const rawContents = history.map(msg => ({
      role: msg.who === "user" ? "user" : "model",
      parts: [{ text: msg.text }]
    }));
    
    const contents = [];
    for (const msg of rawContents) {
      if (contents.length > 0 && contents[contents.length - 1].role === msg.role) {
        contents[contents.length - 1].parts[0].text += "\n" + msg.parts[0].text;
      } else {
        contents.push(msg);
      }
    }
    
    try {
      const response = await this.ai.models.generateContent({
        model: "gemma-4-31b-it",
        contents: contents,
        config: {
          systemInstruction,
          temperature: 0.3,
        }
      });
      
      const botReply = response.text || "I'm sorry, I couldn't process that.";
      
      // Save bot reply
      await this.db.q("INSERT INTO chat_messages (session, who, text) VALUES ($1, $2, $3)", [sessionId, "bot", botReply]);
      
      return { sessionId, reply: botReply };
    } catch (e) {
      console.error("Gemini API Error:", e);
      throw err(500, `Failed to get AI response: ${e.message}`);
    }
  }

  @Post("end")
  async endChat(@Req() req: any, @Body() body: any) {
    const { propertyId, sessionId, buyerEmail } = body;
    if (!propertyId || !sessionId || !buyerEmail) throw err(400, "propertyId, sessionId, and buyerEmail are required");

    // Get property details
    const { rows: [prop] } = await this.db.q("SELECT * FROM properties WHERE id = $1", [propertyId]);
    if (!prop) throw err(404, "Property not found");
    const sellerEmail = prop.posted_by;
    if (!sellerEmail) throw err(400, "Property has no seller assigned");

    // Fetch full chat history
    const { rows: history } = await this.db.q(
      "SELECT who, text FROM chat_messages WHERE session = $1 ORDER BY id ASC", 
      [sessionId]
    );
    
    if (history.length < 2) {
      throw err(400, "Not enough chat history to generate a lead");
    }

    const chatTranscript = history.map(h => `${h.who.toUpperCase()}: ${h.text}`).join("\n");

    const prompt = `Review the following chat transcript between a user and a real estate assistant regarding a property.
Property: ${prop.title} in ${prop.area}, ${prop.city} (Price: ₹${prop.price_inr})

Chat Transcript:
${chatTranscript}

Task:
1. Provide a brief 2-3 sentence summary of the user's interest and specific requirements based on the chat.
2. Provide a confidence rating from 1 to 10 on how likely this user is a serious buyer/tenant (1 = just browsing/uninterested, 10 = extremely serious and ready to act).

You must respond ONLY with a valid JSON object matching this schema:
{
  "summary": "The string summary here",
  "confidence": 8
}`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemma-4-31b-it",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      });
      
      const result = JSON.parse(response.text || "{}");
      if (!result.summary || typeof result.confidence !== "number") {
         throw new Error("Invalid Gemini JSON format");
      }
      
      const leadId = "lead-" + crypto.randomBytes(6).toString("hex");
      
      await this.db.q(
        "INSERT INTO leads (id, property_id, buyer_email, seller_email, chat_summary, confidence_rating) VALUES ($1, $2, $3, $4, $5, $6)",
        [leadId, propertyId, buyerEmail, sellerEmail, result.summary, result.confidence]
      );
      
      return { ok: true, leadId, summary: result.summary, confidence: result.confidence };
    } catch (e) {
      console.error("Gemini API Error (End Chat):", e);
      throw err(500, "Failed to analyze chat and generate lead");
    }
  }
}
