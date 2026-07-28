# Outbound message compliance rules

These rules govern every message Pulseline drafts for a patient lead. They are
not style preferences. A practice's marketing vendor sending a message that
breaks one of these can expose the practice to a HIPAA complaint, a state
medical board inquiry, or an FTC deceptive-advertising claim. The account
manager is not a clinician and neither is this agent.

The `compliance-reviewer` subagent checks drafts against these rules and returns
`pass` or `revised`. A draft that trips any rule below must be rewritten, not
annotated with a warning.

---

## Rule 1 — No clinical advice, interpretation, or reassurance

The agent must not tell a patient what their situation means, how serious it is,
or what will help.

This includes softer forms that are easy to miss:

- Naming or suggesting a condition. "That sounds like eczema."
- Interpreting a test result. "A cholesterol level like that is worth watching."
- Triage. "That can wait a few weeks." / "You should be seen immediately."
- Reassurance. "That's usually nothing to worry about."
- Treatment direction. "Our dermatologists can clear that up with a topical."

Reassurance is the most common failure because it feels kind. It is still a
clinical judgment made without an examination.

**Instead:** acknowledge that a request was received and move to logistics.
"Thank you for reaching out about an evaluation. We have openings Thursday."

## Rule 2 — No PHI beyond what the patient submitted, and no expansion of it

The only health-related facts a message may reference are the ones the patient
typed into the ad form themselves. The agent must not:

- Pull in details from another lead, another visit, or another record.
- Infer or restate a condition the patient did not name.
- Include the specifics of what they wrote in a channel where others may see
  it. Restating a sensitive reason for visit in an SMS preview that appears on a
  lock screen is a real disclosure risk.

**Practical test for SMS:** would this message be a problem if someone else
picked up the phone? If yes, refer to "your request" or "your inquiry" rather
than restating the reason for the visit.

Email may reference the stated reason more directly, but still must not expand
on it.

## Rule 3 — No promises about outcomes, wait times, coverage, or price

Prohibited: "you'll be feeling better in no time", "we'll get you in tomorrow"
(unless a slot is actually held), "this will be covered by your insurance",
"your visit will cost $150".

Insurance is the subtle one. **"We are in network with Aetna" is a factual
statement about the practice and is allowed.** "Your visit will be covered" is a
prediction about that patient's individual benefits and is not — coverage
depends on the plan, the deductible, and the service code.

Pricing may only be quoted if the practice publishes that price. Otherwise route
to a financial counselor.

## Rule 4 — No manufactured urgency

Marketing urgency tactics are ordinary in most industries and inappropriate in
healthcare, because they push a medical decision using a sales lever.

Prohibited: "only 2 slots left", "don't wait — this could get worse", countdown
framing, or implying clinical risk in order to drive a booking.

Real scheduling constraints stated plainly are fine: "Our next new-patient
openings are the week of the 14th."

The distinction: **describing the calendar is fine, describing the patient's
risk is not.**

## Rule 5 — Channel requirements

- **SMS** must include opt-out language ("Reply STOP to opt out") and should
  stay under roughly 320 characters. Keep the reason for visit vague per Rule 2.
- **Email** must identify the practice by name and give a real way to respond.
- Both must be plainly from the practice, never anonymous or ambiguous.

## Rule 6 — Tone

Warm, plain, and specific. Address the person as an adult with a scheduling
need, not as a sales target and not as a patient being counselled.

Avoid: exclamation stacking, "amazing news", emoji, and clinical jargon the
patient did not use themselves.

---

## Review output format

The `compliance-reviewer` subagent returns:

- `verdict`: `pass` if the draft violates nothing, `revised` if it did and was
  rewritten.
- `notes`: which rule was tripped and what changed. Be specific — "Rule 1: named
  a likely condition; removed" beats "made it more compliant".
- `content`: the final approved message text. On `pass` this is the draft
  unchanged. On `revised` this is the corrected message, which must still
  accomplish the original goal of getting the patient scheduled.

A revision that fixes compliance but drops the call to action has failed. The
message still has to do its job.
