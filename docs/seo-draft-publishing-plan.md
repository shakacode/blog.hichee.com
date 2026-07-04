# SEO Draft Publishing Plan

Last reviewed: 2026-07-03 HST

## Recommendation

Do not bulk publish the migrated WordPress drafts for SEO.

Selective publishing can help, but only after editorial review, media cleanup, and
conversion planning. The draft collection should be treated as raw material for
curated search pages, not as ready-to-index inventory.

## Why Bulk Publishing Is Risky

The local draft corpus currently contains 717 markdown files under
`src/content/drafts/`.

Snapshot from the local corpus:

- 710 drafts, 6 future posts, and 1 private post.
- 714 posts and 3 pages.
- 312 drafts are under 250 words.
- 374 drafts are under 500 words.
- 186 drafts are 1,200 words or longer.
- 691 drafts still contain absolute `https://blog.hichee.com/wp-content/...`
  media references.
- 61 drafts are missing a featured image field.
- The most common categories include imported or low-control sources:
  `rss`, `uncategorized`, `security`, `superhog`, `guess-where`,
  `property-spotlight`, and `podcasts`.

Observed quality issues:

- Many drafts are thin placeholders, empty quote posts, or very short imported
  snippets.
- Several drafts have placeholder or broken titles such as `Private:` or
  `Untitled post ...`.
- Many long drafts appear to be RSS imports, syndicated partner content, or
  podcast transcripts. Length alone does not make them good SEO pages.
- Some older drafts include stale destinations, pricing, laws, or external
  links that need fact checks before publishing.
- Media references must be normalized before publication so published pages do
  not depend on old WordPress absolute URLs.

Google Search guidance favors helpful, reliable, people-first content and warns
against scaled or low-value pages created primarily to attract search traffic.
Use these as the editorial guardrails:

- [Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google Search spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- [Canonicalization and duplicate URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)

## Positive Traffic Definition

The goal is not more sessions in isolation. The goal is more qualified traffic
that can plausibly become HiChee users, subscribers, partners, or brand-aware
travel shoppers.

Prefer pages that connect search intent to HiChee's value:

- Saving money by booking direct.
- Comparing Airbnb, Vrbo, hotel, and direct-booking prices.
- Finding destination-specific vacation rental options.
- Understanding guest trust, host safety, and short-term rental risk.
- Planning trips where HiChee can help users compare stays.

Avoid publishing pages that may increase low-quality traffic but do not advance
the business:

- Generic travel inspiration with no HiChee angle.
- Syndicated RSS content without original commentary or canonical decisions.
- Thin quote/image posts.
- Old copied content from partner blogs unless rewritten and permission/canonical
  status is clear.

## Draft Triage Buckets

Classify every draft before publication:

- `publish-candidate`: strong search intent, original enough, useful to HiChee,
  and feasible to clean up quickly.
- `rewrite`: promising topic, but needs a stronger angle, updated facts,
  rewritten structure, or consolidated duplicate material.
- `merge`: useful fragments that should be folded into a stronger pillar page
  instead of published as separate thin pages.
- `syndicated-review`: RSS, partner, podcast, or externally sourced content that
  needs permission, canonical, noindex, or substantial original analysis.
- `archive`: not worth publishing because it is too thin, stale, duplicated, or
  irrelevant.
- `media-cleanup`: otherwise publishable, but blocked on image migration,
  alt text, or broken embeds.

## Publishing Checklist

Before moving any draft from `src/content/drafts/` into published content:

- Confirm the page serves a real search intent aligned with HiChee.
- Replace `/wp-####/` placeholder paths with a clean, durable slug.
- Update title, description, headings, and internal links.
- Add original HiChee perspective, examples, and conversion path.
- Remove duplicate RSS boilerplate and unrelated feed imports.
- Verify permission, attribution, and canonical/noindex handling for syndicated
  content.
- Update facts, dates, legal claims, prices, platform policies, and destination
  details.
- Normalize media to root-relative or durable CDN-backed URLs; do not publish new
  absolute `blog.hichee.com/wp-content` references.
- Add meaningful image alt text where appropriate.
- Link to relevant published HiChee blog posts and HiChee product pages.
- Preview mobile and desktop rendering.
- Build locally before merge.

## First SEO Sprint

Start with a small curated batch instead of a broad publication sweep.

Recommended first sprint:

1. Generate a draft audit report with word count, category, title quality, media
   risk, and duplicate/syndication indicators.
2. Select 25 candidates manually.
3. Choose 10 high-intent pages for the first publishing batch.
4. Rewrite and publish those 10 pages with clean slugs and conversion CTAs.
5. Submit or inspect indexing in Google Search Console.
6. Monitor impressions, queries, clicks, click-through rate, indexed status, and
   downstream conversion signals.
7. Use the results to decide the next batch.

Good first-batch themes:

- Direct booking and saving money on Airbnb-style stays.
- Airbnb alternatives and booking-site fee comparisons.
- Destination guides where HiChee can connect readers to stay comparisons.
- High-quality vacation rental listicles that can be made original and current.
- Guest safety, host trust, and short-term rental risk explainers.

Avoid first-batch themes:

- Empty travel quote posts.
- Raw RSS reposts.
- Raw podcast transcripts without a summary, original analysis, and clear
  canonical strategy.
- Generic old travel articles with no HiChee-specific value.

## Operating Model

Use GitHub issues with the existing `draft-review` label as the intake queue.
Add more granular labels as drafts are reviewed:

- `seo-candidate`
- `rewrite`
- `merge`
- `syndicated-review`
- `archive`
- `media-cleanup`

Publishing should happen through normal pull requests. Each PR should include:

- The selected draft issue link.
- The intended search intent.
- The target query cluster, if known.
- The old draft file path.
- The new published path.
- Media cleanup notes.
- Local build verification.

## Success Metrics

Measure after publication in Google Search Console and analytics:

- Indexed pages and indexing errors.
- Search impressions by page and query.
- Click-through rate.
- Average position trend.
- Organic sessions that reach HiChee product or conversion pages.
- Engagement quality compared with existing blog traffic.
- Pages that attract irrelevant traffic and should be consolidated, rewritten, or
  removed.

Do not continue publishing drafts merely because unpublished inventory exists.
Continue only when the prior batch creates qualified traffic or useful search
visibility.
