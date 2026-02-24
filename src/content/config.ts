import { defineCollection, z } from 'astro:content';

const baseSchema = z.object({
  title: z.string(),
  path: z.string(),
  date: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  description: z.string().optional(),
  legacyUrl: z.string().url().optional(),
  wordpressId: z.number(),
  status: z.string(),
  categories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  featuredImage: z.string().optional(),
  featuredImageAlt: z.string().optional(),
  draft: z.boolean().default(false),
  contentType: z.enum(['post', 'page']).default('post')
});

const posts = defineCollection({
  type: 'content',
  schema: baseSchema.extend({
    contentType: z.literal('post')
  })
});

const pages = defineCollection({
  type: 'content',
  schema: baseSchema.extend({
    contentType: z.literal('page')
  })
});

const drafts = defineCollection({
  type: 'content',
  schema: baseSchema.extend({
    draft: z.literal(true)
  })
});

export const collections = {
  posts,
  pages,
  drafts
};
