
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
  return user;
}

async function requireWorkspaceOwner(ctx: DatabaseCtx, username: string, workspaceId: Id<"workspaces">) {
  const user = await findUser(ctx, username);
  const membership = await ctx.db.query("workspaceMembers").withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", user._id)).unique();
  if (!membership || membership.role !== "owner") throw new Error("Only the workspace owner can delete files.");
  return user;
}

const fileKind = (mimeType: string) => mimeType === "application/pdf" ? "pdf" as const : mimeType.startsWith("image/") ? "image" as const : null;

const uniqueName = async (ctx: DatabaseCtx, workspaceId: Id<"workspaces">, requestedName: string) => {
  const cleanName = requestedName.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").slice(0, 180) || "untitled-file";
  const extensionIndex = cleanName.lastIndexOf(".");
  const stem = extensionIndex > 0 ? cleanName.slice(0, extensionIndex) : cleanName;
  const extension = extensionIndex > 0 ? cleanName.slice(extensionIndex) : "";
  let candidate = cleanName;
  let suffix = 2;
  while (await ctx.db.query("libraryFiles").withIndex("by_workspace_name", (q) => q.eq("workspaceId", workspaceId).eq("nameLower", normalize(candidate))).unique()) {
    candidate = `${stem} (${suffix})${extension}`;
    suffix += 1;
  }
  return candidate;
};

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

export const listForWorkspace = query({
  args: { username: v.string(), workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const user = await requireMembership(ctx, args.username, args.workspaceId);
    const membership = await ctx.db.query("workspaceMembers").withIndex("by_workspace_user", (q) => q.eq("workspaceId", args.workspaceId).eq("userId", user._id)).unique();
    const files = await ctx.db.query("libraryFiles").withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId)).order("desc").collect();
    return await Promise.all(files.map(async (file) => ({ ...file, canDelete: membership?.role === "owner", url: await ctx.storage.getUrl(file.storageId) })));
  },
});

export const create = mutation({
  args: {
    username: v.string(),
    workspaceId: v.id("workspaces"),
    storageId: v.id("_storage"),
    originalName: v.string(),
    mimeType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireMembership(ctx, args.username, args.workspaceId);
    const kind = fileKind(args.mimeType);
    if (!kind) throw new Error("Only image files and PDFs can be added to the library.");
    if (args.size > 25 * 1024 * 1024) throw new Error("Files must be smaller than 25 MB.");
    const name = await uniqueName(ctx, args.workspaceId, args.originalName);
    const now = Date.now();
    return await ctx.db.insert("libraryFiles", { workspaceId: args.workspaceId, ownerId: user._id, storageId: args.storageId, name, nameLower: normalize(name), originalName: args.originalName, mimeType: kind, size: args.size, createdAt: now, updatedAt: now });
  },
});

export const rename = mutation({
  args: { username: v.string(), fileId: v.id("libraryFiles"), name: v.string() },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("File not found.");
    await requireMembership(ctx, args.username, file.workspaceId);
    const name = args.name.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").slice(0, 180);
    if (!name) throw new Error("A file needs a name.");
    const existing = await ctx.db.query("libraryFiles").withIndex("by_workspace_name", (q) => q.eq("workspaceId", file.workspaceId).eq("nameLower", normalize(name))).unique();
    if (existing && existing._id !== file._id) throw new Error("That file name is already in use.");
    await ctx.db.patch(file._id, { name, nameLower: normalize(name), updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { username: v.string(), fileId: v.id("libraryFiles") },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("File not found.");
    await requireWorkspaceOwner(ctx, args.username, file.workspaceId);
    await ctx.storage.delete(file.storageId);
    await ctx.db.delete(file._id);
  },
});

export const removeMany = mutation({
  args: { username: v.string(), fileIds: v.array(v.id("libraryFiles")) },
  handler: async (ctx, args) => {
    if (args.fileIds.length === 0) return;
    const files = await Promise.all(args.fileIds.map((fileId) => ctx.db.get(fileId)));
    const existingFiles = files.filter((file): file is NonNullable<typeof file> => file !== null);
    if (existingFiles.length !== args.fileIds.length) throw new Error("One or more files could not be found.");
    const workspaceId = existingFiles[0].workspaceId;
    if (existingFiles.some((file) => file.workspaceId !== workspaceId)) throw new Error("Files must belong to the same workspace.");
    await requireWorkspaceOwner(ctx, args.username, workspaceId);
    for (const file of existingFiles) {
      await ctx.storage.delete(file.storageId);
      await ctx.db.delete(file._id);
    }
  },
});
