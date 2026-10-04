import { useEffect, useRef, useState } from "react";
import "./App.css";

// Where your backend is running. Change this if you deploy the backend later.
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Quick-start questions shown as clickable chips
const SUGGESTIONS = [
  "Tell me about yourself",
  "What are your main skills?",
  "What projects have you built?",
  "What is your education?",
];

function App() {
  // Every chat bubble is an object: { role: "user" | "bot", text: "..." }
  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "Hi! I am an AI assistant that answers questions about this resume. Ask me anything about skills, projects, education or experience.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // An invisible element at the bottom of the chat, used for auto-scroll
  const bottomRef = useRef(null);

  // Scroll to the newest message whenever messages or loading state change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text) {
    const question = text.trim();
    if (!question || loading) return;

    // 1. Show the user's message immediately
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setLoading(true);

    try {
      // 2. Send the question to the backend
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);

      // 3. Show the answer
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "bot", text: data.answer }]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: "Sorry, I could not get an answer. Please check that the backend server is running.",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault(); // stops the page from reloading
    sendMessage(input);
  }

  return (
    <div className="page">
      <div className="chat">
        <header className="chat-header">
          <div className="avatar">AI</div>
          <div>
            <h1>Resume Assistant</h1>
            <p>Ask questions about this candidate</p>
          </div>
        </header>

        <div className="messages">
          {messages.map((m, i) => (
            <div key={i} className={`row ${m.role}`}>
              <div className={`bubble ${m.role} ${m.error ? "error" : ""}`}>
                {m.text}
              </div>
            </div>
          ))}

          {/* Typing indicator while waiting for the backend */}
          {loading && (
            <div className="row bot">
              <div className="bubble bot typing">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Suggestion chips only appear before the first question */}
        {messages.length === 1 && (
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => sendMessage(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        <form className="input-bar" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Type your question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;