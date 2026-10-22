"use client";

import { useState, useEffect, useRef, useMemo, FormEvent } from "react";
import { generatedGlossary } from "../lib/generated-glossary";
import { getLesson, scoreHospitalityResponse, type Domain } from "../lib/content";

type AuthMode = "loading" | "login" | "setup" | "change-password" | "authenticated" | "unavailable";

type AppUser = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "learner";
  mustChangePassword: boolean;
};

interface QuickPolish {
  original: string;
  better: string;
  reason: string;
}

interface ChatMessage {
  id: string;
  sender: "guest" | "user";
  text: string;
  timestamp: string;
  quickPolish?: QuickPolish;
  followUpQuestion?: string;
  suggestedReplies?: string[];
}

interface Scenario {
  id: string;
  badge: string;
  cardNumber: string;
  scenarioName: string;
  category: "Hotel" | "Restaurant" | "Healthcare";
  bgClass: string;
  textClass: string;
  guestName: string;
  guestMood: string;
  initialMessage: string;
  initialQuestion: string;
  suggestedReplies: string[];
}

const SCENARIOS: Scenario[] = [
  {
    id: "hotel-checkin",
    badge: "HOTEL FRONT DESK",
    cardNumber: "SUITE 3829",
    scenarioName: "Sarah Lee VIP Check-in",
    category: "Hotel",
    bgClass: "bg-[#e2f0f9]",
    textClass: "text-slate-900",
    guestName: "Sarah Lee (VIP Guest)",
    guestMood: "Hurried / VIP",
    initialMessage: "Good evening. I have a reservation under the name Sarah Lee. I just landed from a 14-hour flight, is my suite ready for check-in?",
    initialQuestion: "Welcome the guest warmly, confirm her reservation, and offer luggage assistance.",
    suggestedReplies: [
      "Good evening, Ms. Lee! Welcome to our hotel.",
      "Certainly, let me verify your suite right away.",
      "May I assist you with your luggage while you check in?"
    ]
  },
  {
    id: "fnb-allergy",
    badge: "RESTAURANT & F&B",
    cardNumber: "TABLE 2167",
    scenarioName: "Severe Nut Allergy & Wine",
    category: "Restaurant",
    bgClass: "bg-[#f1e6f7]",
    textClass: "text-slate-900",
    guestName: "James Crawford",
    guestMood: "Cautious / Dining",
    initialMessage: "Excuse me, I'm interested in ordering the chef's special tonight, but I have a severe peanut allergy. Can you ensure it's completely nut-free?",
    initialQuestion: "Reassure the guest, explain kitchen cross-contamination protocols, and recommend a safe pairing.",
    suggestedReplies: [
      "Absolutely, Mr. Crawford. We take allergies very seriously.",
      "I will personally alert our executive chef about your nut allergy.",
      "Would you like me to recommend a safe wine pairing for dinner?"
    ]
  },
  {
    id: "clinic-triage",
    badge: "HEALTHCARE TRIAGE",
    cardNumber: "PATIENT 8492",
    scenarioName: "Clinic Intake & Empathy Care",
    category: "Healthcare",
    bgClass: "bg-[#e4f3e9]",
    textClass: "text-slate-900",
    guestName: "Elena Rostova",
    guestMood: "Anxious / In Pain",
    initialMessage: "Hello doctor, I've had severe migraines and dizziness for the past three days. It's getting hard to focus on work.",
    initialQuestion: "Express empathy, inquire about related symptoms, and outline the consultation steps.",
    suggestedReplies: [
      "I understand how uncomfortable that must be, Elena.",
      "Are you experiencing any nausea or vision sensitivity?",
      "Let's check your blood pressure and examine you right away."
    ]
  }
];

