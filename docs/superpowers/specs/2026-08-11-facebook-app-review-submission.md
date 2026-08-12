# Meta App Review Submission — leads_retrieval & pages_manage_metadata

## Permissions requested
- `leads_retrieval` — read lead data via Graph API after a leadgen webhook fires.
- `pages_manage_metadata` — subscribe the customer's Page to our app's leadgen webhook field.
- `pages_show_list`, `pages_read_engagement` — list the Pages the connecting user manages, and read basic Page info to display the connected Page's name in Settings.

## How each permission is used (for the reviewer)
[Screen recording script:]
1. Admin opens AutoBizPro Settings → Integrations → Facebook Lead Ads.
2. Clicks "התחבר עם פייסבוק" ("Connect with Facebook").
3. Meta's OAuth consent screen appears; admin selects their Page and approves.
4. Redirected back to Settings; card shows "✓ מחובר לעמוד: <Page name>".
5. A test lead is submitted via Meta's own Lead Ads Testing Tool.
6. The lead appears in AutoBizPro's Leads list within seconds, with source "פייסבוק".

## Privacy policy
https://autobizproil.netlify.app/privacy.html

## Data use
Only name, phone, and email from the lead form are stored, scoped to the connecting tenant, used
solely to populate the CRM's Leads list. No data is shared with third parties. See the privacy
policy for the full statement.
