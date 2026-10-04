# Meta App Review — GramForGrow (Instagram API with Instagram Login)

Everything needed to take the Meta app from Development mode (only testers can connect) to Live with Advanced Access, so any Instagram professional account can connect.

## 1. Permissions we request

From `backend/app/services/instagram/graph.py` (`SCOPES`). Request **Advanced Access** for each one, and only these — every extra permission is another chance of rejection.

| Permission | Where it is used in the product |
|---|---|
| `instagram_business_basic` | Connect page (username, picture, followers), post pickers in Comment → DM, Giveaways, Scheduler |
| `instagram_business_manage_comments` | Comment → DM automations (public reply + private reply), Moderation (hide/delete), Giveaways (read comments) |
| `instagram_business_manage_messages` | Inbox, Keyword Replies, Auto-Replies, Flow Builder, AI Agent, ice breakers |
| `instagram_business_content_publish` | Scheduler (photo, video, reel, carousel, story) |
| `instagram_business_manage_insights` | Insights page (reach, views, engagement, follows, per-post metrics, demographics) |

**Human Agent** is a separate feature with its own review. The "Human agent tag" toggle on the Instagram page uses it. Leave the toggle off and don't request it until the main review is approved.

## 2. Checklist before submitting

App Dashboard → **App settings → Basic**
- [ ] App icon 1024×1024, app name "GramForGrow", category "Business and pages"
- [ ] Privacy Policy URL: `https://gramforgrow.com/privacy` (lists every permission and its use, section 5)
- [ ] Terms of Service URL: `https://gramforgrow.com/terms`
- [ ] User data deletion: **Data deletion callback URL** `https://<backend>/api/webhooks/instagram/data-deletion`
- [ ] Contact email set and monitored

Instagram → **API setup with Instagram login**
- [ ] **Business login settings** → Redirect URL `https://gramforgrow.com/dashboard/instagram/callback` (must equal `INSTAGRAM_REDIRECT_URI` / `FRONTEND_URL`)
- [ ] Deauthorize callback `https://<backend>/api/webhooks/instagram/deauthorize`
- [ ] Data deletion request URL `https://<backend>/api/webhooks/instagram/data-deletion`
- [ ] Webhooks: callback `https://<backend>/api/webhooks/instagram`, verify token = `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`, fields subscribed: `comments`, `live_comments`, `messages`, `messaging_postbacks`, `messaging_seen`, `message_reactions`, `messaging_referral`

Business
- [ ] **Business Verification** done in Meta Business Manager (Advanced Access is blocked without it)
- [ ] App linked to that verified business portfolio
- [ ] Every permission above has been **successfully called at least once** in the last 30 days (the "Test" button turns green). Use a tester account: connect it, open Insights, schedule and publish a post, reply to a comment, send a DM.

Reviewer access
- [ ] A reviewer login for GramForGrow (email + password) on a workspace with a paid/unlocked plan so no feature is behind an upgrade gate
- [ ] A test Instagram professional account (Business or Creator, public) the reviewer can use — added as Instagram Tester and invite accepted — with its username/password in the review notes. Turn off 2FA on it or the reviewer can't log in
- [ ] At least one post on that account, so comment and insights flows have something to show

## 3. Screencast rules (why most submissions are rejected)

- **One video per permission** (or one video with clear chapters, uploaded on each permission). 1–4 minutes each, MP4, 1080p.
- Language **English**. If any UI text is not English, add English captions.
- Start **logged out**, show the full **Instagram login and permission consent screen**, with the permission visible on screen.
- Show the feature **end to end in our app *and* the result on Instagram** (e.g. the reply appearing in the Instagram app). The reviewer must see the data go both ways.
- No cuts in the middle of a flow. Add text overlays/captions saying what is happening — voice-over is optional, captions are better.
- Use a real-looking test account, not an empty one. Hide nothing that matters; blur only secrets.
- Screen resolution readable; zoom the browser to 110–125% if text is small.

## 4. Video scripts

Record the **Connect** segment once and start every video with it (or reuse the clip).

### 0. Connect (start of every video)
1. Open `gramforgrow.com`, click **Log in**, sign in as the reviewer user.
2. Sidebar → **Instagram** → **Connect with Instagram**.
3. Instagram login page → log in as the test account.
4. Consent screen: pause 2–3 s so all permissions are readable. Caption: *"The business grants GramForGrow these permissions."* Click **Allow**.
5. Back on the Instagram page: the account shows as connected with username, picture and follower count.

### 1. `instagram_business_basic`
1. Connect (above). Caption: *"We read the account's username, profile picture, account type and follower/media counts to show which account is connected."*
2. Open **Comment → DM → New automation** → post picker shows the account's posts. Caption: *"We list the account's posts so the business can choose which post an automation runs on."*
3. Open **Scheduler** → show the list of existing posts / calendar.

