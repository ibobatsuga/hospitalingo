# HospitaLingo

HospitaLingo is a standalone English learning app for hotel and restaurant work. Its application architecture is Cloudflare-native: the product owns the learning experience while Cloudflare provides AI inference, speech recognition, storage, and server-side logic. Learners never need to connect a personal ChatGPT or Gemini account.

## Prototype scope

- Five learning categories: Vocabulary, Listening, Grammar, Speaking, and Role Practice
- Balanced 50-lesson certificate path: 25 Hotel and 25 Restaurant lessons
- In-app microphone recording and Cloudflare speech-to-text
- Transcript confirmation before Cloudflare AI assessment
- Operational safety checks for allergy and room-availability scenarios
- Searchable 436-entry operational glossary grounded in *Hospitality Operations & Governance - Master Edition*
- Selective glossary retrieval for every AI assessment and transcription request
- D1-backed learner progress
- R2 content storage binding for approved book adaptations and lesson audio
- Deterministic certificate and safety rules, independent from model output
- Rules-based fallback so core lessons remain usable during an AI outage
- Internal email/password accounts with secure server sessions
- Separate D1-backed transcript history, unique lesson completion, progress, and certificate journey for every learner
- One owner approval queue with certificates valid for 365 days
- Free-tier guardrails: 30 AI assessments and 5 transcriptions per learner per day, with typed practice always available; the administrator receives a larger testing allowance
- Administrator account creation and CSV import for up to 100 learners per batch

## Run locally

```bash
npm install
npm run dev
```

The local browser preview uses a demo administrator. Production uses HospitaLingo's internal invitation-only accounts stored in D1.

## Cloudflare AI configuration

The Worker supports either a native Workers AI binding named `AI` or these owner-managed server environment values:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_AI_TOKEN`

These values belong to the HospitaLingo deployment. They are never requested from learners or exposed to the browser. Without either configuration, the app clearly reports preview mode, keeps deterministic safety assessment available, and disables speech transcription.

## First administrator setup

1. In Cloudflare, open the `hospitalingo` Worker and add an encrypted runtime secret named `HOSPITALINGO_SETUP_TOKEN`.
2. Open the deployed app. When the D1 account database is empty, HospitaLingo shows the one-time administrator setup page.
3. Enter the same setup token, the administrator email, and a strong password.
4. After setup, use **Manage accounts** to create learners individually or paste up to 100 `Name,email,password` rows per import.

Learner passwords are PBKDF2-hashed with unique salts. Browser sessions use random tokens stored only as hashes in D1 and sent through HttpOnly, SameSite cookies. Five failed logins temporarily lock that email/IP combination for 15 minutes. Public self-registration is disabled.

## Validate

```bash
npm test
npm run lint
```

## Terminology source

The converted master terminology source is stored in `content/HOSPITALITY-MASTER.md`. Regenerate it from the extracted PDF text with:

```bash
HOSPITALITY_CONVERSION_DATE=YYYY-MM-DD node scripts/convert-hospitality-master.mjs
npm run content:build
```

The PDF metadata and table of contents declare 356 terms, while the document body contains 436 complete entries because source numbers 81-160 are used twice for different terminology sets. The converter preserves both sets and fails validation if entries or required sections are lost. `content:build` creates a compact, reproducible application dataset with unique IDs, department metadata, adapted excerpts, control notes, and page provenance. The AI receives only the three lesson terms, never the 1.8 MB source document.

The detailed product and architecture decisions live in `docs/PRD-HOSPITALINGO.md`.

For Git-connected Cloudflare Workers builds, the app provisions D1 automatically and binds Workers AI as `AI`. The complete Markdown source and generated compact glossary are versioned in this private product repository; D1 stores learner-specific records. R2 remains optional for a private PDF archive or future generated audio, and raw learner recordings are deliberately not retained.
