"use client";

import { FormEvent, type ButtonHTMLAttributes, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLesson, getTerms, scoreHospitalityResponse, type Domain, type HospitalityTerm } from "../lib/content";

type Progress = {
  hotelCompleted: number;
  restaurantCompleted: number;
  currentLesson: number;
  certificateEligible: boolean;
  certificateStatus?: "locked" | "pending" | "approved" | "expired";
  certificateId?: string;
  certificateIssuedAt?: string;
  certificateExpiresAt?: string;
};

type Step = "Vocabulary" | "Listening" | "Grammar" | "Speaking" | "Role Practice";
type RecordingTarget = "speaking" | "role";
type AuthMode = "loading" | "login" | "setup" | "change-password" | "authenticated" | "unavailable";
type AppUser = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "learner";
  mustChangePassword: boolean;
};
type Assessment = ReturnType<typeof scoreHospitalityResponse> & {
  modelAnswer?: string;
  provider?: "cloudflare-workers-ai" | "rules-fallback";
};

const steps: Step[] = ["Vocabulary", "Listening", "Grammar", "Speaking", "Role Practice"];
const defaultProgress: Progress = {
  hotelCompleted: 6,
  restaurantCompleted: 5,
  currentLesson: 12,
  certificateEligible: false,
};

export default function Home() {
  const [view, setView] = useState<"today" | "lesson" | "talk" | "glossary" | "progress" | "users">("today");
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [setupAvailable, setSetupAvailable] = useState(false);
  const [progress, setProgress] = useState<Progress>(defaultProgress);
  const [domain, setDomain] = useState<Domain>("restaurant");
  const [stepIndex, setStepIndex] = useState(0);
  const [listeningAnswer, setListeningAnswer] = useState<number | null>(null);
  const [grammarAnswer, setGrammarAnswer] = useState<number | null>(null);
  const [transcript, setTranscript] = useState("");
  const [rawSpeakingTranscript, setRawSpeakingTranscript] = useState("");
  const [speakingFeedback, setSpeakingFeedback] = useState<Assessment | null>(null);
  const [roleResponse, setRoleResponse] = useState("");
  const [rawRoleTranscript, setRawRoleTranscript] = useState("");
  const [roleFeedback, setRoleFeedback] = useState<Assessment | null>(null);
  const [lessonComplete, setLessonComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [recordingTarget, setRecordingTarget] = useState<RecordingTarget | null>(null);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcribingTarget, setTranscribingTarget] = useState<RecordingTarget | null>(null);
  const [transcriptionError, setTranscriptionError] = useState("");
  const [composer, setComposer] = useState("");
  const [notice, setNotice] = useState("Your AI-powered learning plan is ready.");
  const [aiAvailable, setAiAvailable] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingClockRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const lessonNumber = domain === "hotel" ? progress.hotelCompleted + 1 : progress.restaurantCompleted + 26;
  const lesson = useMemo(() => getLesson(domain, lessonNumber), [domain, lessonNumber]);
  const terms = useMemo(() => getTerms(lesson.termIds), [lesson.termIds]);
  const currentStep = steps[stepIndex];
  const totalCompleted = progress.hotelCompleted + progress.restaurantCompleted;
  const completionPercent = Math.min(100, Math.round((totalCompleted / 50) * 100));

  const loadProgress = useCallback(async () => {
    return fetch("/api/progress")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: Progress) => {
        setProgress(data);
        setDomain(data.hotelCompleted <= data.restaurantCompleted ? "hotel" : "restaurant");
      })
      .catch(() => {
        if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
          setNotice("Your learning record could not be loaded. Please refresh and try again.");
        }
      });
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/status", { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("Account service unavailable");
      const data = (await response.json()) as {
        authenticated: boolean;
        user?: AppUser | null;
        setupRequired?: boolean;
        setupAvailable?: boolean;
      };
      setSetupAvailable(Boolean(data.setupAvailable));
      if (data.authenticated && data.user) {
        setCurrentUser(data.user);
        setAuthMode(data.user.mustChangePassword ? "change-password" : "authenticated");
        if (!data.user.mustChangePassword) await loadProgress();
      } else {
        setCurrentUser(null);
        setAuthMode(data.setupRequired ? "setup" : "login");
      }
    } catch {
      setAuthMode("unavailable");
    }
  }, [loadProgress]);

  useEffect(() => {
    const authTimer = window.setTimeout(() => { void refreshAuth(); }, 0);
    fetch("/api/ai-status")
      .then((response) => response.json())
      .then((data: { available?: boolean }) => setAiAvailable(Boolean(data.available)))
      .catch(() => setAiAvailable(false));
    return () => window.clearTimeout(authTimer);
  }, [refreshAuth]);

  useEffect(() => () => {
    if (recordingClockRef.current) clearInterval(recordingClockRef.current);
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setCurrentUser(null);
    setView("today");
    setAuthMode("login");
  }

  function resetLesson(nextDomain = domain) {
    setDomain(nextDomain);
    setStepIndex(0);
    setListeningAnswer(null);
    setGrammarAnswer(null);
    setTranscript("");
    setRawSpeakingTranscript("");
    setSpeakingFeedback(null);
    setRoleResponse("");
    setRawRoleTranscript("");
    setRoleFeedback(null);
    setTranscriptionError("");
    setLessonComplete(false);
    setView("lesson");
  }

  function play(text: string, rate = 0.92) {
    if (!("speechSynthesis" in window)) {
      setNotice("Audio playback is not available in this browser. The transcript remains available.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
  }

  function continueStep() {
    setStepIndex((index) => Math.min(steps.length - 1, index + 1));
  }

  async function requestAssessment(text: string, task: "speaking" | "role_practice") {
    setAssessing(true);
    try {
      const response = await fetch("/api/assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain,
          transcript: text,
          task,
          lessonId: lesson.id,
          prompt: task === "speaking" ? lesson.speakingPrompt : lesson.roleScenario.guestMessage,
          safetyRule: lesson.roleScenario.safetyRule,
        }),
      });
      if (!response.ok) throw new Error("Assessment unavailable");
      const feedback = (await response.json()) as Assessment;
      if (feedback.provider === "rules-fallback") {
        setNotice("AI assessment is not connected in this deployment, so the safety rubric was used as a fallback.");
      }
      return feedback;
    } catch {
      setNotice("AI assessment is temporarily unavailable. The safety rubric was used instead.");
      return { ...scoreHospitalityResponse(text, domain), provider: "rules-fallback" as const };
    } finally {
      setAssessing(false);
    }
  }

  async function confirmTranscript() {
    setSpeakingFeedback(await requestAssessment(transcript, "speaking"));
  }

  async function transcribeRecording(blob: Blob, target: RecordingTarget) {
    setTranscribingTarget(target);
    setTranscriptionError("");
    try {
      if (blob.size < 1000) throw new Error("The recording was too short or silent. Record for at least two seconds and try again.");
      const form = new FormData();
      form.append("audio", blob, blob.type.includes("mp4") ? "hospitalingo-recording.m4a" : "hospitalingo-recording.webm");
      form.append("domain", domain);
      form.append("lessonId", lesson.id);
      form.append("prompt", target === "speaking" ? lesson.speakingPrompt : lesson.roleScenario.guestMessage);
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({ error: `Transcription service returned ${response.status}.` })) as { text?: string; rawText?: string; normalized?: boolean; error?: string };
      if (!response.ok || !payload.text) throw new Error(payload.error || "No transcript returned.");
      if (target === "speaking") {
        setTranscript(payload.text);
        setRawSpeakingTranscript(payload.rawText ?? payload.text);
        setSpeakingFeedback(null);
      } else {
        setRoleResponse(payload.text);
        setRawRoleTranscript(payload.rawText ?? payload.text);
        setRoleFeedback(null);
      }
      setNotice(
        payload.normalized
          ? "AI transcribed the recording and corrected likely hospitality-term errors. Compare the raw version before assessment."
          : "Recording transcribed by AI. Review the transcript before assessment.",
      );
      setTranscriptionError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The recording could not be transcribed. You can type the transcript instead.";
      setNotice(message);
      setTranscriptionError(message);
    } finally {
      setTranscribingTarget(null);
    }
  }

  async function toggleRecording(target: RecordingTarget) {
    if (recordingTarget && recorderRef.current) {
      recorderRef.current.stop();
      return;
    }
    setTranscriptionError("");
    if (!("MediaRecorder" in window) || !navigator.mediaDevices?.getUserMedia) {
      const message = "Microphone recording is not supported by this browser. You can type the confirmed transcript instead.";
      setNotice(message);
      setTranscriptionError(message);
      return;
    }
    try {
      window.speechSynthesis?.cancel();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const preferredMimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(
        stream,
        preferredMimeType ? { mimeType: preferredMimeType, audioBitsPerSecond: 128000 } : undefined,
      );
      recorderRef.current = recorder;
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
        if (recordingClockRef.current) clearInterval(recordingClockRef.current);
        stream.getTracks().forEach((track) => track.stop());
        const detectedType = recorder.mimeType || recordingChunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(recordingChunksRef.current, { type: detectedType });
        recorderRef.current = null;
        setRecordingTarget(null);
        setRecordingPaused(false);
        void transcribeRecording(blob, target);
      };
      recorder.start(250);
      setRecordingSeconds(0);
      setRecordingPaused(false);
      recordingClockRef.current = setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
      recordingTimeoutRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 60_000);
      setRecordingTarget(target);
      setNotice("Recording… Speak naturally, then tap Stop recording.");
    } catch {
      const message = "Microphone permission was not granted. Allow microphone access for HospitaLingo, then try again.";
      setNotice(message);
      setTranscriptionError(message);
    }
  }

  function toggleRecordingPause() {
    const recorder = recorderRef.current;
    if (!recorder || !recordingTarget) return;
    if (recorder.state === "recording") {
      recorder.pause();
      setRecordingPaused(true);
      if (recordingClockRef.current) clearInterval(recordingClockRef.current);
    } else if (recorder.state === "paused") {
      recorder.resume();
      setRecordingPaused(false);
      recordingClockRef.current = setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    }
  }

  async function finishLesson() {
    setSaving(true);
    const feedback = await requestAssessment(roleResponse, "role_practice");
    setRoleFeedback(feedback);
    if (feedback.score < 75 || feedback.criticalError) {
      setSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lessonId: lesson.id,
          domain,
          score: feedback.score,
          criticalError: feedback.criticalError,
          transcript: roleResponse,
          feedback,
        }),
      });
      if (response.ok) setProgress(await response.json());
      else if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        setProgress((current) => {
          const hotelCompleted = Math.min(25, current.hotelCompleted + (domain === "hotel" ? 1 : 0));
          const restaurantCompleted = Math.min(25, current.restaurantCompleted + (domain === "restaurant" ? 1 : 0));
          return {
            hotelCompleted,
            restaurantCompleted,
            currentLesson: Math.min(50, hotelCompleted + restaurantCompleted + 1),
            certificateEligible: hotelCompleted >= 25 && restaurantCompleted >= 25,
          };
        });
      } else {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Your result could not be saved.");
      }
      setLessonComplete(true);
      setNotice("Lesson completed. Your confirmed transcript and result were recorded.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Your result could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleComposer(event: FormEvent) {
    event.preventDefault();
    const prompt = composer.trim().toLowerCase();
    if (!prompt) return;
    if (prompt.includes("progress") || prompt.includes("certificate")) {
      setView("progress");
      setNotice("Here is your certificate progress.");
    } else if (prompt.includes("hotel")) {
      resetLesson("hotel");
      setNotice("Starting a Hotel Front Office lesson.");
    } else if (prompt.includes("restaurant") || prompt.includes("lesson") || prompt.includes("start")) {
      resetLesson(prompt.includes("restaurant") ? "restaurant" : domain);
      setNotice("Starting your recommended lesson.");
    } else {
      setNotice("Try “start lesson”, “hotel practice”, or “show certificate progress”.");
    }
    setComposer("");
  }

  if (authMode === "loading") return <AuthShell><div className="auth-loading">Preparing your learning space…</div></AuthShell>;
  if (authMode === "unavailable") {
    return <AuthShell><AuthMessage title="Account service unavailable" copy="HospitaLingo could not connect to its account database. Please try again shortly." /></AuthShell>;
  }
  if (authMode === "setup") {
    return <SetupScreen setupAvailable={setupAvailable} onComplete={refreshAuth} />;
  }
  if (authMode === "login") return <LoginScreen onComplete={refreshAuth} />;
  if (authMode === "change-password" && currentUser) {
    return <ChangePasswordScreen user={currentUser} onComplete={refreshAuth} />;
  }

  return (
    <main className={`app-frame view-${view}`}>
      <header className="app-header">
        <button className="app-identity" onClick={() => setView("today")} aria-label="Open HospitaLingo home">
          <span className="app-mark">H</span>
          <span>
            <strong>HospitaLingo</strong>
            <small>English for Hotel &amp; Restaurant</small>
          </span>
        </button>
        <div className="header-actions">
          <Badge color={aiAvailable ? "success" : "secondary"} variant="soft" pill>
            {aiAvailable ? "AI ready" : "AI preview"}
          </Badge>
          <button className="notification-button" type="button" aria-label="Notifications"><Icon name="bell" /></button>
          <button className="profile-chip" type="button" onClick={() => currentUser?.role === "admin" ? setView("users") : setView("progress")}>
            <span>{initials(currentUser?.displayName)}</span>
            <strong>{currentUser?.displayName?.split(" ")[0] ?? "Learner"}</strong>
          </button>
          <button className="signout-button" type="button" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <section className="conversation" aria-live="polite">
        {view !== "today" && view !== "talk" && <article className="assistant-turn">
          <div className="assistant-avatar" aria-hidden="true">H</div>
          <div className="turn-content">
            <p className="assistant-name">HospitaLingo</p>
            <p>{notice}</p>
          </div>
        </article>}

        {view === "today" && (
          <section className="home-dashboard" aria-labelledby="today-title">
            <div className="home-hero">
              <div className="mobile-greeting">
                <span className="avatar-bubble">{initials(currentUser?.displayName)}</span>
                <div><small>Welcome back</small><strong>Hello, {currentUser?.displayName?.split(" ")[0] ?? "Learner"}</strong></div>
                <button className="notification-button light" type="button" aria-label="Notifications"><Icon name="bell" /></button>
                <button className="notification-button light" type="button" onClick={signOut} aria-label="Sign out"><Icon name="logout" /></button>
              </div>
              <p className="hero-kicker">HOSPITALITY ENGLISH</p>
              <h1 id="today-title">Ready to serve with confidence?</h1>
              <form className="hero-search" onSubmit={handleComposer}>
                <Icon name="search" />
                <label htmlFor="composer">Ask HospitaLingo</label>
                <input
                  id="composer"
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  placeholder="Search or ask your AI coach"
                />
                <button type="submit" aria-label="Send"><Icon name="arrow" /></button>
              </form>
            </div>

            <div className="dashboard-body">
              <article className="journey-card">
                <div className="journey-heading">
                  <div><p>Your hospitality English begins here!</p><span>You&apos;re building real service confidence.</span></div>
                  <button type="button" onClick={() => setView("progress")} aria-label="View progress"><Icon name="chevron" /></button>
                </div>
                <div className="journey-progress">
                  <div><span>Learning progress</span><strong>{totalCompleted}/50 lessons</strong></div>
                  <div className="progress-track" aria-label={`${completionPercent}% complete`}><span style={{ width: `${completionPercent}%` }} /></div>
                </div>
                <button className="continue-card" type="button" onClick={() => resetLesson(domain)}>
                  <span className="continue-icon"><Icon name={domain === "hotel" ? "hotel" : "restaurant"} /></span>
                  <span><small>CONTINUE LEARNING</small><strong>{lesson.title}</strong><em>{lesson.subtitle}</em></span>
                  <Badge color="success" variant="soft" pill>{domain === "hotel" ? "Hotel" : "Restaurant"} {lesson.trackNumber}/25</Badge>
                </button>
              </article>

              <section className="learning-section" aria-labelledby="learning-title">
                <div className="section-heading"><div><p id="learning-title">Choose another practice</p><span>About 15 minutes each</span></div><button type="button" onClick={() => setView("progress")}>See all</button></div>
                <div className="practice-grid">
                  <article className="practice-card hotel-card">
                    <span className="practice-icon"><Icon name="hotel" /></span>
                    <div><small>HOTEL</small><h2>Front Office</h2><p>Welcome, assist, and solve guest requests.</p></div>
                    <Button color="primary" onClick={() => resetLesson("hotel")}>Start learning</Button>
                  </article>
                  <article className="practice-card restaurant-card">
                    <span className="practice-icon"><Icon name="restaurant" /></span>
                    <div><small>RESTAURANT</small><h2>Restaurant Service</h2><p>Take orders and handle dietary needs safely.</p></div>
                    <Button color="primary" onClick={() => resetLesson("restaurant")}>Start learning</Button>
                  </article>
                </div>
              </section>

              <section className="quiz-section">
                <div className="section-heading"><div><p>Quiz and test</p><span>Keep your knowledge fresh</span></div><button type="button" onClick={() => resetLesson(domain)}>See all</button></div>
                <button className="quiz-card" type="button" onClick={() => resetLesson(domain)}>
                  <span className="quiz-icon"><Icon name="briefcase" /></span>
                  <span><small>BASIC VOCABULARY</small><strong>Hospitality<br />Vocabulary Challenge</strong><em>12 questions · 8 minutes</em></span>
                  <span className="quiz-arrow"><Icon name="arrow" /></span>
                </button>
              </section>

              <div className="notice-strip"><Icon name="sparkle" /><span>{notice}</span></div>
            </div>
            <button className="talk-fab" type="button" onClick={() => setView("talk")}><Icon name="mic" /><span>Talk with AI</span></button>
          </section>
        )}

        {view === "talk" && (
          <section className="talk-screen" aria-labelledby="talk-title">
            <div className="talk-heading">
              <button type="button" onClick={() => setView("today")} aria-label="Back to home"><Icon name="chevron-left" /></button>
              <div><small>AI SPEAKING COACH</small><h1 id="talk-title">Talk With AI</h1></div>
              <Badge color={aiAvailable ? "success" : "secondary"} variant="soft" pill>{aiAvailable ? "Ready" : "Preview"}</Badge>
            </div>
            <div className="talk-layout">
              <article className={`talk-card ${recordingTarget === "speaking" ? "is-recording" : ""}`}>
                <div className="mic-stage">
                  <span className="ring ring-three" /><span className="ring ring-two" /><span className="ring ring-one" />
                  <button
                    className="mic-core"
                    type="button"
                    onClick={() => toggleRecording("speaking")}
                    disabled={Boolean(transcribingTarget)}
                    aria-label={recordingTarget === "speaking" ? "Stop recording" : "Start speaking"}
                  ><Icon name={recordingTarget === "speaking" ? "stop" : "mic"} /></button>
                </div>
                <div className="talk-instruction">
                  <h2>{recordingTarget === "speaking" ? "I’m listening…" : transcribingTarget === "speaking" ? "Turning your voice into text…" : "Press the button to speak with AI"}</h2>
                  <p>Practice a real hotel or restaurant conversation. You can review the transcript before AI assessment.</p>
                </div>
                {recordingTarget === "speaking" && (
                  <div className="live-recorder">
                    <button type="button" onClick={toggleRecordingPause} aria-label={recordingPaused ? "Resume recording" : "Pause recording"}>{recordingPaused ? <Icon name="play" /> : <Icon name="pause" />}</button>
                    <Icon name="mic" />
                    <span className={`waveform ${recordingPaused ? "paused" : ""}`}>{[10, 20, 13, 27, 18, 32, 16, 25, 12, 22, 15].map((height, index) => <i key={index} style={{ height }} />)}</span>
                    <time>{formatDuration(recordingSeconds)}</time>
                    <button className="stop-button" type="button" onClick={() => toggleRecording("speaking")} aria-label="Stop recording"><Icon name="close" /></button>
                  </div>
                )}
                {!recordingTarget && <p className="privacy-note">Your raw audio is processed temporarily and is not saved.</p>}
              </article>

              <aside className="talk-transcript">
                <p className="activity-label">YOUR PRACTICE</p>
                <h2>{lesson.speakingPrompt}</h2>
                <label className="transcript-field">
                  <span>Confirmed transcript</span>
                  <textarea value={transcript} onChange={(event) => { setTranscript(event.target.value); setSpeakingFeedback(null); }} placeholder="Your recording will appear here. You can also type your response…" rows={5} />
                </label>
                {rawSpeakingTranscript && rawSpeakingTranscript !== transcript && <RawTranscript text={rawSpeakingTranscript} onUse={() => { setTranscript(rawSpeakingTranscript); setSpeakingFeedback(null); }} />}
                {transcriptionError && <p className="transcription-error" role="alert">{transcriptionError}</p>}
                {speakingFeedback && <FeedbackCard feedback={speakingFeedback} modelAnswer={lesson.modelAnswer} />}
                <div className="surface-actions">
                  <Button color="primary" size="lg" loading={assessing} disabled={!transcript.trim()} onClick={confirmTranscript}>Assess my response</Button>
                  <Button color="secondary" variant="outline" size="lg" onClick={() => { setTranscript(""); setSpeakingFeedback(null); }}>Clear</Button>
                </div>
              </aside>
            </div>
            <button className="back-home-button" type="button" onClick={() => setView("today")}>Back to Home</button>
          </section>
        )}

        {view === "lesson" && (
          <section className="surface lesson-surface" aria-labelledby="lesson-title">
            <div className="surface-topline">
              <Badge color={domain === "hotel" ? "info" : "success"} variant="soft" pill>
                {domain === "hotel" ? "Hotel Front Office" : "Restaurant Service"}
              </Badge>
              <button className="text-action" onClick={() => setView("today")}>Exit lesson</button>
            </div>

            <div className="lesson-heading">
              <div>
                <p className="eyebrow">{domain.toUpperCase()} LESSON {lesson.trackNumber}/25 · {lesson.durationMinutes} MIN</p>
                <h1 id="lesson-title">{lesson.title}</h1>
                <p>{lesson.subtitle}</p>
              </div>
              <span className="step-count">{stepIndex + 1}/{steps.length}</span>
            </div>

            <ol className="lesson-stepper" aria-label="Lesson progress">
              {steps.map((step, index) => (
                <li key={step} className={index === stepIndex ? "active" : index < stepIndex ? "done" : ""}>
                  <span>{index < stepIndex ? "✓" : index + 1}</span>
                  <small>{step}</small>
                </li>
              ))}
            </ol>

            {!lessonComplete && currentStep === "Vocabulary" && (
              <div className="activity-panel">
                <p className="activity-label">Vocabulary</p>
                <div className="term-grid">
                  {terms.map((term) => (
                    <article className="term-card" key={term.id}>
                      <div>
                        <strong>{term.term}</strong>
                        <button className="audio-action" onClick={() => play(term.term)} aria-label={`Play ${term.term}`}>▶</button>
                      </div>
                      <p>{term.meaning}</p>
                      <blockquote>“{term.example}”</blockquote>
                      <small>Adapted source · Master Edition p. {term.sourcePage}</small>
                    </article>
                  ))}
                </div>
                <div className="surface-actions end">
                  <Button color="primary" size="lg" onClick={continueStep}>I understand</Button>
                </div>
              </div>
            )}

            {!lessonComplete && currentStep === "Listening" && (
              <div className="activity-panel narrow-panel">
                <p className="activity-label">Listening</p>
                <h2>Listen to the guest</h2>
                <button className="listening-player" onClick={() => play(lesson.guestLine)}>
                  <span className="play-orb">▶</span>
                  <span><strong>Play guest request</strong><small>Normal speed · transcript unlocks after answering</small></span>
                </button>
                <fieldset className="answer-list">
                  <legend>{lesson.listeningQuestion}</legend>
                  {lesson.listeningOptions.map((option, index) => (
                    <button
                      type="button"
                      key={option}
                      className={listeningAnswer === index ? (index === lesson.listeningAnswer ? "correct" : "incorrect") : ""}
                      onClick={() => setListeningAnswer(index)}
                    >
                      <span>{String.fromCharCode(65 + index)}</span>{option}
                    </button>
                  ))}
                </fieldset>
                {listeningAnswer !== null && (
                  <div className="transcript-note">
                    <strong>Guest transcript</strong>
                    <p>“{lesson.guestLine}”</p>
                  </div>
                )}
                <div className="surface-actions end">
                  <Button color="primary" size="lg" disabled={listeningAnswer !== lesson.listeningAnswer} onClick={continueStep}>Continue</Button>
                </div>
              </div>
            )}

            {!lessonComplete && currentStep === "Grammar" && (
              <div className="activity-panel narrow-panel">
                <p className="activity-label">Grammar for service</p>
                <h2>{lesson.grammarPrompt}</h2>
                <div className="answer-list grammar-list">
                  {lesson.grammarOptions.map((option, index) => (
                    <button
                      type="button"
                      key={option}
                      className={grammarAnswer === index ? (index === lesson.grammarAnswer ? "correct" : "incorrect") : ""}
                      onClick={() => setGrammarAnswer(index)}
                    >
                      <span>{String.fromCharCode(65 + index)}</span>{option}
                    </button>
                  ))}
                </div>
                {grammarAnswer !== null && grammarAnswer !== lesson.grammarAnswer && (
                  <p className="error-copy">That response could create an operational risk. Choose a response that checks before confirming.</p>
                )}
                <div className="surface-actions end">
                  <Button color="primary" size="lg" disabled={grammarAnswer !== lesson.grammarAnswer} onClick={continueStep}>Continue</Button>
                </div>
              </div>
            )}

            {!lessonComplete && currentStep === "Speaking" && (
              <div className="activity-panel narrow-panel">
                <p className="activity-label">Speaking · confirmed transcript</p>
                <h2>{lesson.speakingPrompt}</h2>
                <p className="host-hint">Record your answer here. AI converts the audio to text; you can review and edit the transcript before assessment.</p>
                <div className="recording-controls">
                  <button
                    type="button"
                    className={`record-button ${recordingTarget === "speaking" ? "recording" : ""}`}
                    onClick={() => toggleRecording("speaking")}
                    disabled={Boolean(recordingTarget && recordingTarget !== "speaking") || Boolean(transcribingTarget)}
                  >
                    <span aria-hidden="true">{recordingTarget === "speaking" ? "■" : "●"}</span>
                    {recordingTarget === "speaking" ? "Stop recording" : transcribingTarget === "speaking" ? "Transcribing…" : "Record answer"}
                  </button>
                  <small>Raw audio is processed transiently and is not saved to your learning record.</small>
                </div>
                <label className="transcript-field">
                  <span>Your confirmed transcript</span>
                  <textarea
                    value={transcript}
                    onChange={(event) => {
                      setTranscript(event.target.value);
                      setSpeakingFeedback(null);
                    }}
                    placeholder="Type the response you want HospitaLingo to assess…"
                    rows={4}
                  />
                </label>
                {rawSpeakingTranscript && rawSpeakingTranscript !== transcript && (
                  <RawTranscript
                    text={rawSpeakingTranscript}
                    onUse={() => {
                      setTranscript(rawSpeakingTranscript);
                      setSpeakingFeedback(null);
                    }}
                  />
                )}
                {transcriptionError && <p className="transcription-error" role="alert">{transcriptionError}</p>}
                {speakingFeedback && (
                  <FeedbackCard feedback={speakingFeedback} modelAnswer={lesson.modelAnswer} />
                )}
                <div className="surface-actions end">
                  {speakingFeedback?.score && speakingFeedback.score >= 75 && !speakingFeedback.criticalError ? (
                    <Button color="primary" size="lg" onClick={continueStep}>Continue</Button>
                  ) : (
                    <Button color="primary" size="lg" loading={assessing} disabled={!transcript.trim()} onClick={confirmTranscript}>Confirm transcript</Button>
                  )}
                  {speakingFeedback && (
                    <Button color="secondary" variant="outline" size="lg" onClick={() => { setTranscript(""); setSpeakingFeedback(null); }}>Try again</Button>
                  )}
                </div>
              </div>
            )}

            {!lessonComplete && currentStep === "Role Practice" && (
              <div className="activity-panel narrow-panel">
                <p className="activity-label">Role Practice</p>
                <div className="scenario-brief">
                  <Badge color="secondary" variant="outline" pill>You are the {lesson.roleScenario.role}</Badge>
                  <h2>{lesson.roleScenario.guestMessage}</h2>
                  <p><strong>Objective:</strong> {lesson.roleScenario.objective}</p>
                </div>
                <label className="transcript-field">
                  <span>Your response</span>
                  <textarea
                    value={roleResponse}
                    onChange={(event) => {
                      setRoleResponse(event.target.value);
                      setRoleFeedback(null);
                    }}
                    placeholder="Respond to the guest in English…"
                    rows={4}
                  />
                </label>
                <div className="recording-controls compact">
                  <button
                    type="button"
                    className={`record-button ${recordingTarget === "role" ? "recording" : ""}`}
                    onClick={() => toggleRecording("role")}
                    disabled={Boolean(recordingTarget && recordingTarget !== "role") || Boolean(transcribingTarget)}
                  >
                    <span aria-hidden="true">{recordingTarget === "role" ? "■" : "●"}</span>
                    {recordingTarget === "role" ? "Stop recording" : transcribingTarget === "role" ? "Transcribing…" : "Record response"}
                  </button>
                </div>
                {rawRoleTranscript && rawRoleTranscript !== roleResponse && (
                  <RawTranscript
                    text={rawRoleTranscript}
                    onUse={() => {
                      setRoleResponse(rawRoleTranscript);
                      setRoleFeedback(null);
                    }}
                  />
                )}
                {transcriptionError && <p className="transcription-error" role="alert">{transcriptionError}</p>}
                {roleFeedback && <FeedbackCard feedback={roleFeedback} modelAnswer={lesson.modelAnswer} />}
                <div className="surface-actions end">
                  <Button color="primary" size="lg" loading={saving} disabled={!roleResponse.trim()} onClick={finishLesson}>
                    {roleFeedback && roleFeedback.score < 75 ? "Check again" : "Complete lesson"}
                  </Button>
                  {roleFeedback && roleFeedback.score < 75 && (
                    <Button color="secondary" variant="outline" size="lg" onClick={() => { setRoleResponse(""); setRoleFeedback(null); }}>Try again</Button>
                  )}
                </div>
              </div>
            )}

            {lessonComplete && (
              <div className="completion-panel">
                <span className="completion-mark">✓</span>
                <p className="eyebrow">LESSON COMPLETE</p>
                <h2>Good service decision.</h2>
                <p>Your result has been added to the balanced Hotel and Restaurant certificate pathway.</p>
                <div className="completion-score">
                  <span>Hotel <strong>{progress.hotelCompleted}/25</strong></span>
                  <span>Restaurant <strong>{progress.restaurantCompleted}/25</strong></span>
                </div>
                <div className="surface-actions center">
                  <Button color="primary" size="lg" onClick={() => setView("progress")}>View progress</Button>
                  <Button
                    color="secondary"
                    variant="outline"
                    size="lg"
                    onClick={() => resetLesson(progress.hotelCompleted <= progress.restaurantCompleted ? "hotel" : "restaurant")}
                  >
                    Next balanced lesson
                  </Button>
                </div>
              </div>
            )}
          </section>
        )}

        {view === "progress" && (
          <ProgressDashboard progress={progress} totalCompleted={totalCompleted} completionPercent={completionPercent} onClose={() => setView("today")} onContinue={() => resetLesson(progress.hotelCompleted <= progress.restaurantCompleted ? "hotel" : "restaurant")} />
        )}

        {view === "glossary" && (
          <GlossaryBrowser onClose={() => setView("today")} />
        )}

        {view === "users" && currentUser?.role === "admin" && (
          <AccountManager onClose={() => setView("today")} />
        )}
      </section>

      {view !== "talk" && <nav className="bottom-nav" aria-label="Main navigation">
        <button className={view === "today" ? "active" : ""} type="button" onClick={() => setView("today")}><Icon name="home" /><span>Home</span></button>
        <button className={view === "lesson" ? "active" : ""} type="button" onClick={() => resetLesson(domain)}><Icon name="book" /><span>Learn</span></button>
        <button className="nav-talk" type="button" onClick={() => setView("talk")}><Icon name="mic" /><span>Talk</span></button>
        <button className={view === "glossary" ? "active" : ""} type="button" onClick={() => setView("glossary")}><Icon name="search" /><span>Glossary</span></button>
        <button className={view === "progress" ? "active" : ""} type="button" onClick={() => setView("progress")}><Icon name="chart" /><span>Progress</span></button>
      </nav>}
    </main>
  );
}

