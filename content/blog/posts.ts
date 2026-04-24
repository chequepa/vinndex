/**
 * Source of truth for which MDX files exist under content/blog/.
 * Add a new post → append its slug here. generateStaticParams +
 * dynamicParams:false on /blog/[slug] will then render it and 404
 * any other route.
 */
export const POST_SLUGS = ["valle-de-uco-guia"] as const;

export type PostSlug = (typeof POST_SLUGS)[number];

export type PostMeta = {
  title: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  author: string;
  tags: string[];
};
