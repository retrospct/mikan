import { anthropic } from '@ai-sdk/anthropic'
import { inngest } from '../client.js'

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
  },
  { event: 'memory/ingest' },
  async ({ event, step }) => {
    const { text, itemId, contentType } = event.data as {
      text: string
      itemId: string
      contentType: string
    }

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
    const brief = await step.ai.infer('generate-brief', {
      model: anthropic('claude-haiku-4-5-20251001'),
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
