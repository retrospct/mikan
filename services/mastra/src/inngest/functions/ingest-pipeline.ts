import { anthropic } from '@inngest/ai/models'
import { z } from 'zod'
import { inngest } from '../client.js'
import { PIPELINE_ANTHROPIC_MODEL } from '../../model.js'

// Event payload schema. In Inngest v4 the payload is typed per-trigger via a
// Standard Schema, replacing the old client-level EventSchemas.
const ingestEventSchema = z.object({
  text: z.string(),
  itemId: z.string(),
  contentType: z.string(),
})

// Spike: validates that step.ai.infer() works on serverless (Vercel) without
// paying for idle time during LLM inference. Each step is independently
// retried on failure — the pipeline survives transient API errors.
//
// Phase 1 will add: real OCR/ASR extraction, embedding, libSQL vector insert.
export const ingestPipeline = inngest.createFunction(
  {
    id: 'ingest-pipeline',
    retries: 3,
    // Keep serverless function alive for up to 5 minutes across all steps
    // (Inngest pauses the function between steps, so you only pay for
    // active compute, not LLM inference wait time).
    triggers: [{ event: 'memory/ingest', schema: ingestEventSchema }],
  },
  async ({ event, step }) => {
    // contentType is consumed in Phase 1 (OCR/ASR routing); referenced here to
    // keep the typed event shape intact.
    const { text, itemId, contentType } = event.data
    void contentType

    // Step 1: extract clean text (spike: passthrough; Phase 1: OCR/ASR)
    const extractedText = await step.run('extract-text', async () => {
      // TODO(phase-1): route through OCR (tesseract/Vision) or ASR (Whisper)
      // based on contentType. For now, pass through raw text.
      return { text, wordCount: text.split(/\s+/).length }
    })

    // Step 2: chunk text (same params as desktop pipeline)
    const chunks = await step.run('chunk-text', async () => {
      const WINDOW = 800
      const OVERLAP = 100
      const words = extractedText.text.split(/\s+/)
      const result: string[] = []
      for (let i = 0; i < words.length; i += WINDOW - OVERLAP) {
        result.push(words.slice(i, i + WINDOW).join(' '))
        if (i + WINDOW >= words.length) break
      }
      return result.length > 0 ? result : [extractedText.text]
    })

    // Step 3: generate a draft brief via LLM
    // step.ai.infer() offloads the LLM call to Inngest's infrastructure,
    // pausing this function so we don't pay for idle serverless time.
    // step.ai.infer uses Inngest's OWN AI adapter infra (@inngest/ai), which
    // speaks the provider's native (Anthropic Messages) API — it does NOT go
    // through the AI SDK gateway provider the way the Mastra agent does.
    //
    // Credential selection: if AI_GATEWAY_BASE_URL is set we route the adapter
    // at the gateway's Anthropic-compatible endpoint with the gateway key;
    // otherwise we hit api.anthropic.com directly with ANTHROPIC_API_KEY. (We
    // must NOT send the vck_ gateway key to api.anthropic.com — it would 401.)
    const usingGateway = !!process.env.AI_GATEWAY_BASE_URL
    const brief = await step.ai.infer('generate-brief', {
      model: anthropic({
        // Anthropic-native model id (the adapter calls api.anthropic.com).
        model: PIPELINE_ANTHROPIC_MODEL,
        apiKey: usingGateway
          ? process.env.AI_GATEWAY_API_KEY
          : process.env.ANTHROPIC_API_KEY,
        baseUrl: process.env.AI_GATEWAY_BASE_URL,
        defaultParameters: { max_tokens: 200 },
      }),
      body: {
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content:
              `In 1–2 sentences, summarize the key point of this content for a personal memory app. ` +
              `Be specific and concrete.\n\n${chunks[0]}`,
          },
        ],
      },
    })

    const briefText =
      brief.content[0]?.type === 'text' ? brief.content[0].text : ''

    return {
      itemId,
      chunkCount: chunks.length,
      wordCount: extractedText.wordCount,
      brief: briefText,
      // TODO(phase-1): embed chunks + insert into libSQL vector index
    }
  }
)
