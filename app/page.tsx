"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type View = "today" | "practice" | "progress";
type Skill = "Vocabulary" | "Listening" | "Grammar" | "Speaking" | "Conversation";

type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => RecognitionLike;
    SpeechRecognition?: new () => RecognitionLike;
  }
}

const lessonSteps: Array<{ skill: Skill; minutes: number; description: string; tone: string }> = [
  { skill: "Vocabulary", minutes: 3, description: "8 useful café words", tone: "mint" },
  { skill: "Listening", minutes: 3, description: "A breakfast order", tone: "blue" },
  { skill: "Grammar", minutes: 3, description: "Could I have…?", tone: "peach" },
  { skill: "Speaking", minutes: 4, description: "Order your breakfast", tone: "yellow" },
  { skill: "Conversation", minutes: 5, description: "Roleplay with Maya", tone: "violet" },
];

const vocabulary = [
  { word: "recommend", meaning: "merekomendasikan", example: "What do you recommend?" },
  { word: "on the side", meaning: "disajikan terpisah", example: "Could I get the sauce on the side?" },
  { word: "still water", meaning: "air mineral tanpa soda", example: "Still water, please." },
  { word: "bill", meaning: "tagihan", example: "Could we have the bill?" },
];

const defaultReplies = [
  "Great start! Would you like anything to drink with that?",
  "Nice choice. Would you like the sauce on the side?",
  "Of course. Is there anything else I can get for you?",
];

function scoreSentence(value: string) {
  const clean = value.trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();
  const polite = /could i|can i|i would like|i'd like|please/.test(lower);
  const complete = clean.split(/\s+/).length >= 5;
  return {
    score: Math.min(96, 64 + (polite ? 18 : 0) + (complete ? 12 : 0)),
    corrected: clean.replace(/^i want\b/i, "I'd like"),
    note: polite
      ? "Good! Your request sounds polite and natural."
      : "Try opening with “Could I have…” or “I’d like…” to sound more natural.",
  };
}

