# LaunchRelay

LaunchRelay turns real GitHub activity into source-grounded product education moments.

It is a GitHub-first workflow for product education, devrel, founder-led product marketing, and content teams that want to notice launch-worthy changes, shape the story with human judgment, and turn one shipped feature into a reusable education library.

Built for the Base44 Dev Build-Off as a real product workflow that can continue beyond the contest.

Live app: https://launch-relay-61e90395.base44.app
Repository: https://github.com/everyoya/launchrelay

## Product promise

LaunchRelay helps teams move from shipped work to product education:

Workspace → GitHub/manual import → Activity timeline → Launch detection → Human review → Story draft → Follow-up opportunities → Draft library

The goal is not “generate a marketing post from a prompt.”

The goal is to connect real product activity, detect the launch-worthy story inside it, let a human curate the framing, and generate traceable education content from the original source material.

## Why it exists

Product teams ship work constantly, but the educational story behind that work is easy to miss.

LaunchRelay gives product education and devrel teams a system for turning GitHub activity, manual notes, and product context into:

- launch-worthy moments
- source-grounded story drafts
- follow-up tutorials, FAQs, docs ideas, and enablement opportunities
- a saved draft/opportunity library

## First working scenario

The first product scenario focuses on onboarding improvements.

LaunchRelay can import activity from its own public GitHub repo and use that shipped work as source material. It also includes a manual onboarding workflow so the first product story remains easy to understand.

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

LaunchRelay does not start from a blank prompt.

It starts from source material:

- GitHub activity
- normalized product changes
- human context
- launch moment review
- source-linked drafts
- follow-up opportunities tied to the same shipped work

The app is designed around traceability and human curation, not one-click generic copy.

## Architecture overview

LaunchRelay is a Base44 app with a React/Vite frontend, Base44 entities, and deployed Base44 backend functions.

Frontend:

- React
- Vite
- Tailwind CSS
- Base44 SDK
- deterministic local fallback for reliability

Backend/data:

- Base44 entities for product workflow records
- Base44 backend functions for normalization, import, launch detection, and opportunity expansion
- public GitHub import path
- manual pasted activity fallback

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

The app includes 4 deployed backend functions:

1. normalizeActivity
2. importPublicGitHubActivity
3. detectLaunchMoments
4. expandOpportunities

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

Imports recent public GitHub activity from a repo URL or owner/repo input and converts it into LaunchRelay activity records.

### detectLaunchMoments

Creates source-linked launch moments from normalized activity.

### expandOpportunities

Creates follow-up product education opportunities from a launch moment.

## GitHub import strategy

The app supports public GitHub repo import, with LaunchRelay’s own repo as the first real source:

https://github.com/everyoya/launchrelay

The intended flow:

1. User enters or uses the default public repo URL.
2. Activity is imported from GitHub.
3. Imported activity becomes normalized ActivityItem records.
4. Launch detection uses those records as source material.

Known caveat:

Direct deployed backend GitHub fetch has returned 503 in the live app, so the current product preserves a browser-side public GitHub fetch plus deterministic normalization and Base44 entity writes as the reliable fallback path.

This should be described honestly as:

- public GitHub import exists
- the workflow works end-to-end
- server-side GitHub fetch needs further investigation before claiming all GitHub fetching is server-side

## Manual fallback

If GitHub import is unavailable, the app supports manual pasted activity.

Users can paste PR summaries, commit notes, release notes, or product notes. LaunchRelay normalizes that text into activity items and runs the same launch detection/story/opportunity flow.

This keeps the product usable even when public GitHub API access is rate-limited, unavailable, or blocked.

## AI and deterministic generation

LaunchRelay is structured for AI-assisted launch detection, story coproduction, and opportunity expansion.

Current honest status:

- deterministic generation/fallback is implemented for reliability
- optional LLM enhancement is planned but not yet active
- generated outputs are saved as product workflow records, not regenerated on every page load

This is intentional for product reliability and cost-conscious design.

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

- 11/11 tests pass
- secret lint passes with no obvious committed secrets
- production build completes successfully

## Current verification receipts

Latest local verification:

```text
npm test
- tests: 11
- pass: 11
- fail: 0

npm run lint:secrets
- No obvious committed secrets detected.

npm run build
- Vite production build completed successfully.
```

## Honest limitations

LaunchRelay is a working v1 product, but these limitations should be stated clearly:

1. Optional LLM enhancement is planned but not yet active.
2. Direct deployed backend GitHub fetch has returned 503, so the reliable current path includes browser-side public GitHub fetch plus deterministic fallback.
3. Public GitHub import is the v1 path; private repo OAuth is deferred.
4. Manual pasted activity remains important for reliability and non-GitHub scenarios.
5. Launch detection and opportunity expansion are currently deterministic/structured rather than fully AI-personalized.
6. Advanced collaboration, approvals, analytics, publishing, and team permissions are future product work.
7. The app is optimized around the first clear workflow scenario: onboarding-related shipped work.

## Roadmap

Near-term product improvements:

1. Investigate and fix deployed backend GitHub fetch 503.
2. Add optional LLM enhancement for launch detection, story drafts, and opportunities.
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

LaunchRelay is a Base44-built product education workflow that turns real GitHub activity into launch stories, drafts, and follow-up content opportunities. It demonstrates Base44 entities, backend functions, deployed app workflow, external GitHub-source ingestion, and source-grounded product logic.

Avoid saying:

- “AI writes your marketing posts.”
- “One-click content generator.”
- “Demo app.”
- “Fully autonomous launch marketing.”
- “Server-side GitHub import is fully solved” until the 503 caveat is fixed.
