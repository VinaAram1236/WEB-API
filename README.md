# WEB API

A simple Express web API and static frontend for quiz generation.

## Run locally

```bash
cd WEB-API
npm install
npm start
```

Then open `http://localhost:3000`.

## Configuration

Create a `.env` file in `WEB-API` with the following values:

```env
WEB_API_KEY=LOCAL_DEV_KEY
AI_PROVIDER=openai
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

- `WEB_API_KEY` protects `/api/generate-quiz` and is the server auth key.
- For local development, set `WEB_API_KEY=LOCAL_DEV_KEY` and do not paste your OpenAI `sk-...` key into the browser.
- `AI_PROVIDER` selects the default AI backend: `gemini`, `openai`, or `anthropic`.
- `openai` is now the default provider.
- Only the key for the provider you use is required in `.env`.

### API Usage

Send `POST /api/generate-quiz` with `x-api-key` header and JSON body:

```json
{
  "story": "Text to generate questions from.",
  "question_count": 5,
  "provider": "openai"
}
```

If `provider` is omitted, the value from `AI_PROVIDER` is used.

## Deploy online

Any Node.js hosting provider such as Render, Railway, or Vercel (Node) can run this project.

The app serves the frontend from `/public` and exposes `/api/generate-quiz` for quiz generation.