### 2. `instagram_business_manage_comments`
1. Connect.
2. **Comment → DM** → create automation: pick a post, keyword `PRICE`, public reply "Sent you a DM!", DM "Here is the price list…". Save and turn on.
3. On a phone (screen-record or side camera), from **a different Instagram account**, comment `PRICE` on that post.
4. Show in the Instagram app: the public reply under the comment, and the private reply DM.
5. Back in GramForGrow: show the conversation recorded in **Inbox**.
6. **Moderation** → turn on, add keyword `spam`, action **Hide**, save. From the other account comment `spam` on the post → show it in the moderation activity list and hidden in the Instagram app.
7. Caption at end: *"Comments are read only to run the business's own automations and moderation."*

### 3. `instagram_business_manage_messages`
1. Connect.
2. From another Instagram account, send a DM to the test account: "Hi, are you open today?"
3. GramForGrow **Inbox**: the message appears. Type a reply and send.
4. Show the reply arriving in the Instagram app on the other account.
5. **Keyword Replies**: add keyword `hours` → reply "We're open 10am–8pm". From the other account DM "hours" → show the automatic reply in Instagram.
6. Caption: *"We only message people who messaged the business first, inside Instagram's 24-hour window."*

### 4. `instagram_business_content_publish`
1. Connect.
2. **Scheduler → New post** → upload an image, write a caption, choose **Publish now** (or schedule 2 minutes ahead and wait on camera).
3. Show the post status changing to Published.
4. Open the Instagram app/profile → the new post is visible with the same caption.

### 5. `instagram_business_manage_insights`
1. Connect.
2. Sidebar → **Insights**: show account reach, views, engagement, follows/unfollows chart, then the per-post metrics table.
3. Caption: *"Insights are shown only to the business that owns the account, to measure its own performance."*
4. Optionally open Instagram app → Professional dashboard to show the numbers match.

## 5. Permission descriptions (paste into "How will this app use …")

**instagram_business_basic**
> GramForGrow is a tool businesses use to manage their own Instagram professional account. We use instagram_business_basic to read the connected account's ID, username, name, profile picture, account type and follower/media counts, so the business can see which account is connected, and to list the account's posts so the business can choose which post a comment automation, giveaway or scheduled post refers to. This data is shown only to members of the business's own workspace.

**instagram_business_manage_comments**
> Businesses use GramForGrow to respond to comments on their own posts. With instagram_business_manage_comments we receive comment webhooks and read comments on the business's media; when a comment matches a keyword the business configured, we post the business's public reply and send one private reply to the commenter. Businesses also use it to hide or delete spam and abusive comments (Moderation) and to pick giveaway winners from a post's comments. We never comment on other accounts' media.

**instagram_business_manage_messages**
> GramForGrow provides a shared inbox and automated replies for the business's Instagram Direct messages. With instagram_business_manage_messages we receive messages sent to the business, display them in the business's inbox, and send replies written by the business's team, by keyword rules the business set up, or by an AI assistant the business configured. We only message people who contacted the business first, within Instagram's 24-hour messaging window, and honour stop/unsubscribe requests.

**instagram_business_content_publish**
> GramForGrow includes a content scheduler. The business uploads a photo, video, reel, carousel or story with a caption, chooses a time, and we publish it to the business's own Instagram account at that time using instagram_business_content_publish. We publish only content the business created and explicitly scheduled.

**instagram_business_manage_insights**
> GramForGrow shows the business performance reports for its own Instagram account. With instagram_business_manage_insights we read account metrics (views, reach, engagement, follows) and per-post metrics (reach, likes, comments, shares, saves) and display them on the business's Insights dashboard. Insights are visible only to that business's workspace and are not shared or sold.

## 6. Reviewer notes (paste into "Notes for reviewer")

```
GramForGrow (https://gramforgrow.com) lets businesses automate and manage their own Instagram professional account.

1. Go to https://gramforgrow.com/login
   Email: <reviewer email>   Password: <password>
2. Sidebar → Instagram → "Connect with Instagram"
3. Log in with the test Instagram account:
   Username: <test IG username>   Password: <password>   (2FA is off)
4. Approve the permissions. You'll return to the Instagram page showing the connected account.

Where each permission is used:
- instagram_business_basic: Instagram page (account info), post picker in Comment → DM
- instagram_business_manage_comments: Automation → Comment → DM; Engagement → Moderation (keyword rules hide/delete comments)
- instagram_business_manage_messages: Inbox; Automation → Keyword Replies
- instagram_business_content_publish: Content → Scheduler → New post → Publish now
- instagram_business_manage_insights: Content → Insights

To test comments/DMs, comment or send a DM to the test account from any other Instagram account.
Privacy policy: https://gramforgrow.com/privacy  Data deletion: https://gramforgrow.com/data-deletion
```

## 7. After approval

1. App Dashboard → toggle **App mode: Live**.
2. Connect a non-tester account to confirm it works end to end.
3. Optionally hide the "Use an access token" button once OAuth works for everyone.
