# Cardiology lead playbook

## Referral status is the dominant signal

Cardiology is referral-driven in a way dermatology and pediatrics are not.
Patients rarely wake up and decide to see a cardiologist; a primary care
physician, a surgeon, or a lab result sends them.

Rank leads by how firm the referral is:

1. **Hard referral** — an active referral from a named physician, especially
   with paperwork in hand. The decision to be seen has already been made by
   someone else. This is the highest-converting lead type in the entire
   Pulseline dataset and should score in the 90s.
2. **Pre-operative clearance** — a surgeon requires cardiac clearance before a
   scheduled procedure. There is a fixed surgical date, which makes it a hard
   deadline as well as a referral. Also scores very high.
3. **Transfer of care** — an existing cardiology patient whose physician is
   retiring, or who is relocating. Already in treatment, often on medication,
   and cannot afford a gap. High intent.
4. **Soft referral** — "my doctor said I should see a cardiologist at some
   point." A real reason exists, but no timeline. Mid-range score. These
   convert on a specific offered slot and stall on an open invitation.
5. **Self-directed** — family history, a partner's urging, general concern. No
   external forcing function. Mid-to-low, but genuine.
6. **Administrative only** — insurance acceptance questions with no stated
   reason for visit. Cannot be scored properly until staff confirm network
   status. Not a low-intent lead so much as an unknown one.

## Insurance is a harder gate than in other specialties

Cardiology visits and downstream testing are expensive, so coverage decides
whether a lead is workable at all.

- **Medicare, often with a supplement,** is the dominant payer — the patient
  population skews older. Medicare plus supplement is a strong positive.
- **Medicare Advantage** plans vary by network and frequently require prior
  authorisation. Always confirm before scheduling; never assert acceptance.
- **Uninsured** is close to disqualifying for this specialty. Route to the
  practice's financial counselor rather than to scheduling. Attempting to book
  an uninsured cardiology lead wastes a slot and puts the patient in a bad
  position.

## The hard boundary: never triage

Cardiology leads sometimes describe symptoms that sound alarming. The agent must
not respond to symptom content at all — not to assess it, not to reassure, and
not to escalate.

Specifically, the agent must never:

- Suggest a lead is or is not urgent based on what they described.
- Tell anyone to go to an emergency room, or that they do not need to.
- Repeat symptom language back in an SMS (see `compliance.md`, Rule 2).

If a lead's form text describes acute symptoms, the correct action is to **flag
it for immediate human review in the tool output and draft nothing.** A
marketing agent is structurally the wrong actor to respond to that message, and
an automated reply of any kind is the wrong artifact. Escalate to a person.

This is the single most important rule in this playbook.

## Typical booking window

New-patient evaluations 2–4 weeks out. Referrals and pre-operative clearances
get prioritised into earlier slots because they have external deadlines.

## Outreach guidance

- **Referral leads:** the message is logistics. Where to send the paperwork,
  what coverage is accepted, what the next openings are. Do not restate why the
  referral was made.
- **Soft referrals:** offer two specific times. The obstacle is the absence of a
  timeline, and a concrete slot supplies one without manufacturing urgency,
  which Rule 4 forbids.
- **Transfers of care:** address records transfer and continuity of scheduling.
  Do not discuss medications — that is clinical.
- **Tone:** this patient population is older and often anxious. Plain, calm,
  unhurried. No marketing energy.
