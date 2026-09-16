# Website analytics

This optional, first-party measurement records consenting website sessions, page views, and fixed click categories. It does not establish installs, signups, purchases, or advertising attribution.

## Enable on a runtime

The feature is disabled unless `ANALYTICS_DB_PATH` names an absolute SQLite file in an existing writable private directory outside `public`. Provision that directory as durable storage owned by the application user, with restrictive permissions. Set `ANALYTICS_ALLOWED_ORIGINS` to comma-separated exact public origins, such as `https://example.com,https://www.example.com`; without it, the request base origin is used.

Mount `server.analytics.router` before the static mount. It removes data older than 90 days and stops collection when storage is unavailable or reaches 200,000 rows. Keep endpoint access logs free of client IP addresses, request bodies, and query strings. The application never stores raw IP addresses; rate-limit keys are process-random HMAC values held only in memory. Use one application worker for the bounded in-memory limiter.

## Consent and collection

Load `/assets/css/analytics.css` and `/assets/js/analytics.js` on the supported LV/EN marketing pages. The client recognizes home, tutorial, help, terms, privacy, and `/get`; unknown routes are no-ops. It never sends URLs, query strings, fragments, referrers, account IDs, coordinates, form values, arbitrary attributes, or error messages. Requests omit credentials and use `referrerPolicy: no-referrer`.

The configuration endpoint returns only `enabled`. Before consent, the client only reads that configuration and the saved preference. The preference key is `shurp-analytics-consent-v1`; no tracking cookie or persistent visitor identifier is created. Consent may still be given for the current document if storage is blocked. Withdrawing consent clears unsent events and the memory-only session. GPC/DNT prevent initialization. Each document load creates a new random session only after consent.

`/get` may record an `app_redirect` only when earlier consent exists. It never shows a consent prompt, and analytics must not delay its redirect.

## Event contract

Call `window.ShurpAnalytics.track(event, props)`; the client adds `page` and `locale`. Invalid events are dropped by the client and rejected by the server.

| Event | Props |
| --- | --- |
| `page_view` | none |
| `store_click` | `platform`, `placement` |
| `navigation_click` | `target`, `placement` |
| `app_redirect` | `platform` |

`platform` is `ios`, `android`, or `other`. `placement` is `header`, `hero`, `footer`, `result`, or `body`. `target` is a fixed marketing-page, section, language, download, or `external_service` category. The client constructs payloads only from these fixed enums and never includes a link URL or label.

POST `/api/analytics/events` accepts JSON `{session: UUIDv4, events: [{event, seq, props}]}` with at most 20 events, an 8 KiB body, and a three-second body deadline. Server timestamps are used; duplicate session/sequence pairs do not insert twice. The limiter caps 120 events per network address per minute and 1,200 globally. Origins are browser protection, not proof of authenticity, so counts are directional only.

## Private report and verification

Run `python -m server.analytics_report --days 7` inside the application container. The database stays private and the report contains totals, distinct document sessions per event, fixed category breakdowns, and an ordered page-view-to-store-click funnel. It does not export raw sessions.

Run backend tests inside Docker with `python -m unittest discover -s tests -p test_analytics.py`. Browser checks cover consent, blocked storage, GPC/DNT, collector availability, private-data exclusion, navigation, and redirects before rollout.
