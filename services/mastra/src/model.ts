import { createGateway } from 'ai'

// Centralized model resolution. Both the Mastra agent and (conceptually) the
// Inngest pipeline route through the Vercel AI Gateway so there's a single
// place to configure provider, credentials, and model slugs.
//
// The AI SDK v6 gateway provider reads AI_GATEWAY_API_KEY from the env by
// default. We wire it explicitly so the token name is unambiguous and the
// gateway is used regardless of the global provider config.
const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
})

// Gateway model slugs are provider-prefixed and dotted (`creator/model-name`).
// Verified against the Vercel AI Gateway model catalog (ai-gateway.vercel.sh).
// Used by the agent, which goes through the AI SDK gateway provider.
export const AGENT_MODEL_SLUG = 'anthropic/claude-sonnet-4.6'

// The Inngest pipeline's LLM step uses @inngest/ai's Anthropic adapter, which
// calls the Anthropic Messages API directly — that API needs the *native*
// model id (hyphen + date), NOT the gateway's dotted slug. Mirrors the desktop
// pipeline's Haiku 4.5.
export const PIPELINE_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'

// The Nimi agent's LanguageModel, routed through the gateway.
export const agentModel = gateway(AGENT_MODEL_SLUG)