type HistoryAttempt = {
  id: string;
  lesson_id: string;
  domain: Domain;
  step: "speaking" | "role_practice";
  transcript: string;
  score: number;
  critical_error: number;
  created_at: string;
};

function ProgressDashboard({
  progress,
  totalCompleted,
  completionPercent,
  onClose,
  onContinue,
}: {
  progress: Progress;
  totalCompleted: number;
  completionPercent: number;
  onClose: () => void;
  onContinue: () => void;
}) {
  const [history, setHistory] = useState<HistoryAttempt[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/history?limit=20")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { attempts?: HistoryAttempt[] }) => { if (active) setHistory(data.attempts ?? []); })
      .catch(() => undefined)
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, []);

  const status = progress.certificateStatus ?? (progress.certificateEligible ? "pending" : "locked");
  const statusLabel = status === "approved" ? "Certificate issued" : status === "pending" ? "Awaiting approval" : status === "expired" ? "Reassessment due" : "In progress";
  return (
    <section className="surface certificate-surface" aria-labelledby="certificate-title">
      <div className="surface-topline">
        <Badge color={status === "approved" ? "success" : "secondary"} variant="soft" pill>{statusLabel}</Badge>
        <button className="text-action" onClick={onClose}>Close</button>
      </div>
      <p className="eyebrow">INTERNAL COMPETENCY CERTIFICATE</p>
      <h1 id="certificate-title">Hospitality English Foundations</h1>
      <p className="certificate-intro">Complete all 50 unique lessons. HospitaLingo then sends one certificate request to the administrator for approval.</p>
      <div className="certificate-meter">
        <strong>{totalCompleted}<small>/50</small></strong>
        <span>unique qualifying lessons</span>
        <div className="progress-track"><span style={{ width: `${completionPercent}%` }} /></div>
      </div>
      <div className="requirement-list">
        <Requirement label="Complete 25 Hotel lessons" value={`${progress.hotelCompleted}/25`} done={progress.hotelCompleted >= 25} />
        <Requirement label="Complete 25 Restaurant lessons" value={`${progress.restaurantCompleted}/25`} done={progress.restaurantCompleted >= 25} />
        <Requirement label="Pass every Role Practice at 75+" value={totalCompleted === 50 ? "Passed" : "In progress"} done={totalCompleted === 50} />
        <Requirement label="Approval by Bobi Agusta" value={status === "approved" ? "Approved" : status === "pending" ? "Pending" : "Locked"} done={status === "approved"} />
      </div>
      {status === "approved" && (
        <><article className="issued-certificate">
          <span className="app-mark">H</span><div><small>CERTIFICATE ID</small><strong>{progress.certificateId}</strong>
          <p>Issued {formatDate(progress.certificateIssuedAt)} · Valid until {formatDate(progress.certificateExpiresAt)}</p></div>
        </article><button type="button" className="text-action certificate-print" onClick={() => window.print()}>Print or save certificate as PDF</button></>
      )}
      <div className="certificate-note"><strong>Internal Use Only</strong><span>Valid for 365 days after approval. Transcript-only speaking is accepted; pronunciation and accent are not certified.</span></div>
      <section className="history-section" aria-labelledby="history-title">
        <div className="section-heading"><div><p id="history-title">Practice history</p><span>Confirmed transcripts are private to this account</span></div></div>
        {historyLoading ? <p className="empty-state">Loading your attempts…</p> : history.length ? (
          <div className="history-list">{history.map((attempt) => (
            <details key={attempt.id} className="history-item">
              <summary><span><strong>{lessonTitle(attempt.lesson_id)}</strong><small>{attempt.step === "role_practice" ? "Role Practice" : "Speaking"} · {formatDate(attempt.created_at)}</small></span><b>{attempt.score}</b></summary>
              <p>“{attempt.transcript}”</p>
            </details>
          ))}</div>
        ) : <p className="empty-state">No assessed transcript yet. Complete Speaking or Role Practice to build your history.</p>}
      </section>
      <div className="surface-actions"><Button color="primary" size="lg" onClick={onContinue}>Continue recommended lesson</Button></div>
    </section>
  );
}

