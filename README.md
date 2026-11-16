# Tired Social Platform
Independent social events and talent marketplace. **No Laravel.**

## Current implementation
A React/TypeScript interface served by Node.js with a responsive, customizable interface:
- Discover/filter events; save events and RSVP locally.
- Write posts, like, comment and follow; Following/Latest/For you feeds.
- Create friend-plan drafts.
- Create event listings, optionally require local review, approve in organizer studio.
- Browse/list talent and save booking estimates with explicit illustrative fees.
- Theme, accent, density, motion and profile preferences; JSON export/reset.

**This is an interactive browser-local preview.** Seed people/listings are fictional.
No real users are contacted. No payments, tickets, accounts or provider availability are connected.
Production backend integrations are tracked in docs/BACKLOG.md.

## Run
Requires Node.js 22+.
```sh
npm install
npm run build
npm start
```
Open http://localhost:8080. The built HTTP runtime uses Node.js built-ins; building requires the pinned npm dependencies.

## Verify
```sh
npm install
npm run check
npm test
npx playwright install --with-deps chromium
npm run test:browser
```
GitHub Actions runs these checks and builds the Docker image.
Screenshots are attached to the workflow run.

## Project continuity
- [Master plan](docs/PLAN.md)
- [Prioritized backlog](docs/BACKLOG.md)
- [Session checkpoint](docs/SESSION.md)
- [Google Cloud deployment](docs/DEPLOYMENT.md)

The UI uses strict TypeScript and reusable React components. Existing browser-local data uses the same storage key; shared-account backend integration is the next foundation task.
Dockerfile and cloudbuild.yaml are supplied; **a Google Cloud deployment is not yet verified**.
