import { Hono } from "hono";

/**
 * @name Users
 */
export const userRoutes = new Hono()
  /**
   * List all users
   * @summary Get all users
   * @description Returns a list of all users in the system
   * @tags Users
   */
  .get("/", (c) => c.json({ name: "current user" }))
  /**
   * Get user by ID
   * @summary Get user details
   * @description Returns detailed information about a specific user
   * @tags Users
   */
  .get("/u/:id", (c) => c.json({ id: c.req.param("id") }));

export type AppType = typeof userRoutes;