function GlossaryBrowser({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [entries, setEntries] = useState<HospitalityTerm[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [total, setTotal] = useState(436);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextQuery = query, nextDepartment = department) => {
    setLoading(true);
    try {
      const parameters = new URLSearchParams({ q: nextQuery, department: nextDepartment, limit: "60" });
      const response = await fetch(`/api/glossary?${parameters}`);
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { entries: HospitalityTerm[]; departments: string[]; total: number };
      setEntries(data.entries); setDepartments(data.departments); setTotal(data.total);
    } finally { setLoading(false); }
  }, [department, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load("", ""); }, 0);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function search(event: FormEvent) { event.preventDefault(); void load(); }
  return (
    <section className="surface glossary-surface" aria-labelledby="glossary-title">
      <div className="surface-topline"><Badge color="info" variant="soft" pill>436 audited terms</Badge><button className="text-action" onClick={onClose}>Close</button></div>
      <p className="eyebrow">HOSPITALITY MASTER EDITION</p>
      <h1 id="glossary-title">Operational glossary</h1>
      <p className="certificate-intro">Search the adapted terminology used by lessons, transcription correction, and AI assessment.</p>
      <form className="glossary-search" onSubmit={search}>
        <label><span>Search terminology</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try: reservation, BEO, food safety…" /></label>
        <label><span>Department</span><select value={department} onChange={(event) => { setDepartment(event.target.value); void load(query, event.target.value); }}><option value="">All departments</option>{departments.map((item) => <option key={item}>{item}</option>)}</select></label>
        <Button type="submit" color="primary">Search</Button>
      </form>
      <p className="glossary-count">{loading ? "Searching…" : `${total} matching term${total === 1 ? "" : "s"} · showing ${entries.length}`}</p>
      <div className="glossary-grid">{entries.map((entry) => (
        <details className="glossary-card" key={entry.id}>
          <summary><span><small>{entry.department}</small><strong>{entry.term}</strong><em>{entry.subcategory}</em></span><span>+</span></summary>
          <div><p>{entry.meaning}</p><h3>Operational use</h3><p>{entry.workplaceUse}</p>{entry.controlNote && <><h3>Control note</h3><p>{entry.controlNote}</p></>}<blockquote>“{entry.example}”</blockquote><small>Adapted source · Master Edition p. {entry.sourcePage} · Entry {entry.sourceNumber}</small></div>
        </details>
      ))}</div>
      {!loading && !entries.length && <p className="empty-state">No term matched that search. Try a shorter phrase or all departments.</p>}
    </section>
  );
}

