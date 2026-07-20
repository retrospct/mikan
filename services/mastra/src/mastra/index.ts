import { Mastra } from '@mastra/core'
import { mikanAgent } from '../agents/mikan-agent.js'

export const mastra = new Mastra({
  agents: { mikanAgent },
})
