import { useState, useRef, useEffect } from "react";
import { api } from "../api";
import { useApp } from "../store";

export default function Chatbot({ property, open, setOpen }) {
  const { user, toast } = useApp();
  const [messages, setMessages] = useState([
    { who: "bot", text: `Hi! I'm your Nestora assistant. What would you like to know about ${property.title}?` }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [ended, setEnded] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading || ended) return;
    
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { who: "user", text: userMsg }]);
    setLoading(true);

    try {
      const res = await api.post("/chatbot/chat", {
        propertyId: property.id,
        message: userMsg,
        sessionId
      });
      setSessionId(res.sessionId);
      setMessages(prev => [...prev, { who: "bot", text: res.reply }]);
    } catch (err) {
      toast(err.message || "Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  const submitInterest = async () => {
    if (!user) {
      toast("Please log in to submit your interest.");
      return;
    }
    if (!sessionId) {
      toast("Please chat with the assistant first.");
      return;
    }
    
    setLoading(true);
    try {
      await api.post("/chatbot/end", {
        propertyId: property.id,
        sessionId,
        buyerEmail: user.email
      });
      setEnded(true);
      toast("Your interest has been submitted to the seller/agent!");
      setMessages(prev => [...prev, { who: "bot", text: "I've notified the owner. They will reach out to you if interested!" }]);
    } catch (err) {
      toast(err.message || "Failed to submit interest");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button 
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 rounded-full bg-emerald-600 p-4 text-white shadow-xl hover:bg-emerald-700 transition-colors"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[500px] w-[350px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
      <div className="flex items-center justify-between bg-emerald-600 px-4 py-3 text-white">
        <h3 className="font-bold">Nestora Assistant</h3>
        <button onClick={() => setOpen(false)} className="text-emerald-100 hover:text-white">×</button>
      </div>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.who === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${m.who === "user" ? "bg-emerald-600 text-white rounded-br-none" : "bg-white ring-1 ring-slate-200 text-slate-800 rounded-bl-none"}`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && !ended && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-none bg-white px-4 py-2 ring-1 ring-slate-200">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"></span>
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "0.2s" }}></span>
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "0.4s" }}></span>
              </span>
            </div>
          </div>
        )}
      </div>
      
      {!ended && (
        <div className="border-t border-slate-200 bg-white p-3">
          <form onSubmit={send} className="flex gap-2">
            <input 
              type="text" 
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about this property..."
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={loading}
            />
            <button 
              type="submit" 
              disabled={loading || !input.trim()}
              className="rounded-xl bg-emerald-600 px-3 py-2 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Send
            </button>
          </form>
          {messages.length > 2 && (
            <button 
              onClick={submitInterest}
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-slate-900 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Submit Interest to Seller
            </button>
          )}
        </div>
      )}
    </div>
  );
}
