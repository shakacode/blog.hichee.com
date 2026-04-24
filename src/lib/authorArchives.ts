import { getCollection, type CollectionEntry } from 'astro:content';
import authorPostPaths from '../data/author-post-paths.json';
import { canonicalizeAliasPath, normalizeRoutePath } from './routePaths';

export const AUTHOR_PAGE_SIZE = 12;

type AuthorProfile = {
  name: string;
  bio: string;
};

export type AuthorArchivePost = Pick<CollectionEntry<'posts'>, 'id' | 'data'>;

export type AuthorArchiveEntry = {
  slug: string;
  profile: AuthorProfile;
  posts: AuthorArchivePost[];
  totalPages: number;
};

export const authorProfiles: Record<string, AuthorProfile> = {
  alan: {
    name: 'Alan Egan',
    bio: 'Alan has been working in the vacation rental sector since 2004, when he first created a listing site for his property management company. He has been helping short-term rental owners and managers to stand out in an over-saturated marketplace for over 12 years and has written thousands of articles in that time. He has written books on vacation rental photography and was the first in the industry to create online marketing courses for hosts. He has given keynote presentations across various subjects at The Vacation Rental World Summit, VRMA, VRMintel, Host, and The Book Direct Summit.'
  },
  tiffany: {
    name: 'Tiffany Martin',
    bio: "Tiffany Martin, a 33-year-old travel content contributor based in Manila, Philippines, brings the world's beauty to your screen through her writing, narrating the best places in the globe with a charm that resonates. Aside from being a travel writer and an all-around digital nomad, she's also a wifey, a mom to two girls, and a licensed educator. During her downtime, she loves traveling, cooking, and playing with her energetic Dachshund and cuddly Golden Malinois."
  },
  'our-discount-desk': {
    name: 'Our Discount Desk',
    bio: 'Posts and travel deals curated by the HiChee team.'
  },
  'our-travel-reporter': {
    name: 'Our Travel Reporter',
    bio: 'Travel reporting and destination coverage from the HiChee team.'
  }
};

export async function getAuthorArchiveEntries(): Promise<AuthorArchiveEntry[]> {
  const posts = (await getCollection('posts')).filter(
    (entry) => !entry.data.draft && entry.data.status === 'publish'
  );

  const postsByPath = new Map(
    posts.map((post) => [normalizeRoutePath(post.data.path), post] as const)
  );

  return Object.entries(authorPostPaths).map(([slug, paths]) => {
    const authorPosts = (paths as string[])
      .map((entryPath) => resolveArchivePost(entryPath, postsByPath))
      .filter((post): post is AuthorArchivePost => Boolean(post))
      .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

    return {
      slug,
      profile: getAuthorProfile(slug),
      posts: authorPosts,
      totalPages: Math.max(1, Math.ceil(authorPosts.length / AUTHOR_PAGE_SIZE))
    };
  });
}

export function getAuthorProfile(slug: string): AuthorProfile {
  const profile = authorProfiles[slug];
  if (profile) return profile;

  const name = titleCaseSlug(slug);
  return {
    name,
    bio: `Posts written by ${name}.`
  };
}

export function buildAuthorPagePath(slug: string, page: number): string {
  if (page <= 1) return `/author/${slug}/`;
  return `/author/${slug}/page/${page}/`;
}

export function paginateAuthorPosts(posts: AuthorArchivePost[], page: number) {
  const currentPage = Math.max(1, page);
  const start = (currentPage - 1) * AUTHOR_PAGE_SIZE;
  return posts.slice(start, start + AUTHOR_PAGE_SIZE);
}

function resolveArchivePost(
  route: string,
  postsByPath: Map<string, CollectionEntry<'posts'>>
): AuthorArchivePost | null {
  const normalizedRoute = normalizeRoutePath(route, { canonicalize: false });
  const direct = postsByPath.get(normalizedRoute);
  if (direct) return direct;

  const canonicalRoute = canonicalizeAliasPath(normalizedRoute);
  if (canonicalRoute === normalizedRoute) return null;

  const canonicalPost = postsByPath.get(canonicalRoute);
  if (!canonicalPost) return null;

  return {
    ...canonicalPost,
    id: `${canonicalPost.id}::${normalizedRoute}`,
    data: {
      ...canonicalPost.data,
      path: normalizedRoute,
    },
  };
}

function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
