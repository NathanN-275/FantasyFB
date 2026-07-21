import { toNextJsHandler } from "better-auth/next-js";
import { getBetterAuth } from "../../../../server/auth/better-auth";

const handlers = toNextJsHandler((request) => getBetterAuth().handler(request));

export const { GET, POST, PATCH, PUT, DELETE } = handlers;
