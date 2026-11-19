# tired.events domain connection
The apex now uses a Google-managed Cloud Run domain mapping. Cloudflare serves the www redirect to the apex. The original audit below dates from November 16, 2026. See the [current launch verification](SESSION.md#production-launch-verification) before changing any records.

The user selected tired.events for the independent social platform. tiredevents.com remains separate.
No DNS, certificate, email, Worker, billing, or IAM changes were made during this audit.

## Current web routing and recovery

The apex is DNS-only. Its four A records are `216.239.32.21`, `216.239.34.21`, `216.239.36.21` and `216.239.38.21`. The corresponding AAAA records are `2001:4860:4802:32::15`, `2001:4860:4802:34::15`, `2001:4860:4802:36::15` and `2001:4860:4802:38::15`. Compare these with the current Cloud Run domain mapping before restoring a changed record. Each of the eight IPv4 and IPv6 addresses served the expected revision with a valid certificate for the production hostname. A private DNS rehearsal restored the saved answers after a missing apex record.

The www A record is proxied, points to `192.0.2.1` and uses automatic TTL. The Cloudflare Single Redirect named **Redirect www to tired.events** matches `http.host eq "www.tired.events"`. It returns 301 to `concat("https://tired.events", http.request.uri.path)` with query preservation enabled. This redirect runs at the edge. Both observed edge IPv4 addresses passed the path and query test.

For an application regression, keep DNS in place and use the verified Cloud Run release rollback in [DEPLOYMENT.md](DEPLOYMENT.md). For a web-record change, restore the last working apex and www configuration above and check TLS, the public revision and the www redirect. The former origin at `136.110.237.35` reset the TLS connection during the drill. A switch back to the former site would require a working legacy endpoint.

The November 18 check also confirmed the three SES DKIM aliases, four ACM validation aliases, Google Workspace MX records, the auth CloudFront alias and an HTTP 200 from the separate API hostname. The original [apex configuration](https://agent.tinyfish.ai/runs/463f6125-34b4-44bd-b8ea-e71e518de32f), [www record change](https://agent.tinyfish.ai/runs/8a4d8308-0bb8-41d0-8dbf-0c9cfa2cfc3a) and [redirect rule](https://agent.tinyfish.ai/runs/657b4591-bc84-4942-b8ba-c93d6a1dedef) document the cutover.

## November 16 Cloudflare audit
- Zone active; nameservers benedict.ns.cloudflare.com and pearl.ns.cloudflare.com.
- Apex and www: A to 136.110.237.35, DNS-only, TTL 300 seconds.
- Full (strict) mode configured; edge certificates reported active. DNS-only traffic does not use Cloudflare proxy TLS.
- Existing Google Workspace MX and Amazon SES DKIM records must be preserved.
- Existing auth subdomain points to AWS CloudFront; preserve its certificate validation records.
- No cache or redirect rules were shown in inspected rule lists.
- Worker routing is not fully reconciled: the route list appeared empty but the overview showed tired-api connected to api.tired.events/*. Treat this as an existing dependency; do not overwrite.
- Empty redirect-rule lists do not establish whether Always Use HTTPS or origin redirects are enabled.
- DNSSEC, complete TXT records, origin TLS and current site content were not conclusively verified.

## Original target configuration
| Item | Target |
|---|---|
| Primary hostname | tired.events |
| Secondary hostname | www.tired.events; redirect to primary after deployment and certificate validation |
| Origin | Verified deployment of tiredofdointm/tired-social-platform on Google Cloud; endpoint not yet available |
| DNS change | Replace only apex/www web routing after obtaining exact destination records from the selected Google Cloud domain frontend |
| TLS | Preserve Full (strict); validate hostname-matching origin certificate before enabling proxy |
| HTTPS | Verify origin HTTPS and existing redirects before adding hostname-scoped HTTP-to-HTTPS redirect |
| Cache | Honor origin headers; bypass private/auth/API responses; do not add Cache Everything |
| Email/auth/API | Preserve existing records and services; do not repurpose auth or api subdomains for the new app |
| Staging access | Preserve authenticated staging; a DNS record does not authenticate Cloudflare requests to Cloud Run |
| Rollback | The former IP reset a TLS connection on November 18. Keep the current DNS in place for an application rollback and use the previous Cloud Run revision as described in DEPLOYMENT.md |

Do not point a CNAME at an arbitrary run.app URL and assume custom Host routing or IAM will work.
Select and validate a supported Google Cloud domain frontend and its access model first.
Do not enable HSTS preload or includeSubDomains before all existing subdomains are audited.

## Verification before marking connected
1. Confirm intended Google project, billing and API/deployment permissions.
2. Deploy the tested repository revision and verify its health endpoint and rendered UI.
3. Configure custom-domain routing and hostname-matching certificates; test authenticated/public access as intended.
4. Capture fresh DNS values immediately before cutover; preserve mail/auth/API and validation records.
5. Change only approved web records; verify DNS, HTTPS, canonical redirect and application behavior.
6. Record exact resource IDs, revision and successful checks in SESSION.md.

## Evidence
- Cloudflare audit: https://agent.tinyfish.ai/runs/94f41e4b-e585-4913-a0b7-afefd58431e4
- Google project reconciliation: https://agent.tinyfish.ai/runs/bf040de2-7f2b-44f6-9be1-9bf29adc250a
- Focused Google access audit: https://agent.tinyfish.ai/runs/5e7c0256-b6f7-4286-a0e9-270573b61289

## Provider references
- https://docs.cloud.google.com/run/docs/mapping-custom-domains
- https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/
- https://developers.cloudflare.com/cache/how-to/cache-rules/settings/

## Previous Google prerequisite check (historical)
Project ID tired-social-platform, display name Tired Social Platform. Settings and IAM show an owner role.
The project has no billing account linked. Attempting to enable Cloud Run returned Billing required.
The earlier generic permission warning does not establish missing IAM rights. No deployable endpoint is verified.
API attempt: https://agent.tinyfish.ai/runs/940e2811-f88d-4e52-9aa6-7a4c23ce7ece

## Previous billing selector result (historical)
The only displayed account, My Billing Account, is closed. A costs-view permission warning was also shown.
No billing linkage was submitted. A billing administrator must reopen it or provide an active account.
Evidence: https://agent.tinyfish.ai/runs/3d46e89e-454a-4037-9475-c2c5b75730f1

## Billing prerequisite cleared
Latest inspection reports billing active and linked to tired-social-platform.
Cloud Run, Cloud Build and Artifact Registry APIs are enabled.
Evidence: https://agent.tinyfish.ai/runs/cded7627-0fde-48b2-a4bb-637ea97a8ee4
Staging reached Cloud Build GitHub authorization but stopped at GitHub login.
No service was created; origin and DNS cutover remain unverified.
Evidence: https://agent.tinyfish.ai/runs/d81cb122-4b1e-49a5-a2a3-34a197a0b4bc

## Historical staging verification
GitHub authorization is now complete and a Cloud Build succeeded. The console inspection
reports an existing healthy tired-social-staging service, but direct /healthz on its reported
URL returned HTTP 404. Actual service YAML, revision, routing, authentication and instance
limits must be verified before using it as a domain origin. DNS remains unchanged.
