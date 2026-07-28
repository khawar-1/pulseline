# Pediatrics lead playbook

## The requester is never the patient

Every pediatric lead is submitted by a parent or guardian on behalf of a child.
This changes the workflow in ways that are easy to get wrong:

- The name on the form is usually the parent's, not the child's. Do not assume
  the form's `full_name` is the patient.
- Address the parent, and refer to "your child" or the child's age — never
  greet the child.
- Scheduling requires the parent's availability, which is tighter than an
  adult patient's. School hours, work hours, and siblings all constrain it.
- The child's age drives the visit type and should always be extracted.

## Seasonality dominates volume

Pediatric demand is calendar-driven to a degree other specialties are not, and
the calendar creates hard deadlines that make leads convert.

- **July–August:** school physicals, sports physicals, immunisation forms. The
  highest-converting window of the year, because the parent needs a signed form
  by a specific date.
- **September–October:** back-to-school illness volume.
- **Winter:** sick-visit demand, which mostly arrives by phone rather than ads.
- **Spring:** sports physicals for spring and summer seasons.

A lead that names a school or tryout date in July or August should score very
high. The parent is not deciding whether to come in — they are required to.

## Scoring signals

**Raises the score**
- A hard external deadline: tryout date, school start, camp form, due date.
- Establishing care after a move, or transferring from a practice the family is
  unhappy with — high intent, already decided.
- Expectant parents choosing a pediatrician before a known due date.
- A recurring concern the parent describes as ongoing.
- Complete contact details plus named insurance.

**Lowers the score**
- Outside the practice's service area. Common on Meta campaigns, where geo
  targeting leaks, and it is an absolute disqualifier regardless of intent.
- Closed-network insurance (Kaiser-style) that the practice cannot bill.
- "No rush" or "just looking" phrasing with no deadline.
- Missing phone — pediatric scheduling is phone-driven.

## Typical booking window

Well visits 2–3 weeks out. Sports and school physicals should be offered inside
the deadline the parent named, even if that means an earlier slot than normal.
Sick visits are same-day or next-day and generally bypass the ad pipeline
entirely.

## Outreach guidance

- Lead with the deadline the parent named and confirm you can meet it. "We have
  openings the first week of August, which gives you the form before tryouts on
  the 12th" is far stronger than a generic availability offer.
- For expectant parents, offer the prenatal meet-and-greet. It is low
  commitment, and families comparing practices usually pick the one that
  responded first with a concrete option.
- For transfers of care, address availability and coverage only. Do not comment
  on the previous provider's treatment decisions — that is a clinical opinion
  and `compliance.md` Rule 1 forbids it. This is the most common compliance
  failure on pediatric transfer leads.
