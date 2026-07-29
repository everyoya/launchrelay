# Product Story

Product Story turns real GitHub activity into source-grounded product education moments.

It is a GitHub-first workflow for product education, devrel, founder-led product marketing, and content teams that want to notice launch-worthy changes, shape the story with human judgment, and turn one shipped feature into a reusable education library.

Built for the Base44 Dev Build-Off as a real product workflow that can continue beyond the contest.

Live app: https://launch-relay-61e90395.base44.app
Repository: https://github.com/everyoya/launchrelay

## Product promise

Product Story helps teams move from shipped work to product education:

Workspace → GitHub/manual/connected-source import → Activity timeline → Highlight detection → Human review → source-grounded draft → Follow-up opportunities → Library

The goal is not “generate a marketing post from a prompt.”

The goal is to connect real product activity, detect the launch-worthy story inside it, let a human curate the framing, and generate traceable education content from the original source material.

## Why it exists

Product teams ship work constantly, but the educational story behind that work is easy to miss.

Product Story gives product education and devrel teams a system for turning GitHub activity, manual notes, and product context into:

- launch-worthy moments
- source-grounded story drafts
- follow-up tutorials, FAQs, docs ideas, and enablement opportunities
- a saved draft/opportunity library

## First working scenario

The first product scenario focuses on onboarding improvements.

Product Story can import activity from its own public GitHub repo and use that shipped work as source material. It also includes a manual onboarding workflow so the first product story remains easy to understand.

Default repo used in the app:

https://github.com/everyoya/launchrelay

## Real app workflow

1. Create or use a product workspace.
2. Import public GitHub activity, or paste manual activity if GitHub import is unavailable.
3. Review normalized activity in the timeline.
4. Detect launch-worthy moments from the activity.
5. Accept, reject, or curate a suggested launch moment.
6. Generate a source-grounded story draft.
7. Generate follow-up product education opportunities.
8. Save drafts and opportunities to the library.

## What makes it different from a generic AI writer

Product Story does not start from a blank prompt.

It starts from source material:

- GitHub activity
- normalized product changes
- human context
- launch moment review
- source-linked drafts
- follow-up opportunities tied to the same shipped work

The app is designed around traceability and human curation, not one-click generic copy.

## Architecture overview

Product Story is a Base44 app with a React/Vite frontend, Base44 entities, and deployed Base44 backend functions.

Frontend:

- React
- Vite
- Tailwind CSS
- Base44 SDK
- deterministic local fallback for reliability

Backend/data:

- Base44 entities for product workflow records
- Base44 backend functions for normalization, import, launch detection, opportunity expansion, connected Google Drive import, and user-owned AI generation
- public GitHub import path
- manual pasted activity fallback
- app-user connector path prepared for GitHub/Google Drive once connector IDs are configured
- bring-your-own-AI router that only calls providers with a user-supplied key

## Base44 features used

### Base44 app/project

The project was created with the Base44 CLI and deployed as a Base44 app.

### Base44 entities

The app uses 7 Base44 entities:

1. ProductWorkspace
2. SourceConnection
3. ActivityItem
4. LaunchCluster
5. Draft
6. Opportunity
7. Asset

These entities support the core workflow:

- ProductWorkspace stores product context.
- SourceConnection tracks GitHub/manual source setup.
- ActivityItem stores normalized source activity.
- LaunchCluster stores detected launch-worthy change groups.
- Draft stores generated/editable story output.
- Opportunity stores follow-up product education ideas.
- Asset supports additional context and source material.

### Base44 backend functions

The app includes 6 deployed backend functions:

1. normalizeActivity
2. importPublicGitHubActivity
3. detectLaunchMoments
4. expandOpportunities
5. runUserAiGeneration
6. importConnectedGoogleDriveActivity

The frontend calls backend functions through:

```js
base44.functions.invoke(...)
```

A deterministic local fallback remains in the frontend so the workflow still works if a backend call or public GitHub request fails during live use.

## Backend receipts

Implemented backend function responsibilities:

### normalizeActivity

Turns raw/manual activity into normalized ActivityItem-shaped records.

### importPublicGitHubActivity

Imports recent public GitHub activity from a repo URL or owner/repo input and converts it into Product Story activity records.

### detectLaunchMoments

Creates source-linked launch moments from normalized activity.

### expandOpportunities

Creates follow-up product education opportunities from a launch moment.

### runUserAiGeneration

Runs optional user-owned AI generation for Highlights, drafts, and opportunities. It refuses to call an AI provider without a user-supplied provider key. Supported provider modes include OpenAI, Anthropic, Gemini, OpenRouter, and custom OpenAI-compatible endpoints.

### importConnectedGoogleDriveActivity

Uses a configured Base44 app-user Google Drive connector to normalize Drive/Docs files into Product Story activity records. The connector code path is implemented, but the production connector ID still needs to be configured in the app settings before this can be treated as a reliable v1 demo path.

## GitHub import strategy

The app supports public GitHub repo import, with Product Story’s own repo as the first real source:

https://github.com/everyoya/launchrelay

The intended flow:

1. User enters or uses the default public repo URL.
2. Activity is imported from GitHub.
3. Imported activity becomes normalized ActivityItem records.
4. Launch detection uses those records as source material.

