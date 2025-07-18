# @mikan/trpc

To set up tRPC as a serverless service, the most common and efficient approach is to embed it within a Next.js API route, leveraging Vercel-style serverless functions. This works natively in a Turborepo monorepo and deploys cleanly to Vercel or any platform that supports serverless.

```table
| Component         | Change with App Router (v15+)                          |
|-------------------|-------------------------------------------------------|
| API handler       | app/api/trpc/[trpc]/route.ts                          |
| Layout wrapper    | Use app/layout.tsx for providers                      |
| Page component    | use client; use hooks directly                        |
| Router location   | Move to shared package like packages/trpc              |
| Middleware/Auth   | Add to createContext() if needed                      |
```
