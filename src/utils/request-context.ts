import { AsyncLocalStorage } from "node:async_hooks";

/** Who and which request a piece of work belongs to; read by the logger and Sentry */
export type RequestContext = { requestId: string; userId?: string; method?: string; path?: string };

export const requestContext = new AsyncLocalStorage<RequestContext>();
export const getRequestContext = () => requestContext.getStore();
