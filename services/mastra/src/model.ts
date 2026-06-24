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

// Gateway model slugs are provider-prefixed (`creator/model-name`).
// TODO(verify slug): confirm exact current Anthropic slugs on the gateway.
export const AGENT_MODEL_SLUG = 'anthropic/claude-sonnet-4.5'
export const PIPELINE_MODEL_SLUG = 'anthropic/claude-haiku-4.5'

// The Nimi agent's LanguageModel, routed through the gateway.
export const agentModel = gateway(AGENT_MODEL_SLUG)
