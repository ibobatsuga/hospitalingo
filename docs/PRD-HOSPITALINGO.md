# HospitaLingo Product Requirements Document

## 1. Product decision

HospitaLingo is a standalone, Cloudflare-native English learning application for hospitality. It serves students, trainees, and active hotel or restaurant workers in the owner's internal community.

Learners do not connect ChatGPT, Gemini, personal API keys, passwords, or AI subscriptions. HospitaLingo's Cloudflare account provides the AI capability centrally. A future ChatGPT connector may be added as an optional channel, but it is not part of the core product architecture or MVP dependency.

## 2. Product outcomes

HospitaLingo must help learners:

1. Understand approved hotel and restaurant terminology.
2. Listen to realistic guest and colleague communication.
3. Produce operationally safe and natural English.
4. Practice unpredictable hotel and restaurant scenarios.
5. Complete a balanced 50-lesson pathway and earn an internal competency certificate.

The product is not a general-purpose chatbot, an accent certification system, or an external professional accreditation body.

## 3. Audience and scope

- Primary users: hospitality students, trainees, and active workers.
- Domain mix: 25 Hotel lessons and 25 Restaurant lessons.
- Lesson order: balanced recommendation with randomized scenarios inside each domain.
- Distribution: internal use by invitation.
- Alpha target: up to 25 users.
- Beta target: up to 100 users.
- Content administration, review, and certificate approval: Bobi Agusta.
- Properties cannot upload their own SOP or terminology in MVP.

## 4. Learning experience

Every lesson contains five ordered activities:

1. **Vocabulary** — adapted approved hospitality terminology, meaning, workplace use, and example.
2. **Listening** — guest or colleague audio followed by a comprehension decision.
3. **Grammar** — workplace English that rewards clarity and operational accuracy.
4. **Speaking** — learner records or types an answer, confirms the transcript, and receives feedback.
5. **Role Practice** — learner responds to a hotel or restaurant scenario and must meet the safety threshold.

The interface remains conversation-led and visually familiar to users of modern AI chat products, but it runs as a standalone HospitaLingo web/PWA experience.

## 5. Cloudflare-native architecture

### Client

- Responsive web/PWA interface for smartphones and laptops.
- Browser microphone capture through `MediaRecorder`.
- Transcript review is mandatory before assessment.
- Typed transcript remains available when recording is unsupported or permission is denied.

### Server and AI

- **Cloudflare Workers**: API orchestration, validation, access checks, lesson logic, and rate limits.
- **Workers AI text model**: speaking feedback, natural model answers, role character, and adaptive hints.
- **Workers AI Whisper**: speech-to-text for recorded answers.
- **Build-time glossary index**: exact and partial retrieval over 436 approved terminology entries. Vectorize is deferred until content volume or search-quality benchmarks justify it.
- **D1**: learner identity mapping, attempts, progress, scores, approvals, and certificate records.
- **Git content storage / optional R2**: the canonical Markdown and generated compact artifact are versioned with the application; R2 is optional for the private PDF archive, lesson audio, or generated certificate files.
- **AI Gateway**: usage visibility, caching where safe, rate limits, and cost controls.

### Request flow

1. The learner opens HospitaLingo and starts the recommended balanced lesson.
2. Static lesson rules and approved terms are loaded.
3. For AI tasks, the Worker retrieves only relevant approved terminology.
4. The Worker sends the task, rubric, confirmed transcript, and retrieved context to Workers AI.
5. Deterministic safety rules validate the model output and can cap or reject an unsafe score.
6. D1 records the confirmed result; raw microphone audio is not retained by default.

### Identity and account isolation

- HospitaLingo uses internal administrator-created accounts; public self-registration is disabled.
- The first administrator is created through a one-time Cloudflare runtime setup token.
- An administrator can create individual learners or import up to 100 accounts per batch.
- Every learner receives an immutable user ID. Progress, attempts, transcripts, and certificate records are keyed to that ID, not to browser storage.
- Passwords are stored only as salted PBKDF2 hashes. Session tokens are random, stored as hashes in D1, expire after seven days, and are delivered with HttpOnly, SameSite cookies.
- New learners must replace their temporary password after first login.
- Repeated failed logins trigger a temporary lock. AI and progress endpoints reject unauthenticated production requests.

