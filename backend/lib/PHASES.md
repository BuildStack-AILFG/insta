# Build phases — what to build when

DMForGrow is an Instagram automation product. This file is the roadmap: what each phase delivers, and the rule that
infrastructure is only added when a concrete trigger calls for it.

Constraints that shape every phase (Meta's Instagram messaging rules):
- Businesses can't message people first — conversations start with a comment, DM, story reply or mention.
- Replies are allowed for 24 hours after the person's last message (7 days for a human agent with the HUMAN_AGENT
  permission). A comment allows exactly one private-reply DM, within 7 days.
- Only Professional (Business / Creator) accounts have API access.

---

## Phase 1 — Comment → DM and the DM inbox ✅ (2026-09-26)

- Instagram Login (OAuth) + token paste, encrypted long-lived tokens with scheduled refresh, webhook subscription.
- Signed, idempotent webhook for DMs, echoes, postbacks, story replies/mentions, reactions, seen, referrals, comments.
- Comment automations: keyword / exact / any, exclusions, specific / next / all posts, public-reply variants,
  private-reply DM with link buttons, once per person, follow-up flow, activity log.
- Shared inbox, keyword/welcome/away/delayed replies, ice breakers, flows (quick replies, link buttons, story trigger),
  AI agent, pipeline, payment links, REST API + webhooks — all ported from the WhatsApp product.
- WhatsApp-only features (templates, broadcasts, commerce catalog, website widget) removed in migration 0006.

## Phase 2 — Growth features ✅ (2026-09-26)

- **Unlock gates** on comment automations (migration 0007, `comment_gates`): follow-gate (postback button →
  `is_user_follow_business` check → deliver or remind), email / phone gates (validated answer saved on the contact,
  tagged `lead`, `lead_captured` webhook; gives up after 3 bad answers).
- **Link click tracking** (`tracked_links`, `GET /api/l/{code}`): DM buttons from comment automations, story replies and
  flow link buttons redirect through a per-person code; first click counts toward the automation, tags `clicked:…` and
  fires `link_clicked`. Needs `PUBLIC_BASE_URL` (Instagram opens links on the person's phone).
- **Story mention / story reply auto-replies** with optional link button, tag and a 24h per-person cooldown.
- Automation templates, lead-capture flow presets, top posts and link clicks in analytics.

## Phase 3 — Engagement and moderation ✅ (2026-09-26)

- **Comment moderation** (`tenant.settings.moderation`, migration 0008): blocked words, links, too many @mentions and
  optional AI classification (spam / abusive) — hidden or deleted before any automation replies; manual hide / unhide /
  delete from the activity log; `comment_moderated` webhook.
- **Giveaways** (`giveaways`): fetch all comments on a post (`/{media}/comments`, paginated), entry rules (keyword,
  tag N friends, one entry per person, exclusions, never the account itself), cryptographically random winners, redraw,
  DM winners as private replies; `giveaway_drawn` webhook.
- **A/B DM variants** on comment automations (`dm_text_b`): stable per-person split, sent / clicked / click-rate per variant.
- Flow template gallery.

## Phase 4 — Content and insights ✅ (2026-09-26, partly)

- **Post scheduler** (`scheduled_posts`, migration 0009): photo / carousel / reel / story via the Content Publishing API
  (container → status polling → publish), first comment, publishing-limit check, retries and a processing timeout,
  driven by the in-process scheduler. Media must be public https URLs (no file hosting yet).
- **Insights**: account totals (views, reach, engaged, interactions, shares, saves, link taps), follows / unfollows,
  reach per day, follower demographics (100+ followers), per-post metrics — cached 10 minutes.
- New scopes: `instagram_business_content_publish`, `instagram_business_manage_insights` — existing connections must
  reconnect to grant them.
- **Not possible with Instagram Login:** competitor tracking (Business Discovery) and hashtag research (Hashtag Search)
  are Facebook-Login-only APIs. They need an additional "Connect via Facebook Page" flow if we want them.
- Next candidates: media upload/hosting for the scheduler, multi-account agency view, content calendar grid.

## Phase 5 — Growth tools ✅ (2026-09-27)

- **ig.me ref links + QR codes** (`ref_links`, migration 0010): `messaging_referral` (and first messages carrying a
  ref) open the 24h window; the link's welcome (tracked buttons), tag and optional flow run once per person per day.
- **Link-in-bio pages** (`bio_pages`, public `/b/{slug}` + `/api/public/bio/...`): links with click counts, views,
  and a "DM us" button that can open a ref link.
- **Instagram Live** scope for comment automations (live comments only reach "During Live" automations).
- **Click reminders**: one nudge for people who didn't open a comment-automation link, only while the window is open.
- **AI copywriter** (`POST /api/ai/write`) for DMs, public replies and captions.
- Not possible via the API: welcome DMs for new followers (no follow webhook).

## Phase 6 — Media library and content calendar ✅ (2026-09-26)

- **Media library** (`media_assets`, migration 0011, `/api/media`): upload images and videos from the dashboard. Images
  are converted to what Instagram accepts (JPEG, upright, at most 1440px wide and 8 MB); MP4 / MOV videos up to 300 MB are
  stored as uploaded. File types are detected from content, not the browser's claim. There is a per-workspace quota
  (`MEDIA_QUOTA_MB`, default 2 GB), and files used by upcoming posts can't be deleted.
- Files are served without login at `/api/files/{unguessable name}` so Instagram can download them. Publishing uploads
  therefore needs `PUBLIC_BASE_URL` to be public https. Without it, "publish now" explains why, and scheduled posts fail
  with the same reason when due.
- The composer takes library files or links. Feed photos are checked against Instagram's 4:5 – 1.91:1 aspect range.
- **Content calendar**: a month view of every post (`GET /api/posts?start=&end=`). Drag a scheduled post to another day
  (`POST /api/posts/{id}/reschedule`), or press + on a day to plan one. Any post can be duplicated.
- Next candidates: multi-account agency view, "Connect via Facebook Page" (competitor and hashtag research), and
  production readiness.

---

## Infrastructure triggers (unchanged from the original design)

- **Stay single-process** (in-process scheduler with a Postgres advisory lock) until webhook handling or background work
  can't keep up on one instance.
- **Add Celery + Redis** when comment volume makes the in-request background tasks slow Meta's webhook responses
  (Meta expects a 200 within a few seconds), or when private replies approach the 750/hour rate limit and need queuing.
- **Move media to object storage** (S3 / R2 behind the same `media_library` functions) when running more than one API
  instance, or when the host has no persistent disk for `MEDIA_DIR`.
- **Add read replicas / partitioning** only when the messages and instagram_comments tables make dashboard queries slow.