function lessonTitle(id: string) {
  return id.endsWith("free-practice") ? "Free AI practice" : id.split("-").slice(3).join(" ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function initials(name?: string) {
  return (name || "HL").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function Icon({ name }: { name: string }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const paths: Record<string, ReactNode> = {
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    arrow: <><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    "chevron-left": <path d="m15 18-6-6 6-6"/>,
    hotel: <><path d="M4 21V5h10v16"/><path d="M14 10h6v11M8 9h2M8 13h2M8 17h2M17 14h1M17 18h1M2 21h20"/></>,
    restaurant: <><path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M16 3c-2 3-2 8 1 10v8M17 3v10"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 11v3h4v-3"/></>,
    sparkle: <><path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Z"/><path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14ZM19 13l.6 1.4L21 15l-1.4.6L19 17l-.6-1.4L17 15l1.4-.6L19 13Z"/></>,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></>,
    stop: <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>,
    pause: <><path d="M9 5v14M15 5v14"/></>,
    play: <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none"/>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
    book: <><path d="M4 5a3 3 0 0 1 3-3h5v18H7a3 3 0 0 0-3 2V5Z"/><path d="M20 5a3 3 0 0 0-3-3h-5v18h5a3 3 0 0 1 3 2V5Z"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/></>,
  };
  return <svg {...common}>{paths[name] ?? paths.sparkle}</svg>;
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-brand">
        <span className="auth-mark">H</span>
        <p className="eyebrow">ENGLISH FOR HOSPITALITY</p>
        <h1>Your own practice journey.</h1>
        <p>Build practical English confidence for hotel and restaurant service, one confirmed response at a time.</p>
        <div className="auth-pill-row">
          <span>Vocabulary</span><span>Listening</span><span>Grammar</span><span>Speaking</span><span>Role Practice</span>
        </div>
      </section>
      <section className="auth-card">{children}</section>
    </main>
  );
}

function AuthMessage({ title, copy }: { title: string; copy: string }) {
  return <div className="auth-message"><h2>{title}</h2><p>{copy}</p></div>;
}

function LoginScreen({ onComplete }: { onComplete: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Sign in failed.");
      await onComplete();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <form className="auth-form" onSubmit={submit}>
        <div><p className="eyebrow">WELCOME BACK</p><h2>Sign in to HospitaLingo</h2><p>Your lessons, attempts, and certificate progress stay with this account.</p></div>
        <label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <Button type="submit" color="primary" size="lg" loading={loading} disabled={loading}>Sign in</Button>
        <small>Accounts are created by the HospitaLingo administrator. Public registration is disabled.</small>
      </form>
    </AuthShell>
  );
}

function SetupScreen({ setupAvailable, onComplete }: { setupAvailable: boolean; onComplete: () => Promise<void> }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, email, password, setupToken }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Setup failed.");
      await onComplete();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Setup failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <form className="auth-form" onSubmit={submit}>
        <div><p className="eyebrow">ONE-TIME SETUP</p><h2>Create the administrator</h2><p>This first account can create and review learner accounts.</p></div>
        {!setupAvailable && <p className="auth-warning">Add the secret <strong>HOSPITALINGO_SETUP_TOKEN</strong> in Cloudflare before continuing.</p>}
        <label><span>Your name</span><input autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>
        <label><span>Admin email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label><span>Admin password</span><input type="password" autoComplete="new-password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /><small>At least 10 characters with a letter and a number.</small></label>
        <label><span>Cloudflare setup token</span><input type="password" value={setupToken} onChange={(event) => setSetupToken(event.target.value)} required /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <Button type="submit" color="primary" size="lg" loading={loading} disabled={loading || !setupAvailable}>Create administrator</Button>
      </form>
    </AuthShell>
  );
}

