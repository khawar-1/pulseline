/**
 * Pulseline Google Form intake webhook.
 *
 * Paste this into the Form's bound Apps Script project (Extensions > Apps
 * Script), set PULSELINE_WEBHOOK_SECRET as a Script Property, then wire it
 * up as an INSTALLABLE trigger -- see README.md in this folder. The reserved
 * simple-trigger name (a bare `onFormSubmit(e)` with no trigger configured
 * in the Triggers panel) does not get permission to call UrlFetchApp and
 * will fail silently.
 */
function onFormSubmit(e) {
  var WEBHOOK_URL = "https://your-app.vercel.app/api/webhooks/forms";
  // Match this EXACTLY to the campaign's practice name as typed into the
  // "New campaign" form in the dashboard -- the webhook looks it up by name
  // (case-insensitive), so there's no id to find or copy anywhere. Leave
  // CAMPAIGN_NAME blank and set CAMPAIGN_ID instead if you'd rather target
  // by id (find it via Supabase's table editor).
  var CAMPAIGN_NAME = "Pulseline Live Demo";
  var CAMPAIGN_ID = "";
  var SECRET = PropertiesService.getScriptProperties().getProperty("PULSELINE_WEBHOOK_SECRET");
  // Recording-day trick, not a general mechanism: pin a fixed session id so
  // you can point the console at ?session=<this value> BEFORE submitting the
  // form and watch that exact run's messages appear live. Leave blank ("") to
  // let each submission get its own random session -- fine outside a demo.
  var PINNED_SESSION_ID = "";

  var answers = {};
  e.response.getItemResponses().forEach(function (itemResponse) {
    var title = itemResponse.getItem().getTitle().trim().toLowerCase();
    if (title.indexOf("name") !== -1) {
      answers.full_name = itemResponse.getResponse();
    } else if (title.indexOf("phone") !== -1) {
      answers.phone = itemResponse.getResponse();
    } else if (title.indexOf("concern") !== -1 || title.indexOf("reason") !== -1) {
      answers.reason = itemResponse.getResponse();
    }
  });

  var payload = {
    response_id: e.response.getId(),
    full_name: answers.full_name || "",
    phone: answers.phone || "",
    reason: answers.reason || "",
  };
  if (CAMPAIGN_ID) {
    payload.campaign_id = CAMPAIGN_ID;
  } else if (CAMPAIGN_NAME) {
    payload.campaign_name = CAMPAIGN_NAME;
  }
  if (PINNED_SESSION_ID) {
    payload.session_id = PINNED_SESSION_ID;
  }

  UrlFetchApp.fetch(WEBHOOK_URL, {
    method: "post",
    contentType: "application/json",
    headers: { "X-Pulseline-Webhook-Secret": SECRET },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}
