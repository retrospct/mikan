// import { appRouter } from '@acme/trpc/router'
// import { fetchRequestHandler } from '@trpc/server/adapters/fetch'

// const handler = (req: Request) => {
//   return fetchRequestHandler({
//     endpoint: '/api/trpc',
//     req,
//     router: appRouter,
//     createContext: () => ({})
//   })
// }

// export { handler as GET, handler as POST }

const handler = (req: Request) => {
  // Implement a placeholder generic Next.js API route
  return new Response('Hello, world!')
}

export { handler as GET, handler as POST }
