import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

// Spike: logs and acks. Phase 1 wires this to the Turso DB via the same
// schema the desktop uses (todos table, same Drizzle schema).
export const addTodoTool = createTool({
  id: 'add-todo',
  description:
    'Create a new todo for the user. Use this when the user asks to add a task, ' +
    'create a reminder, or when uncovering a task from their memories.',
  inputSchema: z.object({
    title: z.string().describe('Short todo title (imperative, present tense)'),
    notes: z.string().optional().describe('Additional context or notes for the todo'),
    day: z
      .string()
      .optional()
      .describe('ISO date (YYYY-MM-DD) to schedule for today; omit for backlog'),
  }),
  outputSchema: z.object({
    id: z.string(),
    title: z.string(),
    scheduled: z.boolean(),
  }),
  execute: async ({ context }) => {
    // TODO(phase-1): replace with real Turso insert
    console.log('[spike] add-todo:', context)
    return {
      id: `mock-todo-${Date.now()}`,
      title: context.title,
      scheduled: !!context.day,
    }
  },
})
