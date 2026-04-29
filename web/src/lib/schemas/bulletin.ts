import { z } from "zod";

export const AnnouncementTypeSchema = z.enum([
  "ANNOUNCEMENT",
  "EVENT",
  "DEADLINE",
  "HOLIDAY",
  "URGENT",
]);

export const AnnouncementSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  type: AnnouncementTypeSchema,
  isPinned: z.boolean().default(false),
  isPublished: z.boolean().default(true),
  coverImage: z.string().url().optional().nullable(),
  eventStart: z.number().optional().nullable(),
  eventEnd: z.number().optional().nullable(),
  authorId: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const CreateAnnouncementSchema = AnnouncementSchema.omit({
  id: true,
  authorId: true,
  createdAt: true,
  updatedAt: true,
});

export const UpdateAnnouncementSchema = CreateAnnouncementSchema.partial();

export type Announcement = z.infer<typeof AnnouncementSchema>;
export type AnnouncementType = z.infer<typeof AnnouncementTypeSchema>;
