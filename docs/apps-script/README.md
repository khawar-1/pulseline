# Google Form -> Pulseline webhook setup

One-time setup to make a real Google Form trigger the live automation.

1. **Create the form** with three questions: a short-answer "Name", a
   short-answer "Phone", and a paragraph "Medical Concern" (or "Reason for
   visit" -- the script matches on "concern" or "reason" in the title). Field
   titles matter: `pulseline-webhook.gs` matches on substrings of the
   question title, not fixed IDs, so keep those words in the titles.

2. **Open the script editor**: in the Form, Extensions -> Apps Script. Paste
   the contents of `pulseline-webhook.gs` into `Code.gs`, replacing the
   placeholder `WEBHOOK_URL` with your deployed origin
   (`https://<your-app>.vercel.app/api/webhooks/forms`) and `CAMPAIGN_NAME`
   with the *exact* practice name of the campaign this form should feed --
   whatever you typed into "Practice name" when creating it via "+ New
   campaign" in the dashboard (case doesn't matter, the rest of the string
   does). The webhook looks the campaign up by that name; there's no id to
   go find anywhere. If you'd rather target by id instead (e.g. you have two
   campaigns with the same practice name), leave `CAMPAIGN_NAME` blank and
   set `CAMPAIGN_ID` to the row's id from Supabase's table editor -- an
   explicit id always wins over a name if both are set.

3. **Set the shared secret**: Project Settings (gear icon) -> Script
   Properties -> Add property `PULSELINE_WEBHOOK_SECRET`, value matching
   `FORMS_WEBHOOK_SECRET` in the app's environment. Never paste the secret
   directly into the script file.

4. **Wire an installable trigger** -- this is the step that's easy to get
   wrong: Triggers (clock icon, left sidebar) -> Add Trigger -> function
   `onFormSubmit` -> event source "From form" -> event type "On form submit"
   -> Save, and grant the requested permissions. A bare function named
   `onFormSubmit` with no trigger configured here runs as a *simple* trigger,
   which Google sandboxes without network access -- `UrlFetchApp.fetch` will
   silently do nothing. The installable trigger set up through this panel is
   what actually grants the external-request permission.

5. **Test it**: submit the form once, then check the app's `webhook_events`
   table in Supabase for a `source='forms'` row moving from `received` to
   `processed`, and the `leads` table for a new row under the live-demo
   campaign.

6. **Optional, for recording day only**: to watch a submission's parse ->
   score -> draft -> compliance-review sequence live in the console instead
   of only in the pipeline pane, generate a UUID (e.g.
   `crypto.randomUUID()` in a browser console, or any UUID generator) and
   paste it into `PINNED_SESSION_ID` in `pulseline-webhook.gs`. Open the
   console at `https://<your-app>.vercel.app/?session=<that-uuid>` *before*
   submitting the form -- the console subscribes to that session's messages
   over Realtime and they'll appear as the automated run happens. Leave
   `PINNED_SESSION_ID` blank outside of a recording; each submission then
   gets its own random session, which is the right default.
