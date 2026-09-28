# OpenAI lead analysis

Set these server-only variables in the **example-jenosize-api** Vercel project, targeting **Production**:

| Variable | Value |
| --- | --- |
| `AI_PROVIDER` | `openai` |
| `AI_MODEL` | `gpt-4o-mini` (or another Chat Completions model supporting Structured Outputs) |
| `OPENAI_API_KEY` | Your private OpenAI project API key; save as sensitive |

Redeploy the API after changing environment variables. For local development, use the same variables in the ignored root `.env` and restart the API. Never commit the key, paste it into chat, or prefix it with `NEXT_PUBLIC_`.

Open a Lead and click **Analyze**. The API sends lead facts, the latest 20 received/sent messages belonging to that Lead or its linked Contact, and the latest 10 activity notes to OpenAI. Messages retain direction and timestamp and are ordered chronologically; unsent drafts are excluded. Unmapped LINE senders must be linked to the Lead's Contact first.

OpenAI returns a Thai summary, sales-readiness score and evidence, missing information, next action, and a LINE reply draft. The API uses a strict JSON schema and validates the response before saving it in `ai_suggestions`, with its model and timestamp. The drawer shows the saved result when reopened. A Lead with no conversation can still be analyzed from its facts and notes, with that limitation made explicit in the prompt.

When OpenAI is selected, a missing key, invalid credentials, quota/credit limits, timeout, refusal, or invalid output produces a visible error instead of a fallback suggestion. `AI_PROVIDER=mock` explicitly enables deterministic demo results, labelled as fallback in the UI. Failed requests do not create suggestions.

Authenticated `GET /api/ai/config` returns provider, model and key readiness only; it never returns the key. Saving the proposed LINE reply creates a draft. Sending still requires separate approval.

The existing Chat Completions adapter uses [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) with `store:false`. API keys and upstream error bodies are never included in client errors or logs.
