/* eslint-disable */
/**
 * Generated utilities. Regenerated automatically by `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as gallery from "../gallery.js";
import type * as seed from "../seed.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  gallery: typeof gallery;
  seed: typeof seed;
}>;

export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
export declare const components: {};
