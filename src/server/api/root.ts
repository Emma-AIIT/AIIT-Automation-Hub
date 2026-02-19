import { postRouter } from "~/server/api/routers/post";
import { clientsRouter } from "~/server/api/routers/clients";
import { webhooksRouter } from "~/server/api/routers/webhooks";
import { syncRouter } from "~/server/api/routers/sync";
import { quotePipelineRouter } from "~/server/api/routers/quotePipeline";
import { statsRouter } from "~/server/api/routers/stats";
import { vapiRouter } from "~/server/api/routers/vapi";
import { ticketsRouter } from "~/server/api/routers/tickets";
import { workersRouter } from "~/server/api/routers/workers";
import { whatsappRouter } from "~/server/api/routers/whatsapp";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  clients: clientsRouter,
  webhooks: webhooksRouter,
  sync: syncRouter,
  quotePipeline: quotePipelineRouter,
  stats: statsRouter,
  vapi: vapiRouter,
  tickets: ticketsRouter,
  workers: workersRouter,
  whatsapp: whatsappRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
