import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const normalize = (value: string) => value.trim().toLowerCase();
type DatabaseCtx = QueryCtx | MutationCtx;

async function findUser(ctx: DatabaseCtx, username: string) {
  const user = await ctx.db.query("users").withIndex("by_username_lower", (q) => q.eq("usernameLower", normalize(username))).unique();
  if (!user) throw new Error("User not found.");
  return user;
}

async function requireMembership(ctx: DatabaseCtx, username: string, workspaceId: Id<"workspaces">) {
  const user = await findUser(ctx, username);
  const membership = await ctx.db.query("workspaceMembers").withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", user._id)).unique();
  if (!membership) throw new Error("You are not a member of this workspace.");
  return { user, membership };
}

const fileKind = (mimeType: string) => mimeType === "application/pdf" ? "pdf" as const : mimeType.startsWith("image/") ? "image" as const : null;

export const generateUploadUrl = mutation({ args: {}, handler: async (ctx) => ctx.storage.generateUploadUrl() });

export const listForWorkspace = query({
  args: { username: v.string(), workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const { user, membership } = await requireMembership(ctx, args.username, args.workspaceId);
    const files = await ctx.db.query("libraryFiles").withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId)).order("desc").collect();
    return await Promise.all(files.map(async (file) => ({ ...file, id: file._id, canDelete: membership.role === "owner", url: await ctx.storage.getUrl(file.storageId), ownerId: user._id })));
  },
});

export const create = mutation({
  args: { username: v.string(), workspaceId: v.id("workspaces"), storageId: v.id("_storage"), originalName: v.string(), mimeType: v.string(), size: v.number() },
  handler: async (ctx, args) => {
    const { user } = await requireMembership(ctx, args.username, args.workspaceId);
    const kind = fileKind(args.mimeType);
    if (!kind) throw new Error("Only image files and PDFs can be added to the library.");
    if (args.size > 25 * 1024 * 1024) throw new Error("Files must be smaller than 25 MB.");
    const now = Date.now();
    return await ctx.db.insert("libraryFiles", { workspaceId: args.workspaceId, ownerId: user._id, storageId: args.storageId, name: args.originalName, nameLower: normalize(args.originalName), originalName: args.originalName, mimeType: kind, size: args.size, createdAt: now, updatedAt: now });
  },
});