export default function Home() {
  const [view, setView] = useState<"shift" | "talk" | "glossary" | "pathway">("shift");
  const [authMode, setAuthMode] = useState<AuthMode>("authenticated");
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Scenarios & Dialogue
  const [activeScenario, setActiveScenario] = useState<Scenario>(SCENARIOS[0]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "init-1",
      sender: "guest",
      text: SCENARIOS[0].initialMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      followUpQuestion: SCENARIOS[0].initialQuestion,
      suggestedReplies: SCENARIOS[0].suggestedReplies
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [isAiReplying, setIsAiReplying] = useState(false);
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState<string | null>(null);

  // Web Speech recognition state
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

  // Stats & Progress
  const [timeFilter, setTimeFilter] = useState<"Week" | "Month" | "Year">("Week");
  const [hotelCompleted, setHotelCompleted] = useState(6);
  const [restaurantCompleted, setRestaurantCompleted] = useState(5);

  // Glossary filter
  const [glossaryQuery, setGlossaryQuery] = useState("");
  const [glossaryDept, setGlossaryDept] = useState("ALL");

  // Auth fetch
  useEffect(() => {
    fetch("/api/auth/status")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: any) => {
        if (data.authenticated && data.user) {
          setCurrentUser(data.user);
          setAuthMode("authenticated");
        }
      })
      .catch(() => {
        // Guest preview mode
      });
  }, []);

  // Web Speech Init
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recog = new SpeechRecognition();
        recog.continuous = false;
        recog.interimResults = true;
        recog.lang = "en-US";

        recog.onresult = (event: any) => {
          let interim = "";
          let final = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              final += event.results[i][0].transcript;
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          const text = final || interim;
          setInterimTranscript(text);
          if (final) {
            setIsListening(false);
            handleUserSend(final);
            setInterimTranscript("");
          }
        };

        recog.onerror = () => setIsListening(false);
        recog.onend = () => setIsListening(false);
        recognitionRef.current = recog;
      }
    }
  }, []);

  // Text to Speech
  const speak = (text: string, msgId?: string) => {
    if (!soundEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    if (msgId) setCurrentlySpeakingId(msgId);

    const clean = text.replace(/[*#_~`]/g, "").trim();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    utterance.lang = "en-US";

    utterance.onend = () => setCurrentlySpeakingId(null);
    utterance.onerror = () => setCurrentlySpeakingId(null);

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setCurrentlySpeakingId(null);
    }
  };

  // Toggle Mic
  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      if (interimTranscript.trim()) {
        handleUserSend(interimTranscript.trim());
        setInterimTranscript("");
      }
      return;
    }

    if (recognitionRef.current) {
      setInterimTranscript("");
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        setIsListening(false);
      }
    }
  };

  // Select Scenario
  const selectScenario = (sc: Scenario) => {
    setActiveScenario(sc);
    stopSpeaking();
    const firstMsg: ChatMessage = {
      id: "sc-" + Date.now(),
      sender: "guest",
      text: sc.initialMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      followUpQuestion: sc.initialQuestion,
      suggestedReplies: sc.suggestedReplies
    };
    setMessages([firstMsg]);
    setView("talk");
    if (soundEnabled) speak(`${firstMsg.text} ${firstMsg.followUpQuestion}`, firstMsg.id);
  };

  // Send User Message & Trigger Coach/Guest Feedback
  const handleUserSend = (textToSend: string) => {
    const val = textToSend.trim();
    if (!val || isAiReplying) return;
    stopSpeaking();

    const userMsg: ChatMessage = {
      id: "u-" + Date.now(),
      sender: "user",
      text: val,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsAiReplying(true);

    // Polish logic
    const lower = val.toLowerCase();
    let quickPolish: QuickPolish | undefined;

    if (lower.includes("i am agree") || lower.includes("i'm agree")) {
      quickPolish = {
        original: "I am agree",
        better: "I agree / I completely agree, sir",
        reason: "Dalam hospitality, 'agree' adalah kata kerja tanpa diawali 'am'."
      };
    } else if (lower.includes("wait here") || lower.includes("you must wait")) {
      quickPolish = {
        original: "Wait here / You must wait",
        better: "Would you mind having a seat in the lounge for just a moment?",
        reason: "Gunakan modal verb lembut 'Would you mind' untuk standar keramahan bintang lima."
      };
    } else if (lower.includes("very like") || lower.includes("very love")) {
      quickPolish = {
        original: "very like...",
        better: "really like... / highly recommend...",
        reason: "Gunakan 'highly recommend' untuk rekomendasi menu atau kamar yang elegan."
      };
    } else if (lower.includes("no have") || lower.includes("not have")) {
      quickPolish = {
        original: "no have",
        better: "We currently do not have...",
        reason: "Gunakan 'We currently do not have' dengan sopan."
      };
    } else if (lower.includes("thanks you")) {
      quickPolish = {
        original: "Thanks you",
        better: "Thank you very much / It's my pleasure",
        reason: "Pilih 'Thank you' atau 'It is my absolute pleasure' saat melayani tamu."
      };
    }

    // Guest response simulation
    setTimeout(() => {
      let replyText = "Thank you so much! That sounds wonderful and very reassuring.";
      let nextQuestion = "Could you confirm what time breakfast is served tomorrow morning?";
      let suggestions = [
        "Breakfast is served from 6:30 AM to 10:30 AM in the Grand Dining Room.",
        "We also offer 24-hour in-room dining if you prefer.",
        "May I arrange a wake-up call for you as well?"
      ];

      if (activeScenario.id === "fnb-allergy") {
        replyText = "Thank you for being so attentive! It gives me great peace of mind knowing the kitchen has strict allergen separation.";
        nextQuestion = "What wine or beverage would you recommend to pair with the sea bass?";
        suggestions = [
          "Our crisp Sauvignon Blanc pairs exceptionally well with the sea bass.",
          "We also have a refreshing house-infused sparkling water.",
          "Would you like me to bring a tasting glass first?"
        ];
      } else if (activeScenario.id === "clinic-triage") {
        replyText = "Thank you, doctor. The pain is mostly on the left side, and bright lights make it significantly worse.";
        nextQuestion = "Should I take pain relievers immediately or wait for the blood test results?";
        suggestions = [
          "Let's run a rapid assessment first before administering medication.",
          "I will provide a mild sedative to help ease the tension right now.",
          "Please rest in the quiet observation room while we prepare the test."
        ];
      }

      const guestReply: ChatMessage = {
        id: "g-" + Date.now(),
        sender: "guest",
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        quickPolish,
        followUpQuestion: nextQuestion,
        suggestedReplies: suggestions
      };

      setMessages((prev) => [...prev, guestReply]);
      setIsAiReplying(false);

      if (soundEnabled) {
        speak(`${guestReply.text} ${guestReply.followUpQuestion}`, guestReply.id);
      }
    }, 850);
  };

  // Glossary filtered
  const filteredGlossary = useMemo(() => {
    return generatedGlossary.filter((g) => {
      const matchSearch =
        g.term.toLowerCase().includes(glossaryQuery.toLowerCase()) ||
        g.meaning.toLowerCase().includes(glossaryQuery.toLowerCase());
      if (glossaryDept === "ALL") return matchSearch;
      if (glossaryDept === "FRONT OFFICE") return matchSearch && g.department.includes("FRONT OFFICE");
      if (glossaryDept === "F&B SERVICE") return matchSearch && (g.department.includes("F&B") || g.department.includes("RESTAURANT"));
      if (glossaryDept === "SAFETY") return matchSearch && (g.department.includes("SAFETY") || g.department.includes("SECURITY"));
      return matchSearch;
    });
  }, [glossaryQuery, glossaryDept]);

  return (
    <div className="min-h-screen bg-[#0c0d0f] flex items-center justify-center sm:p-4 text-white">
      {/* Mobile Frame Container */}
      <div className="mobile-canvas relative overflow-hidden">
        {/* Header */}
        <header className="px-5 pt-5 pb-3 flex items-center justify-between z-20">
          {/* 6-dot matrix icon (Reference design) */}
          <button
            onClick={() => setView("shift")}
            className="w-10 h-10 rounded-2xl bg-[#1e2025] hover:bg-[#282a30] text-slate-300 flex items-center justify-center transition border border-white/5 active:scale-95"
            title="Shift Overview"
          >
            <div className="grid grid-cols-2 gap-1 w-3.5 h-3.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
            </div>
          </button>

          {/* Title */}
          <div className="text-center">
            <h1 className="font-extrabold text-base tracking-tight text-white flex items-center justify-center gap-1">
              <span>Hospita</span>
              <span className="text-sky-400 font-black">Lingo</span>
            </h1>
            <span className="text-[10px] tracking-wider uppercase font-semibold text-slate-400">
              {view === "shift" && "Shift Dashboard"}
              {view === "talk" && "Live Voice Session"}
              {view === "glossary" && "Operational Glossary (436)"}
              {view === "pathway" && "Competency Pathway"}
            </span>
          </div>

          {/* Sound toggle & Profile / Sign In */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (soundEnabled) stopSpeaking();
                setSoundEnabled(!soundEnabled);
              }}
              className={`w-9 h-9 rounded-2xl flex items-center justify-center transition border border-white/5 ${
                soundEnabled ? "bg-[#1e2025] text-sky-400" : "bg-[#2a1b1e] text-rose-400"
              }`}
              title={soundEnabled ? "Audio Sound ON" : "Audio Sound MUTED"}
            >
              {soundEnabled ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M11 5L6 9H2v6h4l5 4V5z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              )}
            </button>

            <button
              onClick={() => setShowLoginModal(true)}
              className="w-10 h-10 rounded-2xl bg-[#1e2025] hover:bg-[#282a30] p-1 border border-white/10 overflow-hidden active:scale-95 transition"
              title={currentUser ? `Logged in as ${currentUser.displayName}` : "Sign In / Sync Progress"}
            >
              <div className="w-full h-full rounded-xl bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center text-slate-950 font-black text-xs">
                {currentUser ? currentUser.displayName.slice(0, 2).toUpperCase() : "HL"}
              </div>
            </button>
          </div>
        </header>

        {/* VIEW 1: SHIFT DASHBOARD (Matching Reference Cards & Chart) */}
        {view === "shift" && (
          <div className="flex-1 overflow-y-auto px-5 pt-2 pb-28 space-y-6 no-scrollbar">
            {/* Headline */}
            <div className="pt-1">
              <h2 className="text-3xl font-extrabold tracking-tight text-white leading-[1.12]">
                Master your<br />
                Guest English
              </h2>
              <p className="text-xs text-slate-400 mt-2 max-w-[310px] leading-relaxed">
                Hospitality speech drills with real-time AI politeness feedback and safety checks.
              </p>
            </div>

            {/* Horizontal Squircle Card Carousel (Soft Powder Blue, Lilac, Sage) */}
            <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-5 px-5 pt-1 pb-2 snap-x">
              {SCENARIOS.map((sc) => (
                <div
                  key={sc.id}
                  onClick={() => selectScenario(sc)}
                  className={`flex-shrink-0 w-[270px] h-[220px] rounded-[32px] ${sc.bgClass} ${sc.textClass} p-6 flex flex-col justify-between shadow-2xl cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all snap-start relative overflow-hidden`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold tracking-wider uppercase opacity-70">
                      {sc.badge}
                    </span>
                    {/* Dual circle logo from reference */}
                    <div className="flex items-center">
                      <span className="w-5 h-5 rounded-full bg-slate-900 opacity-90 -mr-2" />
                      <span className="w-5 h-5 rounded-full bg-slate-900 opacity-60" />
                    </div>
                  </div>

                  <div className="my-auto">
                    <span className="text-[10px] font-bold tracking-widest uppercase opacity-50 block mb-0.5">
                      GUEST PROFILE
                    </span>
                    <h3 className="text-xl font-black tracking-tight leading-tight">
                      {sc.cardNumber}
                    </h3>
                    <p className="text-xs font-semibold opacity-80 mt-0.5">
                      {sc.scenarioName}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-900/10">
                    <span className="text-[11px] font-bold tracking-tight">
                      Practice Voice Roleplay
                    </span>
                    <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Speaking Activity Bar Chart (Matching 3rd reference screen) */}
            <div className="bg-[#1a1b20] rounded-[30px] p-5 border border-white/5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white tracking-tight">
                  Speaking Activity
                </span>
                <div className="bg-[#121316] p-1 rounded-full flex gap-1 border border-white/5">
                  {(["Week", "Month", "Year"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setTimeFilter(tab)}
                      className={`text-[10px] font-bold px-3 py-1 rounded-full transition ${
                        timeFilter === tab ? "bg-white text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vertical Bar Chart with Active Tooltip */}
              <div className="pt-6 pb-2">
                <div className="relative h-28 flex items-end justify-between px-2 border-b border-white/5 pb-2">
                  <div className="absolute top-0 left-[62%] -translate-x-1/2 bg-white text-slate-950 px-2.5 py-1 rounded-xl text-[10px] font-extrabold shadow-lg flex flex-col items-center">
                    <span>Today · 45m</span>
                    <span className="text-[9px] text-emerald-600 font-black">96% Polish</span>
                    <span className="w-2 h-2 bg-white rotate-45 absolute -bottom-1" />
                  </div>

                  {[
                    { day: "Feb", h: "h-12" },
                    { day: "Mar", h: "h-16" },
                    { day: "Apr", h: "h-10" },
                    { day: "May", h: "h-20" },
                    { day: "Jun", h: "h-24", active: true },
                    { day: "Jul", h: "h-14" },
                    { day: "Aug", h: "h-18" },
                  ].map((bar, i) => (
                    <div key={i} className="flex flex-col items-center gap-2">
                      <div
                        className={`w-5 ${bar.h} rounded-full transition-all ${
                          bar.active ? "bg-white shadow-md shadow-white/30" : "bg-[#2b2d36] hover:bg-[#383a45]"
                        }`}
                      />
                      <span className="text-[10px] font-semibold text-slate-500">{bar.day}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sparkline Rows */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs font-semibold text-slate-400">Politeness Index</span>
                  <div className="w-20 h-4 flex items-center">
                    <svg viewBox="0 0 100 20" className="w-full h-full text-emerald-400 stroke-current fill-none stroke-2">
                      <path d="M0,15 Q25,2 50,10 T100,5" />
                    </svg>
                  </div>
                  <span className="text-sm font-extrabold text-white">96% High</span>
                </div>

                <div className="flex items-center justify-between py-1 border-t border-white/5">
                  <span className="text-xs font-semibold text-slate-400">Daily Speaking Time</span>
                  <div className="w-20 h-4 flex items-center">
                    <svg viewBox="0 0 100 20" className="w-full h-full text-sky-400 stroke-current fill-none stroke-2">
                      <path d="M0,10 Q25,18 50,8 T100,2" />
                    </svg>
                  </div>
                  <span className="text-sm font-extrabold text-white">45 mins</span>
                </div>
              </div>
            </div>

            {/* Recent Drills (Matching Spotify/Grocery rows in reference) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white tracking-tight">Recent Drills</h3>
                <span onClick={() => setView("pathway")} className="text-[11px] font-semibold text-sky-400 cursor-pointer">
                  View Pathway
                </span>
              </div>

              <div className="space-y-2.5">
                {[
                  { title: "Luggage & Bellhop Service", sub: "Front Office · 3 mins ago", score: "96% Polished", col: "text-emerald-400" },
                  { title: "Nut Allergy Safety Verification", sub: "Fine Dining · 15 mins ago", score: "Passed ✓", col: "text-sky-400" },
                  { title: "Compassionate Triage Drill", sub: "Clinic Intake · Today", score: "92% Fluency", col: "text-amber-400" },
                ].map((d, idx) => (
                  <div
                    key={idx}
                    onClick={() => selectScenario(SCENARIOS[idx % SCENARIOS.length])}
                    className="bg-[#1a1b20] hover:bg-[#22242a] p-3.5 rounded-[22px] border border-white/5 flex items-center justify-between transition cursor-pointer active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-[#121316] border border-white/5 flex items-center justify-center text-sky-400 font-black text-xs">
                        {idx === 0 ? "🛎️" : idx === 1 ? "🍽️" : "🏥"}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white tracking-tight">{d.title}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">{d.sub}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-extrabold ${d.col}`}>{d.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: TALK VOICE ROLEPLAY */}
        {view === "talk" && (
          <div className="flex-1 flex flex-col overflow-hidden pb-24">
            {/* Top Bar for Scenario */}
            <div className="px-5 py-3 bg-[#191b20] border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setView("shift")}
                  className="w-8 h-8 rounded-xl bg-[#24262d] hover:bg-[#2e313a] text-slate-300 flex items-center justify-center transition"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-extrabold text-white">{activeScenario.scenarioName}</h3>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                      {activeScenario.category}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">Guest: <strong className="text-slate-200">{activeScenario.guestName}</strong></p>
                </div>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 no-scrollbar">
              {messages.map((msg) => {
                const isGuest = msg.sender === "guest";
                const isPlaying = currentlySpeakingId === msg.id;

                return (
                  <div key={msg.id} className={`flex flex-col ${isGuest ? "items-start" : "items-end"} space-y-1`}>
                    <span className="text-[9px] font-semibold text-slate-500 px-1">
                      {isGuest ? `${activeScenario.guestName}` : "You (Hospitality Staff)"} • {msg.timestamp}
                    </span>

                    <div
                      className={`max-w-[88%] rounded-[24px] p-4 text-xs leading-relaxed transition ${
                        isGuest
                          ? "bg-[#1e2026] border border-white/5 text-slate-100 shadow-md"
                          : "bg-white text-slate-950 font-medium shadow-lg"
                      }`}
                    >
                      {/* 5-Star Quick Polish Card */}
                      {isGuest && msg.quickPolish && (
                        <div className="mb-3 rounded-2xl bg-[#e2f0f9] text-slate-900 p-3.5 space-y-1.5 shadow-sm">
                          <div className="flex items-center gap-1.5 text-xs font-black text-sky-950">
                            <span>💡 5-Star Hospitality Polish</span>
                          </div>
                          <div className="space-y-1 pt-0.5 text-[11px]">
                            <div className="line-through text-slate-500 font-mono">{msg.quickPolish.original}</div>
                            <div className="font-extrabold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-lg inline-block border border-emerald-300/60">
                              ✓ {msg.quickPolish.better}
                            </div>
                            <p className="text-slate-700 text-[10px] leading-relaxed pt-0.5">{msg.quickPolish.reason}</p>
                          </div>
                        </div>
                      )}

                      <p className="whitespace-pre-line text-xs">{msg.text}</p>

                      {/* Question Callout */}
                      {isGuest && msg.followUpQuestion && (
                        <div className="mt-3 pt-2.5 border-t border-white/5 flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-sky-400 text-slate-950 font-black text-[9px] flex items-center justify-center flex-shrink-0 mt-0.5">
                            ?
                          </span>
                          <p className="text-xs font-bold text-sky-300 italic">"{msg.followUpQuestion}"</p>
                        </div>
                      )}

                      {/* Audio listen button */}
                      {isGuest && (
                        <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between">
                          <button
                            onClick={() => (isPlaying ? stopSpeaking() : speak(`${msg.text} ${msg.followUpQuestion || ""}`, msg.id))}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-bold transition ${
                              isPlaying
                                ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse"
                                : "bg-white/5 hover:bg-white/10 text-slate-300"
                            }`}
                          >
                            <span>{isPlaying ? "Stop" : "🔊 Listen Native Voice"}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isAiReplying && (
                <div className="flex items-center gap-2 text-xs text-slate-500 pl-2">
                  <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
                  <span>Guest is responding...</span>
                </div>
              )}
            </div>

            {/* Teleprompter chips */}
            {messages[messages.length - 1]?.suggestedReplies && !isAiReplying && (
              <div className="px-5 py-2 flex gap-1.5 overflow-x-auto no-scrollbar">
                {messages[messages.length - 1].suggestedReplies!.map((rep, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleUserSend(rep)}
                    className="flex-shrink-0 text-[11px] font-semibold bg-[#21232a] hover:bg-[#2c2f38] text-slate-200 border border-white/5 rounded-full px-3 py-1.5 transition active:scale-95 text-left"
                  >
                    "{rep}"
                  </button>
                ))}
              </div>
            )}

            {/* Listening transcript bar */}
            {isListening && (
              <div className="mx-5 mb-2 bg-[#21232a] border border-sky-400/30 rounded-2xl p-2.5 flex items-center justify-between gap-3 animate-pulse">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  <span className="text-[10px] font-extrabold text-sky-400">Listening to your English...</span>
                </div>
                <p className="text-[10px] text-slate-300 italic truncate max-w-[65%]">
                  {interimTranscript || "Speak now..."}
                </p>
              </div>
            )}

            {/* Input Bar */}
            <div className="px-5 py-2.5 bg-[#141518] border-t border-white/5 flex items-center gap-2.5">
              <button
                onClick={toggleListening}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all flex-shrink-0 shadow-lg ${
                  isListening
                    ? "bg-rose-600 text-white ring-4 ring-rose-500/30 scale-105 animate-pulse"
                    : "bg-white text-slate-950 shadow-white/10 hover:scale-105 active:scale-95"
                }`}
                title={isListening ? "Stop listening" : "Tap to speak with Mic"}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>

              <div className="relative flex-1">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUserSend(inputText)}
                  disabled={isAiReplying || isListening}
                  placeholder={isListening ? "Listening..." : "Or type your response..."}
                  className="w-full bg-[#1e2026] text-white placeholder-slate-500 text-xs rounded-2xl px-4 py-3 border border-white/5 focus:border-sky-400 focus:outline-none transition"
                />
              </div>

              <button
                onClick={() => handleUserSend(inputText)}
                disabled={!inputText.trim() || isAiReplying}
                className={`w-11 h-11 rounded-2xl flex items-center justify-center transition flex-shrink-0 ${
                  inputText.trim() && !isAiReplying
                    ? "bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-md"
                    : "bg-[#1e2026] text-slate-600 border border-white/5 cursor-not-allowed"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* VIEW 3: GLOSSARY (436 Operational Terms from Hospitality Operations & Governance) */}
        {view === "glossary" && (
          <div className="flex-1 flex flex-col overflow-hidden pb-24">
            <div className="px-5 pt-3 pb-2 space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={glossaryQuery}
                  onChange={(e) => setGlossaryQuery(e.target.value)}
                  placeholder="Search 436 operational terms..."
                  className="w-full bg-[#1c1d22] text-white placeholder-slate-500 text-xs rounded-2xl pl-4 pr-4 py-3 border border-white/5 focus:border-sky-400 focus:outline-none transition"
                />
              </div>

              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {["ALL", "FRONT OFFICE", "F&B SERVICE", "SAFETY"].map((dept) => (
                  <button
                    key={dept}
                    onClick={() => setGlossaryDept(dept)}
                    className={`flex-shrink-0 text-[10px] font-extrabold px-3 py-1.5 rounded-full transition ${
                      glossaryDept === dept
                        ? "bg-white text-slate-950 shadow-sm"
                        : "bg-[#1c1d22] text-slate-400 hover:text-white border border-white/5"
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-2 space-y-3 no-scrollbar">
              <div className="text-[11px] text-slate-400 font-semibold px-1">
                Showing {filteredGlossary.length} approved master terms
              </div>

              {filteredGlossary.slice(0, 60).map((item) => (
                <div
                  key={item.id}
                  className="bg-[#1c1d22] hover:bg-[#23252a] p-4 rounded-[24px] border border-white/5 space-y-2.5 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[9px] font-extrabold tracking-wider uppercase text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                        {item.department}
                      </span>
                      <h3 className="text-sm font-extrabold text-white mt-1.5 tracking-tight">{item.term}</h3>
                    </div>

                    <button
                      onClick={() => speak(item.term)}
                      className="w-8 h-8 rounded-xl bg-[#282a32] hover:bg-[#343742] text-sky-400 flex items-center justify-center transition flex-shrink-0"
                      title="Listen audio"
                    >
                      🔊
                    </button>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">{item.meaning}</p>

                  {item.workplaceUse && (
                    <div className="p-2.5 rounded-xl bg-[#141518] border border-white/5 text-[11px] text-slate-400">
                      <strong className="text-slate-300 block mb-0.5">Workplace Application:</strong>
                      {item.workplaceUse}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 4: PATHWAY (50-Lesson Certificate & Safety Checklist) */}
        {view === "pathway" && (
          <div className="flex-1 overflow-y-auto px-5 pt-3 pb-28 space-y-6 no-scrollbar">
            <div className="bg-gradient-to-br from-[#1d1f27] to-[#16171d] rounded-[32px] p-6 border border-white/10 relative overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-white text-slate-950 flex items-center justify-center font-black shadow-lg">
                  🏆
                </div>
                <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-white/10 text-white border border-white/15">
                  Certificate Pathway
                </span>
              </div>

              <h2 className="text-xl font-extrabold text-white tracking-tight leading-tight">
                Hospitality English<br />
                Competency Certificate
              </h2>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                50 Balanced Lessons (25 Hotel + 25 Restaurant) with strict operational safety threshold.
              </p>

              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span>{hotelCompleted + restaurantCompleted} of 50 Lessons Done</span>
                  <span className="text-sky-400">{Math.round(((hotelCompleted + restaurantCompleted) / 50) * 100)}%</span>
                </div>
                <div className="w-full bg-[#292c36] h-2.5 rounded-full overflow-hidden p-0.5">
                  <div
                    className="bg-white h-full rounded-full transition-all duration-500 shadow-sm shadow-white/50"
                    style={{ width: `${Math.round(((hotelCompleted + restaurantCompleted) / 50) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <div className="bg-[#1c1d22] p-4 rounded-[26px] border border-white/5 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Hotel Track</span>
                <div className="text-lg font-extrabold text-white">
                  {hotelCompleted} <span className="text-xs text-slate-500">/ 25 Done</span>
                </div>
              </div>

              <div className="bg-[#1c1d22] p-4 rounded-[26px] border border-white/5 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Restaurant Track</span>
                <div className="text-lg font-extrabold text-white">
                  {restaurantCompleted} <span className="text-xs text-slate-500">/ 25 Done</span>
                </div>
              </div>
            </div>

            <div className="bg-[#1c1d22] rounded-[30px] p-5 border border-white/5 space-y-3.5">
              <h3 className="text-xs font-bold text-white tracking-tight uppercase">Operational Safety Checkpoints</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-[#141518] border border-white/5">
                  <div>
                    <span className="font-bold text-slate-200 block">Severe Allergy Verification</span>
                    <p className="text-[10px] text-slate-500">Cross-contamination & kitchen inquiry SOP</p>
                  </div>
                  <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                    PASSED ✓
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-2xl bg-[#141518] border border-white/5">
                  <div>
                    <span className="font-bold text-slate-200 block">Room Availability & Guarantee</span>
                    <p className="text-[10px] text-slate-500">Early check-in & walk-in rate handling</p>
                  </div>
                  <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                    PASSED ✓
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Floating Bottom Navigation Pill (Matching Reference Image) */}
        <nav className="absolute bottom-4 left-4 right-4 z-40">
          <div className="bg-[#181a1f]/95 backdrop-blur-xl border border-white/10 rounded-full px-3 py-2 flex items-center justify-around shadow-2xl shadow-black/80">
            <button
              onClick={() => setView("shift")}
              className={`flex items-center justify-center w-11 h-11 rounded-full transition-all ${
                view === "shift" ? "bg-white text-slate-950 font-bold shadow-md" : "text-slate-400 hover:text-white"
              }`}
              title="Shift Dashboard"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </button>

            {/* Center Mic Orb */}
            <button
              onClick={() => setView("talk")}
              className={`relative flex items-center justify-center transition-all ${
                view === "talk"
                  ? "w-13 h-13 rounded-full bg-white text-slate-950 shadow-lg shadow-white/20 scale-105"
                  : "w-12 h-12 rounded-full bg-[#272931] hover:bg-[#32353e] text-sky-400 border border-white/10"
              }`}
              title="Live Voice Talk"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>

            <button
              onClick={() => setView("glossary")}
              className={`flex items-center justify-center w-11 h-11 rounded-full transition-all ${
                view === "glossary" ? "bg-white text-slate-950 font-bold shadow-md" : "text-slate-400 hover:text-white"
              }`}
              title="436 Master Terms"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </button>

            <button
              onClick={() => setView("pathway")}
              className={`flex items-center justify-center w-11 h-11 rounded-full transition-all ${
                view === "pathway" ? "bg-white text-slate-950 font-bold shadow-md" : "text-slate-400 hover:text-white"
              }`}
              title="Certification Pathway"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </button>
          </div>
        </nav>

        {/* Login Modal */}
        {showLoginModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
            <div className="bg-[#1c1d22] border border-white/10 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold text-white">
                  {currentUser ? "Account Profile" : "Sign In to HospitaLingo"}
                </h3>
                <button
                  onClick={() => setShowLoginModal(false)}
                  className="w-8 h-8 rounded-full bg-white/5 text-slate-400 hover:text-white flex items-center justify-center"
                >
                  ✕
                </button>
              </div>

              {currentUser ? (
                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded-2xl bg-[#141518] border border-white/5">
                    <strong className="text-white block">{currentUser.displayName}</strong>
                    <span className="text-slate-400">{currentUser.email}</span>
                    <span className="text-[10px] font-bold text-sky-400 block mt-1 uppercase">{currentUser.role} Account</span>
                  </div>
                  <button
                    onClick={async () => {
                      await fetch("/api/auth/logout", { method: "POST" });
                      setCurrentUser(null);
                      setShowLoginModal(false);
                    }}
                    className="w-full py-2.5 rounded-xl bg-rose-500/20 text-rose-400 font-bold hover:bg-rose-500/30 transition"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
                    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
                    try {
                      const res = await fetch("/api/auth/login", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, password })
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setCurrentUser(data.user);
                        setShowLoginModal(false);
                      } else {
                        alert("Invalid email or password.");
                      }
                    } catch {
                      alert("Login failed. Check your network.");
                    }
                  }}
                  className="space-y-3 text-xs"
                >
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">Email</label>
                    <input
                      name="email"
                      type="email"
                      required
                      placeholder="admin@hospitalingo.internal"
                      className="w-full bg-[#141518] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-sky-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">Password</label>
                    <input
                      name="password"
                      type="password"
                      required
                      className="w-full bg-[#141518] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-sky-400"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-white text-slate-950 font-bold hover:bg-slate-200 transition"
                  >
                    Log In
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