function ChangePasswordScreen({ user, onComplete }: { user: AppUser; onComplete: () => Promise<void> }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Password could not be changed.");
      await onComplete();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Password could not be changed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <form className="auth-form" onSubmit={submit}>
        <div><p className="eyebrow">SECURE YOUR ACCOUNT</p><h2>Choose your own password</h2><p>Hi {user.displayName}. Replace the temporary password before starting your journey.</p></div>
        <label><span>Temporary password</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
        <label><span>New password</span><input type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><small>At least 10 characters with a letter and a number.</small></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <Button type="submit" color="primary" size="lg" loading={loading} disabled={loading}>Save new password</Button>
      </form>
    </AuthShell>
  );
}

type ManagedUser = {
  id: string;
  email: string;
  display_name: string;
  role: "admin" | "learner";
  status: string;
  must_change_password: number;
  hotel_completed: number;
  restaurant_completed: number;
  last_login_at: string | null;
};

type ManagedCertificate = {
  id: string;
  learner_id: string;
  status: "pending" | "approved" | "expired";
  requested_at: string;
  issued_at: string | null;
  expires_at: string | null;
  display_name: string;
  email: string;
  hotel_completed: number;
  restaurant_completed: number;
};

async function fetchManagedUsers() {
  const response = await fetch("/api/admin/users");
  if (!response.ok) throw new Error("Accounts could not be loaded.");
  const data = (await response.json()) as { users: ManagedUser[] };
  return data.users;
}

