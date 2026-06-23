import { Mastra } from '@mastra/core'
import { nimiAgent } from './agents/nimi-agent.js'

export const mastra = new Mastra({
  agents: { nimiAgent },
})
