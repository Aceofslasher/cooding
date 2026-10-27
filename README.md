# Loopwise

Loopwise is a small programming-learning workspace for students. It combines short JavaScript lessons, a Monaco editor, sandboxed browser previews, a contextual tutor, and a learning record that grows from real student activity.

## What works

- Responsive dashboard, learning path, lessons, practice, playground, tutor, progress, history, and profile pages.
- Eight sample JavaScript lessons spanning beginner, intermediate, and advanced topics, plus three practice exercises and short knowledge checks. These are educational starter content, not student results.
- Monaco editing, JavaScript execution in a sandboxed browser frame, and restricted HTML/CSS previews.
- A local tutor response mode that gives contextual hints without requiring an API key.
- Local progress, lesson completion, exercise attempts, tutor messages, and preferences stored in the browser.
- Optional Supabase email sign-up/sign-in and cloud sync for profile settings, lesson progress, coding attempts, and quiz scores. Hosted AI and Python endpoints require Supabase token-verification settings and a student access token.
- Optional Vercel endpoints for an OpenAI-compatible AI provider and server-side Python execution through Judge0.
- Supabase schema, RLS policies, indexes, starter course content, exercises, and non-public test records.

## Requirements

- Node.js 20.19+ or 22.12+ and npm.
- A Supabase project for accounts and cloud persistence (optional).
- An OpenAI-compatible chat-completions API key for live AI tutoring (optional; Supabase auth is required for hosted access).
- A Judge0-compatible host and server API key for Python execution (optional; Supabase auth is required for hosted access).

## Run locally

```powershell
npm install
npm run dev
```

Open the URL Vite prints, normally `http://localhost:5173`. Without credentials, lessons, JavaScript practice, progress tracking, and demo tutor replies work locally. Progress is kept in this browser's local storage.

Vite's development server does not run Vercel serverless functions. To exercise `/api/tutor` and `/api/execute` locally, install/use the Vercel CLI, set `VITE_ENABLE_SERVERLESS=true` in `.env.local`, and run `npx vercel dev` after linking the project. Without that setting, AI uses its labeled demo response and Python explains how to start the configured runner.

## Configure Supabase

1. Create a Supabase project and open its SQL Editor.
2. Run [`supabase/migrations/202610270001_initial_schema.sql`](supabase/migrations/202610270001_initial_schema.sql).
3. In Authentication settings, enable email/password sign-in and set the local Site URL to `http://localhost:5173` (or the Vercel preview URL when deployed).
4. Copy `.env.example` to `.env.local`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using the project's URL and public anon/publishable key.
5. Restart the dev server. Create an account from Profile & settings. New accounts receive a profile row through the database trigger.

RLS is enabled on every table. Published learning content is readable to visitors; student records require an authenticated matching `auth.uid()`. Hidden test cases have no student-read policy unless `visible_to_student` is true. Never place the Supabase service-role key in the browser.

Current cloud sync persists the profile, lesson status, coding-attempt records, and quiz scores. Tutor messages remain in browser storage in this version. The UI remains usable while signed out; only cloud persistence depends on authentication.

## Configure AI and Python

Set these as **server-side** environment variables in Vercel or in the local environment used by `vercel dev`:

- `AI_API_KEY`: provider secret. The endpoint expects an OpenAI-compatible `/chat/completions` API.
- `AI_BASE_URL`: API base URL, defaulting to `https://api.openai.com/v1`.
- `AI_MODEL`: model name, defaulting to `gpt-4o-mini`.
- `JUDGE0_URL`: Judge0-compatible API base URL.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY`: server-side values used to validate access tokens before serverless requests. The browser also needs the matching `VITE_` values for sign-in.
- `JUDGE0_API_KEY`: Judge0 server credential.
- `JUDGE0_AUTH_HEADER`: authentication header name, default `X-Auth-Token` (RapidAPI hosts commonly use `X-RapidAPI-Key`).

The browser only calls `/api/tutor` and `/api/execute`; provider secrets are not prefixed with `VITE_` and are never sent to client code. Hosted endpoints fail closed without Supabase token verification, limit request sizes, and apply per-instance rate limits. For a public deployment, use a shared rate-limit store/API gateway as serverless instance memory is not a global quota.

Python is sent to Judge0 with a fixed Python 3 language ID and CPU, wall-time, and memory limits. JavaScript runs in a sandboxed iframe and HTML/CSS uses a restricted preview iframe. The current exercise checker compares captured output with the sample expected output; it is not a hidden-test grader and should not be used for high-stakes assessment.

## Tests and checks

```powershell
npm test
npm run lint
npm run build
```

Tests cover progress summaries, output comparison, corrected attempts, and secure endpoint defaults. Browser QA verified the lesson editor, sandboxed JavaScript output and timeout, answer submission, quiz scoring, HTML/CSS previews, theme switching, and mobile layout. Manual follow-up is still needed for Supabase auth/RLS against a configured project, provider API failure cases, Python results from a configured Judge0 host, and hosted deployment.

## Deploy to Vercel

1. Push the project to a Git provider and import it into Vercel (or link it with the Vercel CLI).
2. Keep the default Vite build command, `npm run build`, and output directory, `dist`.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for browser sign-in, and `SUPABASE_URL` plus `SUPABASE_ANON_KEY` for serverless access-token verification.
4. Add `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, and/or `JUDGE0_*` as server environment variables as required.
5. Run the migration in the Supabase SQL Editor and add the production URL to Supabase Auth's allowed redirect URLs.
6. Redeploy after setting environment variables.

## Known limitations

- Authentication is optional for local learning; cloud data is protected by Supabase RLS.
- The frontend currently bundles sample lessons and their visible expected output. Hidden database tests are not exposed, but a secure exercise-grading endpoint is not yet implemented.
- Progress supports lesson completion, coding attempts, quiz scores, and a simple recommendation based on the latest unsuccessful topic. Streak calculation, error-correction linking, and richer adaptive recommendations need more implementation.
- Cloud synchronization is implemented for profiles, lesson status, coding attempts, and quiz scores, not tutor conversation history or every requested table.
- The tutor's built-in demo mode is rule-based. A real model is used only when the server endpoint and provider credentials are configured.
- There is no password-reset flow, OAuth provider, account deletion flow, or automated end-to-end auth test yet.