Current reliability model:

The backend GitHub import function is callable and supports a backend-only GitHub token secret for reliable server-side API access.

Supported modes:

- `backend_secret_token` — preferred production path. Configure `LAUNCHRELAY_GITHUB_TOKEN` as a Base44 secret so the server sends authenticated GitHub API requests.
- `unauthenticated` — fallback path. Works for low-volume public imports but can hit GitHub's shared-IP rate limits.
- browser fallback — keeps public GitHub import usable if the server-side GitHub request is unavailable or rate-limited.

To configure the preferred token-backed import path:

```bash
# Use Base44's KEY=VALUE secret format here; paste the real token only in your terminal.
npx base44 secrets set '<backend GitHub token secret entry>'
npx base44 functions deploy importPublicGitHubActivity
```

Secret name: `LAUNCHRELAY_GITHUB_TOKEN`.

Use a minimal GitHub token where possible. For the current public-repo import, read-only public repository metadata is enough; private repo import should be treated as a later OAuth/user-connection feature.

## Connected-source strategy

Product Story now has prepared connector paths for GitHub and Google Drive through Base44 app-user OAuth connector IDs. The source setup UI keeps public GitHub and manual notes reliable for v1 while showing connected GitHub/Drive as the next account-level automation path once valid connector IDs are configured.

## Manual fallback

If GitHub import is unavailable, the app supports manual pasted activity.

Users can paste PR summaries, commit notes, release notes, or product notes. Product Story normalizes that text into activity items and runs the same launch detection/story/opportunity flow.

This keeps the product usable even when public GitHub API access is rate-limited, unavailable, or blocked.

## AI, deterministic generation, and guardrails

Product Story is structured for AI-assisted launch detection, story coproduction, and opportunity expansion.

Current honest status:

- deterministic generation/fallback is implemented for reliability
- an anti-slop content guardrail harness is implemented for draft generation
- optional bring-your-own-AI generation is implemented through `runUserAiGeneration`
- no Product Story-owned paid AI key is committed, stored, or used for user generation
- generated outputs are saved as product workflow records, not regenerated on every page load

The content guardrail harness includes:

- banned corporate/AI-slop phrase detection
- plain-language replacement rules
- content readiness checks
- interview-question generation when context is missing
- content template metadata
- psychological driver selection
- source-trail preservation

This is intentional for product reliability and cost-conscious design. AI output should pass through this same harness before it is saved.

## How to run locally

Prerequisites:

- Node.js
- npm
- Base44 project access if testing deployed Base44 integration

Install dependencies:

```bash
npm install
```

Run local development server:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

Preview production build locally:

```bash
npm run preview
```

## How to verify

Run the test suite:

```bash
npm test
```

Run the secret lint check:

```bash
npm run lint:secrets
```

Run the production build:

```bash
npm run build
```

Expected current result:

- 63/63 tests pass
- secret lint passes with no obvious committed secrets
- production build completes successfully

## Current verification receipts

Latest local verification:

```text
npm test
- tests: 63
- pass: 63
- fail: 0

npm run lint:secrets
- No obvious committed secrets detected.

npm run build
- Vite production build completed successfully.
```

## Honest limitations

Product Story is a working v1 product, but these limitations should be stated clearly:

1. The deterministic/sample/manual workflow is still the safest live demo path.
2. BYO-AI is implemented, but it requires a user-provided provider key and should be used deliberately, not automatically.
3. Public GitHub import is reliable for the v1 story; private GitHub/Google Drive OAuth needs valid Base44 app-user connector IDs before it should be shown as a guaranteed demo path.
4. Manual pasted activity remains important for reliability and non-GitHub scenarios.
5. Launch detection and opportunity expansion always have deterministic structured fallbacks.
6. Advanced collaboration, approvals, analytics, publishing, and team permissions are future product work.
7. The app is optimized around the first clear workflow scenario: onboarding-related shipped work.

## Roadmap

Near-term product improvements:

1. Finalize Base44 app-user connector IDs for GitHub and Google Drive.
2. Harden BYO-AI provider UX with better validation, saved non-secret preferences, and clearer error states.
3. Improve source traceability in generated drafts.
4. Add richer manual context fields for positioning, audience, and product area.
5. Polish onboarding as the first complete product scenario.
6. Improve asset/screenshot support.

Later roadmap:

1. GitHub OAuth/private repo import.
2. Background sync/webhooks.
3. Team collaboration and review workflow.
4. Draft versioning and approval states.
5. Docs/changelog/support-ticket connectors.
6. Content calendar and performance feedback loop.
7. More advanced launch-moment ranking and prioritization.

## Suggested submission framing

Product Story is a Base44-built product education workflow that turns shipped work into launch stories, drafts, and follow-up content opportunities. It demonstrates Base44 entities, backend functions, deployed app workflow, public GitHub/manual source ingestion, prepared GitHub/Google Drive connector paths, bring-your-own-AI generation, and source-grounded product logic.

Avoid saying:

- “AI writes your marketing posts.”
- “One-click content generator.”
- “Demo app.”
- “Fully autonomous launch marketing.”
- “Connected GitHub/Google Drive OAuth is guaranteed live” until valid Base44 connector IDs are configured.
