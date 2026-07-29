# HospitaLingo

HospitaLingo is an internal English learning app for hotel and restaurant work. The prototype combines a ChatGPT-native MCP surface with a browser preview for local and private testing.

## Prototype scope

- Five learning categories: Vocabulary, Listening, Grammar, Speaking, and Role Practice
- Balanced 50-lesson certificate path: 25 Hotel and 25 Restaurant lessons
- Transcript confirmation before speaking assessment
- Operational safety checks for allergy and room-availability scenarios
- Adapted terminology grounded in *Hospitality Operations & Governance - Master Edition*
- D1-backed learner progress
- MCP tools and an inline MCP Apps UI resource at `/mcp`
- ChatGPT-native components from `@openai/apps-sdk-ui`

## Run locally

```bash
npm install
npm run dev
```

The local browser preview uses a demo learner. Hosted internal users are identified through the platform-provided `oai-authenticated-user-email` header.

## Validate

```bash
npm test
npm run lint
```

## ChatGPT developer-mode connection

1. Host the app at a stable HTTPS origin.
2. Add the Streamable HTTP endpoint `https://YOUR_HOST/mcp` in ChatGPT developer mode.
3. Verify the seven HospitaLingo tools and the `hospitalingo-learning-card` UI resource.
4. Test direct prompts such as “Start my HospitaLingo lesson” and “Show my certificate progress.”

The prototype never asks for a ChatGPT password, session token, or personal OpenAI API key.

