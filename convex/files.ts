import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listLibraryFiles = query({
  args: { username: v.string(), workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username_lower", (q) => q.eq("usernameLower", args.username.toLowerCase()))
      .unique();

    if (!user) throw new Error("User not found.");

    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", user._id),
      )
      .unique();

    if (!membership) throw new Error("You are not a member of this workspace.");

    return await ctx.db
      .query("libraryFiles")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});

export const generateUploadUrl = mutation({
  args: { username: v.string(), workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username_lower", (q) => q.eq("usernameLower", args.username.toLowerCase()))
      .unique();

    if (!user) throw new Error("User not found.");

    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", user._id),
      )
      .unique();

    if (!membership) throw new Error("You are not a member of this workspace.");

    return await ctx.storage.generateUploadUrl();
  },
});

export const createLibraryAsset = mutation({
  args: {
    username: v.string(),
    workspaceId: v.id("workspaces"),
    storageId: v.id("_storage"),
    originalName: v.string(),
    mimeType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username_lower", (q) => q.eq("usernameLower", args.username.toLowerCase()))
      .unique();

    if (!user) throw new Error("User not found.");

    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", user._id),
      )
      .unique();

    if (!membership) throw new Error("You are not a member of this workspace.");

    await ctx.db.insert("libraryFiles", {
      workspaceId: args.workspaceId,
      userId: user._id,
      storageId: args.storageId,
      name: args.originalName,
      mimeType: args.mimeType,
      size: args.size,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { created: true };
  },
});
