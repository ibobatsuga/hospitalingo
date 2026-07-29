"use client";

import { FormEvent, type ButtonHTMLAttributes, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { getLesson, getTerms, scoreHospitalityResponse, type Domain } from "../lib/content";

type Progress = {
  hotelCompleted: number;
  restaurantCompleted: number;
  currentLesson: number;
  certificateEligible: boolean;
};

type Step = "Vocabulary" | "Listening" | "Grammar" | "Speaking" | "Role Practice";
type RecordingTarget = "speaking" | "role";
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
  const [view, setView] = useState<"today" | "lesson" | "progress">("today");
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
  const [transcribingTarget, setTranscribingTarget] = useState<RecordingTarget | null>(null);
  const [composer, setComposer] = useState("");
  const [notice, setNotice] = useState("Your Cloudflare-powered learning plan is ready.");
  const [aiAvailable, setAiAvailable] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lesson = useMemo(() => getLesson(domain, progress.currentLesson), [domain, progress.currentLesson]);
  const terms = useMemo(() => getTerms(lesson.termIds), [lesson.termIds]);
  const currentStep = steps[stepIndex];
  const totalCompleted = progress.hotelCompleted + progress.restaurantCompleted;
  const completionPercent = Math.min(100, Math.round((totalCompleted / 50) * 100));

  useEffect(() => {
    fetch("/api/progress")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: Progress) => {
        setProgress(data);
        setDomain(data.hotelCompleted <= data.restaurantCompleted ? "hotel" : "restaurant");
      })
      .catch(() => setNotice("Demo progress is active. Your hosted account will sync automatically."));
    fetch("/api/ai-status")
      .then((response) => response.json())
      .then((data: { available?: boolean }) => setAiAvailable(Boolean(data.available)))
      .catch(() => setAiAvailable(false));
  }, []);

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
          prompt: task === "speaking" ? lesson.speakingPrompt : lesson.roleScenario.guestMessage,
          safetyRule: lesson.roleScenario.safetyRule,
        }),
      });
      if (!response.ok) throw new Error("Assessment unavailable");
      const feedback = (await response.json()) as Assessment;
      if (feedback.provider === "rules-fallback") {
        setNotice("Cloudflare AI is not connected in this deployment, so the safety rubric was used as a fallback.");
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
    try {
      const form = new FormData();
      form.append("audio", blob, blob.type.includes("mp4") ? "hospitalingo-recording.m4a" : "hospitalingo-recording.webm");
      form.append("domain", domain);
      form.append("prompt", target === "speaking" ? lesson.speakingPrompt : lesson.roleScenario.guestMessage);
      form.append("terms", terms.map((term) => term.term).join(", "));
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const payload = (await response.json()) as { text?: string; rawText?: string; normalized?: boolean; error?: string };
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
          ? "Cloudflare transcribed the recording and corrected likely hospitality-term errors. Compare the raw version before assessment."
          : "Recording transcribed by Cloudflare AI. Review the transcript before assessment.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The recording could not be transcribed. You can type the transcript instead.");
    } finally {
      setTranscribingTarget(null);
    }
  }

  async function toggleRecording(target: RecordingTarget) {
    if (recordingTarget && recorderRef.current) {
      recorderRef.current.stop();
      return;
    }
    if (!("MediaRecorder" in window) || !navigator.mediaDevices?.getUserMedia) {
      setNotice("Microphone recording is not supported by this browser. You can type the confirmed transcript instead.");
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
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        recorderRef.current = null;
        setRecordingTarget(null);
        void transcribeRecording(blob, target);
      };
      recorder.start(250);
      recordingTimeoutRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 60_000);
      setRecordingTarget(target);
      setNotice("Recording… Speak naturally, then tap Stop recording.");
    } catch {
      setNotice("Microphone permission was not granted. You can type the confirmed transcript instead.");
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
        }),
      });
      if (response.ok) setProgress(await response.json());
      else {
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
      }
      setLessonComplete(true);
      setNotice("Lesson completed. Your confirmed transcript and result were recorded.");
    } catch {
      setNotice("Lesson completed in demo mode. Progress will sync when storage is available.");
      setLessonComplete(true);
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

  return (
    <main className="app-frame">
      <header className="app-header">
        <button className="app-identity" onClick={() => setView("today")} aria-label="Open HospitaLingo home">
          <span className="app-mark">H</span>
          <span>
            <strong>HospitaLingo</strong>
            <small>English for Hotel &amp; Restaurant</small>
          </span>
        </button>
        <Badge color={aiAvailable ? "success" : "secondary"} variant="soft" pill>
          {aiAvailable ? "Cloudflare AI connected" : "Cloudflare AI preview"}
        </Badge>
      </header>

      <section className="conversation" aria-live="polite">
        <article className="assistant-turn">
          <div className="assistant-avatar" aria-hidden="true">H</div>
          <div className="turn-content">
            <p className="assistant-name">HospitaLingo</p>
            <p>{notice}</p>
          </div>
        </article>

        {view === "today" && (
          <section className="surface today-card" aria-labelledby="today-title">
            <div className="surface-topline">
              <Badge color={domain === "hotel" ? "info" : "success"} variant="soft" pill>
                {domain === "hotel" ? "Hotel Service" : "Restaurant Service"}
              </Badge>
              <span>Lesson {Math.min(50, progress.currentLesson)} of 50</span>
            </div>
            <div className="today-copy">
              <p className="eyebrow">RECOMMENDED NEXT</p>
              <h1 id="today-title">{lesson.title}</h1>
              <p>{lesson.subtitle}. Complete all five learning steps in about {lesson.durationMinutes} minutes.</p>
            </div>
            <div className="progress-block">
              <div className="progress-label">
                <span>Certificate pathway</span>
                <strong>{totalCompleted}/50 lessons</strong>
              </div>
              <div className="progress-track" aria-label={`${completionPercent}% complete`}>
                <span style={{ width: `${completionPercent}%` }} />
              </div>
              <div className="domain-counts">
                <span>Hotel {progress.hotelCompleted}/25</span>
                <span>Restaurant {progress.restaurantCompleted}/25</span>
              </div>
            </div>
            <div className="surface-actions">
              <Button color="primary" size="lg" onClick={() => resetLesson(domain)}>Continue lesson</Button>
              <Button color="secondary" variant="outline" size="lg" onClick={() => setView("progress")}>View progress</Button>
            </div>
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
                <p className="eyebrow">LESSON {Math.min(50, progress.currentLesson)} · {lesson.durationMinutes} MIN</p>
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
                <p className="host-hint">Record your answer here. Cloudflare converts the audio to text; you can review and edit the transcript before assessment.</p>
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
          <section className="surface certificate-surface" aria-labelledby="certificate-title">
            <div className="surface-topline">
              <Badge color={progress.certificateEligible ? "success" : "secondary"} variant="soft" pill>
                {progress.certificateEligible ? "Eligible" : "In progress"}
              </Badge>
              <button className="text-action" onClick={() => setView("today")}>Close</button>
            </div>
            <p className="eyebrow">INTERNAL COMPETENCY CERTIFICATE</p>
            <h1 id="certificate-title">Hospitality English Foundations</h1>
            <p className="certificate-intro">Complete the balanced pathway, pass both final Role Practices, and receive approval from Bobi Agusta.</p>
            <div className="certificate-meter">
              <strong>{totalCompleted}<small>/50</small></strong>
              <span>qualifying lessons</span>
              <div className="progress-track"><span style={{ width: `${completionPercent}%` }} /></div>
            </div>
            <div className="requirement-list">
              <Requirement label="Complete 25 Hotel lessons" value={`${progress.hotelCompleted}/25`} done={progress.hotelCompleted >= 25} />
              <Requirement label="Complete 25 Restaurant lessons" value={`${progress.restaurantCompleted}/25`} done={progress.restaurantCompleted >= 25} />
              <Requirement label="Pass Hotel final Role Practice" value="Locked" done={false} />
              <Requirement label="Pass Restaurant final Role Practice" value="Locked" done={false} />
              <Requirement label="Minimum final score 75" value="Pending" done={false} />
              <Requirement label="Approval by Bobi Agusta" value="Pending" done={false} />
            </div>
            <div className="certificate-note">
              <strong>Internal Use Only</strong>
              <span>Valid for 365 days after approval. Transcript-only speaking is accepted; pronunciation and accent are not certified.</span>
            </div>
            <div className="surface-actions">
              <Button color="primary" size="lg" onClick={() => resetLesson(progress.hotelCompleted <= progress.restaurantCompleted ? "hotel" : "restaurant")}>
                Continue recommended lesson
              </Button>
            </div>
          </section>
        )}
      </section>

      <form className="preview-composer" onSubmit={handleComposer}>
          <label htmlFor="composer">Ask HospitaLingo</label>
          <div>
            <input
              id="composer"
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              placeholder="Start lesson, hotel practice, or show progress…"
            />
            <button type="submit" aria-label="Send">↑</button>
          </div>
          <small>Standalone HospitaLingo · AI and speech powered by Cloudflare</small>
        </form>
    </main>
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
      <small className="assessment-source">{feedback.provider === "cloudflare-workers-ai" ? "Assessed by Cloudflare AI" : "Safety-rubric fallback"}</small>
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