## 6. Content grounding

The source book *Hospitality Operations & Governance — Master Edition* is a controlled editorial source, not a document shown verbatim to learners.

Content pipeline:

1. Extract source text and page references.
2. Select terminology relevant to hotel and restaurant work.
3. Adapt definitions and examples for English learning.
4. Review and approve every published content unit.
5. Store canonical content and provenance metadata.
6. Generate a compact, uniquely keyed glossary artifact from all 436 body entries.
7. Retrieve only the three approved units attached to the active lesson for each AI request.

The model must not invent a source citation or treat unapproved raw extraction as final learning material.

## 7. AI responsibilities and safeguards

AI may:

- explain vocabulary;
- propose context-grounded examples;
- transcribe learner speech;
- identify language improvements;
- generate role-practice turns;
- suggest a natural model response.

Deterministic application logic must control:

- lesson completion;
- the 25/25 Hotel–Restaurant balance;
- minimum passing score;
- critical operational errors;
- certificate eligibility and expiry;
- owner approval;
- audit history and access permissions.

For allergy and availability scenarios, a model result cannot override the application safety rule. An operationally unsafe response cannot pass even if its grammar is excellent.

## 8. Speaking and recording policy

- Transcript-only submissions are accepted.
- Learners may record inside the app when microphone support is available.
- The learner must see and confirm the transcript before scoring.
- Raw recordings are processed transiently and are not saved by default.
- The confirmed transcript, rubric result, score, and timestamp may be retained for learning records.
- MVP feedback assesses language and service decisions; it does not certify accent or pronunciation accuracy.

## 9. Certificate policy

Certificate name: **Hospitality English Foundations — Internal Competency Certificate**.

Eligibility requires:

- 25 qualifying Hotel lessons;
- 25 qualifying Restaurant lessons;
- passing Hotel and Restaurant final Role Practices;
- final score of at least 75;
- no unresolved critical operational error;
- approval by Bobi Agusta.

The certificate is valid for 365 days from approval. Reassessment opens 30 days before expiry. Renewal requires two current final Role Practices, a score of at least 75 in each domain, and renewed approval. An expired certificate remains visible in history but is not shown as active.

## 10. Reliability, cost, and privacy

- Apply per-user daily limits to transcription and generative activities.
- Show a clear retry or typed-transcript route when speech recognition fails.
- Keep a deterministic lesson and safety fallback if Workers AI is unavailable.
- Never expose Cloudflare credentials in client code.
- Minimize personal data and avoid storing raw recordings unless a later approved requirement needs them.
- Log model, rubric version, content version, and result source for auditability.

## 11. Delivery phases

### Phase 1 — Cloudflare-native alpha

- Standalone UI, five activity types, microphone recording, Whisper transcription, AI assessment, D1 progress, deterministic safety checks, and 50-lesson pathway structure.
- Seed reviewed terminology for both domains.
- Owner-only certificate approval.

### Phase 2 — Grounded beta

- Full approved content ingestion, Vectorize retrieval, R2 lesson audio, user invitations, AI usage dashboard, final assessments, and certificate generation.
- Evaluate at least 30 benchmark scenarios: 10 Hotel, 10 Restaurant, and 10 safety/edge cases.

### Phase 3 — Operational hardening

- Expanded reviewed lessons, reassessment workflow, content versioning, audit exports, accessibility review, cost alerts, and optional ChatGPT channel.

## 12. Acceptance criteria for the architecture change

- No learner setup mentions ChatGPT, Gemini, API keys, or personal AI accounts.
- The product exposes direct Cloudflare AI assessment and transcription routes.
- Recording works in supported browsers and typed transcripts remain available.
- AI unavailability never bypasses safety or certificate rules.
- D1 remains the authoritative account, transcript, completion, and certificate store; source content is versioned and R2 remains optional for private blobs.
- The UI identifies whether Cloudflare AI is connected or running in preview fallback mode.
