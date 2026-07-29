# HospitaLingo

HospitaLingo is a standalone English learning app for hotel and restaurant work. Its application architecture is Cloudflare-native: the product owns the learning experience while Cloudflare provides AI inference, speech recognition, storage, and server-side logic. Learners never need to connect a personal ChatGPT or Gemini account.

## Prototype scope

- Five learning categories: Vocabulary, Listening, Grammar, Speaking, and Role Practice
- Balanced 50-lesson certificate path: 25 Hotel and 25 Restaurant lessons
- In-app microphone recording and Cloudflare speech-to-text
- Transcript confirmation before Cloudflare AI assessment
- Operational safety checks for allergy and room-availability scenarios
- Adapted terminology grounded in *Hospitality Operations & Governance - Master Edition*
- D1-backed learner progress
- R2 content storage binding for approved book adaptations and lesson audio
- Deterministic certificate and safety rules, independent from model output
- Rules-based fallback so core lessons remain usable during an AI outage

## Run locally

```bash
npm install
npm run dev
```

The local browser preview uses a demo learner. Hosted internal users are identified by the hosting access layer. For a direct Cloudflare deployment, configure the equivalent server-side identity policy before production use.

## Cloudflare AI configuration

The Worker supports either a native Workers AI binding named `AI` or these owner-managed server environment values:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_AI_TOKEN`

These values belong to the HospitaLingo deployment. They are never requested from learners or exposed to the browser. Without either configuration, the app clearly reports preview mode, keeps deterministic safety assessment available, and disables speech transcription.

## Validate

```bash
npm test
npm run lint
```

The detailed product and architecture decisions live in `docs/PRD-HOSPITALINGO.md`.
