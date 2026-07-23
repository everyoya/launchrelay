# LaunchRelay

LaunchRelay turns shipped product work into product education moments.

It is a GitHub-first product education workflow system built for the Base44 Dev Build-Off 2026.

Core loop:

Workspace → GitHub/manual import → Activity timeline → Launch detection → Human review → Story Studio → Opportunities → Draft Library

## Base44 contest backend

Created with Base44 CLI.

Base44 App ID:

`6a62127209117f2a61e90395`

Dashboard:

https://app.base44.com/apps/6a62127209117f2a61e90395/editor/workspace/overview

## Backend capabilities used/planned

1. Auth / user management
2. Entities / database
3. Backend functions
4. AI / LLM with deterministic fallback

## Credit-conscious design

The product stores generated outputs as entities and includes deterministic fallbacks, so expensive AI calls are explicit, cached, and optional rather than automatic on every page load.

## Safety and secrets

Never commit real secrets.

Use `.env.example` as the template for local environment variables.
