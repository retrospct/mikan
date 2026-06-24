import { anthropic } from '@inngest/ai/models'
import { z } from 'zod'
import { inngest } from '../client.js'
import { PIPELINE_MODEL_SLUG } from '../../model.js'

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
    // speaks the provider's native API — it does NOT go through the AI SDK
    // gateway provider the way the Mastra agent does. To still route through
    // the Vercel AI Gateway we point the adapter's baseUrl at the gateway's
    // Anthropic-compatible endpoint and reuse the same token; if that token
    // is unset it falls back to ANTHROPIC_API_KEY (the adapter default).
    const brief = await step.ai.infer('generate-brief', {
      model: anthropic({
        // The Inngest adapter expects an Anthropic-native model id, not the
        // gateway's provider-prefixed slug; strip the `anthropic/` prefix.
        // TODO(verify slug): confirm the gateway accepts this Anthropic model id.
        model: PIPELINE_MODEL_SLUG.replace(/^anthropic\//, ''),
        apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.ANTHROPIC_API_KEY,
        // TODO(verify baseUrl): point at the Vercel AI Gateway's Anthropic
        // endpoint when AI_GATEWAY_API_KEY is set; default Anthropic API otherwise.
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
