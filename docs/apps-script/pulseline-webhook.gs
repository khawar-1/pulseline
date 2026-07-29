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
  var CAMPAIGN_ID = "44444444-4444-4444-8444-000000000004"; // Pulseline Live Demo
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
    campaign_id: CAMPAIGN_ID,
    response_id: e.response.getId(),
    full_name: answers.full_name || "",
    phone: answers.phone || "",
    reason: answers.reason || "",
  };
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
