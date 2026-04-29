import { z } from "zod";

// Keep reactions minimal across the UI (web + mobile).
export const CONFESSION_EMOJIS = ["❤️", "😂", "🔥"] as const;
export const ConfessionEmojiSchema = z.enum(CONFESSION_EMOJIS);

export const ConfessionAliasSchema = z.object({
  id: z.string(),
  userId: z.number(),
  alias: z.string(),
  avatarColor: z.string(),
  createdAt: z.number(),
});

export const ConfessionSchema = z.object({
  id: z.string(),
  body: z.string().min(1).max(1000),
  aliasId: z.string(),
  isPinned: z.boolean().default(false),
  isManualPin: z.boolean().default(false),
  isHidden: z.boolean().default(false),
  flagCount: z.number().default(0),
  replyToId: z.string().optional().nullable(),
  totalReacts: z.number().default(0),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const CreateConfessionSchema = z.object({
  body: z.string().min(1).max(1000),
  replyToId: z.string().optional().nullable(),
});

export const ReactToConfessionSchema = z.object({
  emoji: ConfessionEmojiSchema,
});

export type ConfessionAlias = z.infer<typeof ConfessionAliasSchema>;
export type Confession = z.infer<typeof ConfessionSchema>;