export default function Home() {
  const [view, setView] = useState<View>("today");
  const [activeSkill, setActiveSkill] = useState<Skill>("Speaking");
  const [completed, setCompleted] = useState<string[]>([]);
  const [revealedWord, setRevealedWord] = useState(0);
  const [listeningAnswer, setListeningAnswer] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [feedback, setFeedback] = useState<ReturnType<typeof scoreSentence>>(null);
  const [messages, setMessages] = useState([
    { from: "tutor", text: "Good morning! Welcome to Sunny Side Café. What can I get for you?" },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [placementOpen, setPlacementOpen] = useState(false);
  const [placementStep, setPlacementStep] = useState(0);
  const [placementScore, setPlacementScore] = useState(0);
  const [placementResult, setPlacementResult] = useState<string | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("lancar-progress");
    if (saved) {
      try {
        setCompleted(JSON.parse(saved));
      } catch {
        setCompleted([]);
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("lancar-progress", JSON.stringify(completed));
  }, [completed]);

  const progress = Math.round((completed.length / lessonSteps.length) * 100);
  const xp = 320 + completed.length * 35;

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 11) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  function markComplete(skill: Skill) {
    setCompleted((current) => (current.includes(skill) ? current : [...current, skill]));
  }

  function speak(text: string, rate = 0.92) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
  }

  function startRecognition(target: "practice" | "chat") {
    const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) {
      setTranscript("Speech recognition is not available here. Type your answer instead.");
      return;
    }
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      return;
    }
    const recognition = new Constructor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const spoken = event.results[0]?.[0]?.transcript ?? "";
      if (target === "practice") {
        setTranscript(spoken);
        setFeedback(scoreSentence(spoken));
      } else {
        setChatInput(spoken);
      }
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }

  function sendMessage() {
    const value = chatInput.trim();
    if (!value) return;
    const turn = messages.filter((message) => message.from === "user").length;
    setMessages((current) => [
      ...current,
      { from: "user", text: value },
      { from: "tutor", text: defaultReplies[turn % defaultReplies.length] },
    ]);
    setChatInput("");
    if (turn >= 2) markComplete("Conversation");
  }

  const placementQuestions = [
    {
      question: "Choose the correct sentence.",
      options: ["She go to work every day.", "She goes to work every day.", "She going to work every day."],
      answer: 1,
    },
    {
      question: "You didn't hear someone. What do you say?",
      options: ["Repeat!", "Could you say that again, please?", "You speak again."],
      answer: 1,
    },
    {
      question: "Complete: I have lived here ___ 2022.",
      options: ["for", "since", "during"],
      answer: 1,
    },
  ];

  function answerPlacement(index: number) {
    const nextScore = placementScore + (index === placementQuestions[placementStep].answer ? 1 : 0);
    setPlacementScore(nextScore);
    if (placementStep === placementQuestions.length - 1) {
      setPlacementResult(nextScore === 3 ? "B1 — Intermediate" : nextScore === 2 ? "A2 — Elementary" : "A1 — Beginner");
    } else {
      setPlacementStep((step) => step + 1);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("today")} aria-label="Go to today">
          <span className="brand-mark">L</span>
          <span>Lancar<span className="brand-dot">.</span></span>
        </button>

        <nav className="main-nav" aria-label="Main navigation">
          <button className={view === "today" ? "active" : ""} onClick={() => setView("today")}>
            <span>⌂</span> Today
          </button>
          <button className={view === "practice" ? "active" : ""} onClick={() => setView("practice")}>
            <span>◎</span> Practice
          </button>
          <button className={view === "progress" ? "active" : ""} onClick={() => setView("progress")}>
            <span>↗</span> Progress
          </button>
        </nav>

        <div className="sidebar-divider" />
        <p className="nav-label">Your skills</p>
        <div className="skill-nav">
          {lessonSteps.map((item) => (
            <button
              key={item.skill}
              onClick={() => { setActiveSkill(item.skill); setView("practice"); }}
            >
              <span className={`skill-dot ${item.tone}`} />
              {item.skill}
              {completed.includes(item.skill) && <span className="nav-check">✓</span>}
            </button>
          ))}
        </div>

        <div className="sidebar-profile">
          <div className="avatar">AR</div>
          <div><strong>Ardi Rahman</strong><span>A2 learner</span></div>
          <button aria-label="Profile options">•••</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">L</span>Lancar.</div>
          <div className="day-chip">Day 04 <span>of 30</span></div>
          <div className="top-actions">
            <span className="streak">🔥 6 day streak</span>
            <button className="icon-button" aria-label="Notifications">◦</button>
          </div>
        </header>

        {view === "today" && (
          <div className="content-grid">
            <div className="primary-column">
              <section className="hero-card">
                <div>
                  <span className="eyebrow">TODAY'S FOCUS · REAL LIFE ENGLISH</span>
                  <h1>{greeting}, Ardi.<br />Let’s order breakfast <em>without freezing.</em></h1>
                  <p>By the end of today, you’ll be able to order naturally, ask for changes, and understand the server’s reply.</p>
                  <div className="hero-actions">
                    <button className="primary-button" onClick={() => { setActiveSkill("Vocabulary"); setView("practice"); }}>
                      Start today’s lesson <span>→</span>
                    </button>
                    <span>15 min · 5 activities</span>
                  </div>
                </div>
                <div className="speech-orbit" aria-hidden="true">
                  <div className="orbit-ring ring-one" />
                  <div className="orbit-ring ring-two" />
                  <div className="bubble bubble-one">Could I have…</div>
                  <div className="bubble bubble-two">on the side?</div>
                  <div className="sound-core"><span>▮▮▮</span></div>
                </div>
              </section>

              <section className="section-block">
                <div className="section-heading">
                  <div><span className="eyebrow">YOUR DAILY PATH</span><h2>Five small wins</h2></div>
                  <span className="completion-copy">{completed.length} of 5 complete</span>
                </div>
                <div className="lesson-list">
                  {lessonSteps.map((item, index) => {
                    const done = completed.includes(item.skill);
                    return (
                      <button
                        className={`lesson-row ${done ? "done" : ""}`}
                        key={item.skill}
                        onClick={() => { setActiveSkill(item.skill); setView("practice"); }}
                      >
                        <span className={`step-number ${item.tone}`}>{done ? "✓" : String(index + 1).padStart(2, "0")}</span>
                        <span className="lesson-copy"><strong>{item.skill}</strong><small>{item.description}</small></span>
                        <span className="lesson-time">{item.minutes} min</span>
                        <span className="row-arrow">→</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <aside className="right-column">
              <section className="progress-card">
                <div className="progress-top"><span className="eyebrow">30-DAY CHALLENGE</span><strong>{progress}%</strong></div>
                <div className="progress-track"><span style={{ width: `${Math.max(13, progress)}%` }} /></div>
                <div className="week-row">
                  {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
                    <div key={`${day}-${index}`} className={index < 4 ? "day-done" : ""}><span>{index < 4 ? "✓" : index + 1}</span><small>{day}</small></div>
                  ))}
                </div>
                <p>You’re building a real habit. Come back tomorrow to keep your streak alive.</p>
              </section>

              <section className="coach-card">
                <div className="coach-head"><div className="coach-avatar">M</div><div><span>Your AI coach</span><strong>Maya</strong></div><span className="online-dot" /></div>
                <blockquote>“You’re getting better at polite requests. Today, focus on slowing down before the key phrase.”</blockquote>
                <button onClick={() => { setActiveSkill("Conversation"); setView("practice"); }}>Practice with Maya <span>→</span></button>
              </section>

              <button className="placement-card" onClick={() => setPlacementOpen(true)}>
                <span className="placement-icon">A2</span>
                <span><strong>Not sure about your level?</strong><small>Take a 2-minute placement check</small></span>
                <span>→</span>
              </button>
            </aside>
          </div>
        )}

        {view === "practice" && (
          <div className="practice-layout">
            <div className="practice-heading">
              <div><span className="eyebrow">DAY 04 · ORDERING BREAKFAST</span><h1>{activeSkill}</h1></div>
              <div className="skill-tabs">
                {lessonSteps.map((item) => <button key={item.skill} className={activeSkill === item.skill ? "active" : ""} onClick={() => setActiveSkill(item.skill)}>{item.skill}</button>)}
              </div>
            </div>

            {activeSkill === "Vocabulary" && (
              <section className="activity-card vocab-card">
                <div className="activity-kicker">CARD {revealedWord + 1} OF {vocabulary.length}</div>
                <h2>{vocabulary[revealedWord].word}</h2>
                <button className="listen-pill" onClick={() => speak(vocabulary[revealedWord].word)}>▶ Hear it</button>
                <div className="word-meaning"><span>Meaning</span><strong>{vocabulary[revealedWord].meaning}</strong></div>
                <p className="example-sentence">“{vocabulary[revealedWord].example}”</p>
                <div className="card-actions">
                  <button onClick={() => setRevealedWord((current) => (current + 1) % vocabulary.length)}>Review again</button>
                  <button className="primary-button" onClick={() => { if (revealedWord === vocabulary.length - 1) markComplete("Vocabulary"); setRevealedWord((current) => (current + 1) % vocabulary.length); }}>Got it <span>→</span></button>
                </div>
              </section>
            )}

            {activeSkill === "Listening" && (
              <section className="activity-card listening-card">
                <span className="activity-kicker">LISTEN FOR THE MAIN IDEA</span>
                <div className="audio-visual"><button onClick={() => speak("Good morning. Could I have the avocado toast, please? And could I get the sauce on the side?", 0.88)}>▶</button><div className="waveform">▂▅▃▇▅▂▆▃▇▅▃▆▂▅▇▃</div><span>0:08</span></div>
                <h2>What did the customer ask for?</h2>
                <div className="answer-grid">
                  {["Avocado toast with no sauce", "Avocado toast with sauce on the side", "Toast and a side salad"].map((answer, index) => (
                    <button key={answer} className={listeningAnswer === answer ? (index === 1 ? "correct" : "wrong") : ""} onClick={() => setListeningAnswer(answer)}><span>{String.fromCharCode(65 + index)}</span>{answer}</button>
                  ))}
                </div>
                {listeningAnswer && <div className={`answer-note ${listeningAnswer.includes("on the side") ? "success" : "try"}`}>{listeningAnswer.includes("on the side") ? "Exactly. You caught the key request." : "Listen once more for the phrase “on the side”."}</div>}
                <button className="primary-button wide" onClick={() => { markComplete("Listening"); setActiveSkill("Grammar"); }}>Continue <span>→</span></button>
              </section>
            )}

            {activeSkill === "Grammar" && (
              <section className="activity-card grammar-card">
                <span className="activity-kicker">A PATTERN YOU CAN USE TODAY</span>
                <h2>Could I have + <em>thing</em> + please?</h2>
                <p>Use this pattern to make a polite request. No grammar formula to memorize—just swap the thing you need.</p>
                <div className="pattern-examples">
                  <button onClick={() => speak("Could I have a cappuccino, please?")}><span>01</span>Could I have a cappuccino, please?<b>▶</b></button>
                  <button onClick={() => speak("Could I have the bill, please?")}><span>02</span>Could I have the bill, please?<b>▶</b></button>
                  <button onClick={() => speak("Could I have some water, please?")}><span>03</span>Could I have some water, please?<b>▶</b></button>
                </div>
                <button className="primary-button wide" onClick={() => { markComplete("Grammar"); setActiveSkill("Speaking"); }}>Try it out loud <span>→</span></button>
              </section>
            )}

            {activeSkill === "Speaking" && (
              <section className="activity-card speaking-card">
                <div className="speaking-prompt"><span className="activity-kicker">YOUR TURN</span><h2>Order an omelette and ask for the cheese on the side.</h2><button onClick={() => speak("Could I have an omelette, with the cheese on the side, please?")}>▶ Hear an example</button></div>
                <div className={`mic-zone ${isListening ? "recording" : ""}`}>
                  <button className="mic-button" onClick={() => startRecognition("practice")} aria-label={isListening ? "Stop recording" : "Start recording"}>{isListening ? "■" : "●"}</button>
                  <strong>{isListening ? "Listening…" : "Tap and speak"}</strong>
                  <span>or type your answer below</span>
                </div>
                <textarea value={transcript} onChange={(event) => { setTranscript(event.target.value); setFeedback(null); }} placeholder="Could I have…" aria-label="Your spoken or typed answer" />
                <button className="primary-button wide" onClick={() => { setFeedback(scoreSentence(transcript)); if (transcript.trim()) markComplete("Speaking"); }}>Check my answer <span>→</span></button>
                {feedback && (
                  <div className="feedback-box">
                    <div className="score-ring">{feedback.score}<small>/100</small></div>
                    <div><span>MORE NATURAL</span><strong>{feedback.corrected}</strong><p>{feedback.note}</p></div>
                  </div>
                )}
              </section>
            )}

            {activeSkill === "Conversation" && (
              <section className="activity-card conversation-card">
                <div className="conversation-top"><div className="coach-avatar">M</div><div><span>ROLEPLAY · SUNNY SIDE CAFÉ</span><strong>Maya is your server</strong></div><span className="live-label">LIVE PRACTICE</span></div>
                <div className="chat-window">
                  {messages.map((message, index) => (
                    <div key={`${message.from}-${index}`} className={`message ${message.from}`}><span>{message.text}</span>{message.from === "tutor" && <button onClick={() => speak(message.text)}>▶</button>}</div>
                  ))}
                </div>
                <div className="chat-composer">
                  <button className={isListening ? "active" : ""} onClick={() => startRecognition("chat")} aria-label="Speak your reply">●</button>
                  <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") sendMessage(); }} placeholder="Reply in English…" />
                  <button onClick={sendMessage} aria-label="Send reply">→</button>
                </div>
                <div className="conversation-hint">Try: “Could I have the avocado toast, please?”</div>
              </section>
            )}
          </div>
        )}

        {view === "progress" && (
          <div className="progress-page">
            <div className="practice-heading"><div><span className="eyebrow">YOUR LEARNING SIGNALS</span><h1>Small steps, real progress.</h1></div></div>
            <div className="stat-grid">
              <div className="stat-card hero-stat"><span>Weekly XP</span><strong>{xp}</strong><small>↑ 18% from last week</small></div>
              <div className="stat-card"><span>Speaking time</span><strong>42<small> min</small></strong><small>7 sessions completed</small></div>
              <div className="stat-card"><span>Words mastered</span><strong>68</strong><small>14 ready to review</small></div>
              <div className="stat-card"><span>Current streak</span><strong>6<small> days</small></strong><small>Your best is 9 days</small></div>
            </div>
            <section className="mastery-card">
              <div className="section-heading"><div><span className="eyebrow">SKILL MASTERY</span><h2>Your strongest signal is listening</h2></div><span>A2 · building toward B1</span></div>
              {[{ name: "Listening", value: 72 }, { name: "Vocabulary", value: 64 }, { name: "Conversation", value: 58 }, { name: "Speaking", value: 54 }, { name: "Grammar", value: 46 }].map((skill) => (
                <div className="mastery-row" key={skill.name}><strong>{skill.name}</strong><div><span style={{ width: `${skill.value}%` }} /></div><b>{skill.value}%</b></div>
              ))}
            </section>
            <section className="next-focus"><span>YOUR NEXT FOCUS</span><h2>Polite questions without translating first</h2><p>You often pause before auxiliary verbs. Tomorrow’s lesson will help make “Could you…?” and “Would you…?” automatic.</p><button className="primary-button" onClick={() => { setView("practice"); setActiveSkill("Speaking"); }}>Practice now <span>→</span></button></section>
          </div>
        )}

        <nav className="mobile-nav" aria-label="Mobile navigation">
          <button className={view === "today" ? "active" : ""} onClick={() => setView("today")}><span>⌂</span>Today</button>
          <button className={view === "practice" ? "active" : ""} onClick={() => setView("practice")}><span>◎</span>Practice</button>
          <button className={view === "progress" ? "active" : ""} onClick={() => setView("progress")}><span>↗</span>Progress</button>
        </nav>
      </section>

      {placementOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="placement-modal" role="dialog" aria-modal="true" aria-label="English placement check">
            <button className="modal-close" onClick={() => setPlacementOpen(false)} aria-label="Close placement test">×</button>
            {!placementResult ? (
              <>
                <span className="eyebrow">QUICK PLACEMENT CHECK</span>
                <div className="modal-progress"><span style={{ width: `${((placementStep + 1) / placementQuestions.length) * 100}%` }} /></div>
                <small>Question {placementStep + 1} of {placementQuestions.length}</small>
                <h2>{placementQuestions[placementStep].question}</h2>
                <div className="placement-options">
                  {placementQuestions[placementStep].options.map((option, index) => <button key={option} onClick={() => answerPlacement(index)}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}
                </div>
              </>
            ) : (
              <div className="placement-result">
                <div className="result-orb">{placementResult.slice(0, 2)}</div>
                <span className="eyebrow">YOUR STARTING LEVEL</span>
                <h2>{placementResult}</h2>
                <p>Your 30-day path will use shorter prompts, practical patterns, and plenty of guided speaking.</p>
                <button className="primary-button wide" onClick={() => setPlacementOpen(false)}>Build my learning path <span>→</span></button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
