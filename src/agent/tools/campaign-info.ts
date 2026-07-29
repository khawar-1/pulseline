import { tool } from "langchain";
import * as z from "zod";

import { fetchCampaign, toolError, toolResult } from "./shared";

/**
 * Read-only static practice facts: hours and the booking link.
 *
 * Separate from get_campaign_kpis on purpose — that tool answers "how is this
 * campaign performing", this one answers "what does the front desk actually
 * say when someone asks when we're open or how to book". Keeping them apart
 * means a question about hours never accidentally pulls spend/conversion
 * numbers into a patient-facing answer, and vice versa.
 */
export const getCampaignInfo = tool(
  async ({ campaign_id }) => {
    const campaign = await fetchCampaign(campaign_id);
    if (!campaign) return toolError(`No campaign found with id ${campaign_id}.`);

    return toolResult({
      ok: true,
      campaign_id,
      practice_name: campaign.practice_name,
      practice_type: campaign.practice_type,
      hours: campaign.hours,
      booking_url: campaign.booking_url,
    });
  },
  {
    name: "get_campaign_info",
    description:
      "Read a campaign's static practice facts: office hours and the patient " +
      "booking link. Use this to answer a lead's question about when the " +
      "practice is open, and to get the real booking_url when a lead is ready " +
      "to schedule or explicitly asks to book online. hours or booking_url may " +
      "be null if the practice has not supplied them — if so, say you don't " +
      "have that on file rather than guessing. Never invent hours or a link.",
    schema: z.object({
      campaign_id: z.string().uuid(),
    }),
  },
);