async function fetchManagedCertificates() {
  const response = await fetch("/api/admin/certificates");
  if (!response.ok) throw new Error("Certificate requests could not be loaded.");
  const data = (await response.json()) as { certificates: ManagedCertificate[] };
  return data.certificates;
}

function AccountManager({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [certificates, setCertificates] = useState<ManagedCertificate[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([fetchManagedUsers(), fetchManagedCertificates()])
      .then(([userResult, certificateResult]) => { if (active) { setUsers(userResult); setCertificates(certificateResult); } })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Accounts could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function generatePassword() {
    const value = `HL-${crypto.randomUUID().slice(0, 8)}-9a`;
    setTemporaryPassword(value);
  }

  async function createAccounts(accounts: Array<{ displayName: string; email: string; temporaryPassword: string }>) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ users: accounts }),
      });
      const data = (await response.json()) as { created?: string[]; errors?: Array<{ email: string; error: string }>; error?: string };
      if (!response.ok) throw new Error(data.error || "Accounts could not be created.");
      setMessage(`${data.created?.length ?? 0} account(s) created${data.errors?.length ? `; ${data.errors.length} skipped` : ""}.`);
      setUsers(await fetchManagedUsers());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Accounts could not be created.");
    } finally {
      setLoading(false);
    }
  }

  async function createOne(event: FormEvent) {
    event.preventDefault();
    await createAccounts([{ displayName, email, temporaryPassword }]);
    setDisplayName("");
    setEmail("");
    setTemporaryPassword("");
  }

  async function importBulk() {
    const accounts = bulkText
      .split(/\r?\n/)
      .map((line) => line.split(",").map((value) => value.trim()))
      .filter((parts) => parts.length >= 3 && parts[1].includes("@"))
      .slice(0, 100)
      .map(([name, accountEmail, password]) => ({ displayName: name, email: accountEmail, temporaryPassword: password }));
    if (!accounts.length) {
      setMessage("Use one account per line: Name,email,password");
      return;
    }
    await createAccounts(accounts);
    setBulkText("");
  }

  async function approve(id: string) {
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/admin/certificates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ certificateId: id, action: "approve" }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Certificate could not be approved.");
      setCertificates(await fetchManagedCertificates());
      setMessage("Certificate approved and valid for 365 days.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Certificate could not be approved."); }
    finally { setLoading(false); }
  }

  return (
    <section className="surface account-surface" aria-labelledby="account-title">
      <div className="surface-topline"><Badge color="info" variant="soft" pill>{users.length}/500 accounts</Badge><button className="text-action" onClick={onClose}>Close</button></div>
      <div className="account-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1 id="account-title">Learner accounts</h1><p>Each learner receives a private journey, transcript history, progress, and certificate pathway.</p></div></div>
      <form className="account-create" onSubmit={createOne}>
        <label><span>Name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>
        <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label className="password-create"><span>Temporary password</span><div><input value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} minLength={10} required /><button type="button" className="text-action" onClick={generatePassword}>Generate</button></div></label>
        <Button type="submit" color="primary" loading={loading}>Create account</Button>
      </form>
      <details className="bulk-import">
        <summary>Import up to 100 accounts</summary>
        <p>Paste one account per line using: <strong>Name,email,password</strong></p>
        <textarea rows={5} value={bulkText} onChange={(event) => setBulkText(event.target.value)} placeholder={'Ayu,ayu@example.com,Welcome2026!\nBima,bima@example.com,Welcome2026!'} />
        <Button type="button" color="secondary" variant="outline" onClick={importBulk} loading={loading}>Import accounts</Button>
      </details>
      {message && <p className="account-message" role="status">{message}</p>}
      <section className="certificate-approvals">
        <div className="section-heading"><div><p>Certificate approvals</p><span>Issued certificates remain valid for 365 days</span></div><Badge color="secondary" variant="soft" pill>{certificates.filter((item) => item.status === "pending").length} pending</Badge></div>
        {certificates.length ? <div className="account-table-wrap"><table className="account-table"><thead><tr><th>Learner</th><th>Completion</th><th>Status</th><th>Action</th></tr></thead><tbody>{certificates.map((certificate) => <tr key={certificate.id}><td><strong>{certificate.display_name}</strong><small>{certificate.email}</small></td><td>{certificate.hotel_completed}/25 H · {certificate.restaurant_completed}/25 R</td><td>{certificate.status}</td><td>{certificate.status === "pending" ? <Button type="button" color="primary" onClick={() => approve(certificate.id)} disabled={loading}>Approve</Button> : certificate.expires_at ? `Until ${formatDate(certificate.expires_at)}` : "—"}</td></tr>)}</tbody></table></div> : <p className="empty-state">No learner has completed all 50 lessons yet.</p>}
      </section>
      <div className="account-table-wrap">
        <table className="account-table">
          <thead><tr><th>Learner</th><th>Role</th><th>Hotel</th><th>Restaurant</th><th>Account</th></tr></thead>
          <tbody>{users.map((user) => (
            <tr key={user.id}>
              <td><strong>{user.display_name}</strong><small>{user.email}</small></td>
              <td>{user.role}</td><td>{user.hotel_completed}/25</td><td>{user.restaurant_completed}/25</td>
              <td>{user.must_change_password ? "Temporary password" : user.last_login_at ? "Active" : "Invited"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

function FeedbackCard({
  feedback,
  modelAnswer,
}: {
  feedback: Assessment;
  modelAnswer: string;
}) {
  return (
    <div className={`feedback-card ${feedback.criticalError ? "critical" : feedback.score >= 75 ? "ready" : "developing"}`}>
      <div className="feedback-heading">
        <div><strong>{feedback.status}</strong><span>{feedback.criticalError ? "Operational safety needs attention" : "Confirmed transcript assessment"}</span></div>
        <b>{feedback.score}</b>
      </div>
      {feedback.corrections.length > 0 ? (
        <ol>{feedback.corrections.map((correction) => <li key={correction}>{correction}</li>)}</ol>
      ) : (
        <p>Your response is polite, clear, and operationally safe.</p>
      )}
      <div className="model-answer"><strong>Natural model response</strong><p>“{feedback.modelAnswer ?? modelAnswer}”</p></div>
      <small className="assessment-source">{feedback.provider === "cloudflare-workers-ai" ? "Assessed by HospitaLingo AI" : "Safety-rubric fallback"}</small>
    </div>
  );
}

function Button({
  children,
  loading,
  color = "primary",
  variant = "solid",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loading?: boolean;
  color?: "primary" | "secondary";
  variant?: "solid" | "outline";
  size?: "md" | "lg";
}) {
  return (
    <button {...props} className={`product-button ${color} ${variant} ${size}`}>
      {loading ? "Working…" : children}
    </button>
  );
}

function Badge({
  children,
  color = "secondary",
}: {
  children: ReactNode;
  color?: "secondary" | "success" | "info";
  variant?: "soft" | "outline";
  pill?: boolean;
}) {
  return <span className={`product-badge ${color}`}>{children}</span>;
}

function Requirement({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <div className="requirement-row">
      <span className={done ? "done" : "pending"}>{done ? "✓" : "○"}</span>
      <strong>{label}</strong>
      <small>{value}</small>
    </div>
  );
}

function RawTranscript({ text, onUse }: { text: string; onUse: () => void }) {
  return (
    <details className="raw-transcript">
      <summary>Compare raw transcription</summary>
      <p>“{text}”</p>
      <button type="button" className="text-action" onClick={onUse}>Use raw version</button>
    </details>
  );
}
