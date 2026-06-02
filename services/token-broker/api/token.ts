/**
 * Vercel Serverless Function handler.
 *
 * Vercel maps `api/token.ts` → any method at `/api/token`.
 * The vercel.json rewrites expose `/token` and `/health` at the root path.
 *
 * Deploy:
 *   cd services/token-broker && vercel --prod
 */
import { createApp } from '../src/app.ts'

const app = createApp()

export default async function handler(req: Request): Promise<Response> {
  return app.fetch(req)
}

export const config = { runtime: 'nodejs20.x' }
