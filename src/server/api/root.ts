/**
 * root router — combines all tRPC sub-routers into the main app router.
 *
 * To add a new module:
 *   1. Create a router file in /src/server/api/routers/
 *   2. Import it here
 *   3. Add it to the appRouter object with a descriptive key
 *   4. The key becomes the namespace in the client: api.<key>.<procedure>()
 */
import { postRouter } from "~/server/api/routers/post";
import { clientsRouter } from "~/server/api/routers/clients";
import { searchRouter } from "~/server/api/routers/search";
import { webhooksRouter } from "~/server/api/routers/webhooks";
import { syncRouter } from "~/server/api/routers/sync";
import { quotePipelineRouter } from "~/server/api/routers/quotePipeline";
import { statsRouter } from "~/server/api/routers/stats";
import { vapiRouter } from "~/server/api/routers/vapi";
import { ticketsRouter } from "~/server/api/routers/tickets";
import { workersRouter } from "~/server/api/routers/workers";
import { whatsappRouter } from "~/server/api/routers/whatsapp";
import { invoicingRouter } from "~/server/api/routers/invoicing";
import { callContactsRouter } from "~/server/api/routers/callContacts";
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
  invoicing: invoicingRouter,
  callContacts: callContactsRouter,
  search: searchRouter,
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
