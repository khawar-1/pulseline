-- Pulseline demo seed data. Run after schema.sql.
-- All data is synthetic. No real patient information appears here.
--
-- Shape of the seed matters for the demo:
--   * Each campaign has 4 already-worked leads so the KPI view shows real,
--     non-round numbers instead of zeroes.
--   * Each campaign has 3 untouched leads (raw_payload only, stage 'new') so
--     the agent has genuine work to do on camera.
--   * raw_payload mirrors the actual field_data shape Google and Meta lead
--     forms post, including inconsistent key naming and free-text answers.
--     That mess is the reason ingest_lead exists.

truncate webhook_events, chat_messages, stage_events, followups, leads, campaigns restart identity cascade;

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------

insert into campaigns (id, practice_name, practice_type, ad_source, spend, hours, booking_url, created_at) values
  ('11111111-1111-4111-8111-000000000001', 'Lakeshore Dermatology',      'dermatology', 'google_search', 4820.00,
   'Mon-Fri 8:00am-5:00pm, Sat 9:00am-1:00pm. Closed Sundays.', 'https://book.lakeshorederm.example/new-patient', now() - interval '38 days'),
  ('22222222-2222-4222-8222-000000000002', 'Brightpath Pediatrics',      'pediatrics',  'meta_feed',     3145.50,
   'Mon-Fri 7:30am-6:00pm, Sat 8:00am-12:00pm. Closed Sundays.', 'https://book.brightpathpeds.example/new-patient', now() - interval '31 days'),
  ('33333333-3333-4333-8333-000000000003', 'Meridian Heart & Vascular',  'cardiology',  'google_search', 6710.00,
   'Mon-Fri 8:00am-4:30pm. Closed weekends.', 'https://book.meridianheart.example/new-patient', now() - interval '45 days'),
  -- Dedicated destination for real leads from the live Google Form webhook,
  -- kept separate from the three seeded ad campaigns above so a live demo
  -- run never pollutes their KPI numbers. Re-running this file resets it to
  -- zero leads every time (see the truncate above).
  ('44444444-4444-4444-8444-000000000004', 'Pulseline Live Demo',        'dermatology', 'direct_form',   0.00,
   'Mon-Fri 9:00am-5:00pm. Closed weekends.', 'https://book.pulseline-demo.example/new-patient', now());

-- ---------------------------------------------------------------------------
-- Lakeshore Dermatology (google_search)
-- ---------------------------------------------------------------------------

insert into leads (id, campaign_id, raw_payload, parsed, score, score_reasoning, stage, created_at) values
  ('a0000001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-000000000001',
   '{"form_id":"gads-derm-0041","gclid":"Cj0KCQjw_derm_1a2b","submitted_at":"2026-07-09T14:22:11Z","field_data":[{"name":"full_name","values":["Marisa Delgado"]},{"name":"email","values":["m.delgado@fastmail.com"]},{"name":"phone_number","values":["+1 312 555 0147"]},{"name":"what_brings_you_in","values":["Interested in botox for forehead lines before my sister wedding in August"]},{"name":"insurance_provider","values":["Self-pay / cosmetic"]},{"name":"preferred_time","values":["Weekday afternoons"]}]}',
   '{"full_name":"Marisa Delgado","email":"m.delgado@fastmail.com","phone":"+13125550147","reason":"Botox for forehead lines","intent":"cosmetic","deadline":"August (family event)","insurance":"self-pay","preferred_time":"weekday afternoons","urgency_signals":["named a hard date","self-pay removes insurance friction"],"contact_completeness":"full"}',
   88, 'Self-pay cosmetic with a named deadline in August. Both phone and email present, and a stated scheduling window. Cosmetic derm converts fast when the patient sets their own date.', 'booked', now() - interval '18 days'),

  ('a0000002-0000-4000-8000-000000000002', '11111111-1111-4111-8111-000000000001',
   '{"form_id":"gads-derm-0041","gclid":"Cj0KCQjw_derm_9x8y","submitted_at":"2026-07-16T09:05:44Z","field_data":[{"name":"full_name","values":["Trevor Nunes"]},{"name":"email","values":["tnunes84@gmail.com"]},{"name":"phone_number","values":["3125550982"]},{"name":"what_brings_you_in","values":["mole on my back has changed shape and color over the last 2 months, want it looked at"]},{"name":"insurance_provider","values":["Blue Cross Blue Shield IL"]},{"name":"preferred_time","values":["Any"]}]}',
   '{"full_name":"Trevor Nunes","email":"tnunes84@gmail.com","phone":"+13125550982","reason":"Changing mole on back","intent":"medical","insurance":"Blue Cross Blue Shield IL","preferred_time":"any","urgency_signals":["patient reports change over time","open scheduling availability"],"contact_completeness":"full"}',
   91, 'Medical-intent dermatology with named insurance and fully open availability. Patient describes a change over time, which in derm marketing correlates with high follow-through on booking. Routed for prompt scheduling; no clinical interpretation offered.', 'responded', now() - interval '11 days'),

  ('a0000003-0000-4000-8000-000000000003', '11111111-1111-4111-8111-000000000001',
   '{"form_id":"gads-derm-0041","gclid":"Cj0KCQjw_derm_4m5n","submitted_at":"2026-07-19T17:41:02Z","field_data":[{"name":"full_name","values":["Priya Raman"]},{"name":"email","values":["praman.home@outlook.com"]},{"name":"phone_number","values":[""]},{"name":"what_brings_you_in","values":["my daughter is 15 and has persistent acne, tried otc for a year"]},{"name":"insurance_provider","values":["Aetna"]},{"name":"preferred_time","values":["After 4pm"]}]}',
   '{"full_name":"Priya Raman","email":"praman.home@outlook.com","phone":null,"reason":"Teen acne, OTC treatments unsuccessful for ~1 year","intent":"medical","patient_is_requester":false,"insurance":"Aetna","preferred_time":"after 4pm","urgency_signals":["long-standing concern","narrow scheduling window"],"contact_completeness":"email only"}',
   64, 'Medical intent with insurance, but no phone number and a narrow after-4pm window, which limits outreach channels and available slots. Parent is the requester, adding a scheduling coordination step.', 'contacted', now() - interval '8 days'),

  ('a0000004-0000-4000-8000-000000000004', '11111111-1111-4111-8111-000000000001',
   '{"form_id":"gads-derm-0041","gclid":"Cj0KCQjw_derm_7q2w","submitted_at":"2026-07-12T21:13:55Z","field_data":[{"name":"full_name","values":["Dana Whitfield"]},{"name":"email","values":["dwhit@proton.me"]},{"name":"phone_number","values":["3125551166"]},{"name":"what_brings_you_in","values":["how much is a full body skin check, just price shopping right now"]},{"name":"insurance_provider","values":["None / paying cash"]},{"name":"preferred_time","values":["Not sure yet"]}]}',
   '{"full_name":"Dana Whitfield","email":"dwhit@proton.me","phone":"+13125551166","reason":"Price inquiry for full body skin check","intent":"price_shopping","insurance":"none","preferred_time":"undecided","urgency_signals":[],"disqualifying_signals":["explicitly price shopping","no scheduling intent"],"contact_completeness":"full"}',
   22, 'Contact details are complete but the patient explicitly framed the inquiry as price shopping with no scheduling intent and no insurance. Low booking likelihood without a promotional offer.', 'lost', now() - interval '15 days'),

  -- Untouched: raw_payload only. This is what the agent works in the demo.
  ('a0000005-0000-4000-8000-000000000005', '11111111-1111-4111-8111-000000000001',
   '{"form_id":"gads-derm-0041","gclid":"Cj0KCQjw_derm_3h4j","submitted_at":"2026-07-26T08:31:20Z","field_data":[{"name":"full_name","values":["Colin Abernathy"]},{"name":"email","values":["cabernathy@workmail.com"]},{"name":"phone_number","values":["+1 312 555 0713"]},{"name":"what_brings_you_in","values":["Recurring rash on both forearms for about 3 weeks, getting worse. Dermatitis maybe? Need someone to look soon."]},{"name":"insurance_provider","values":["United Healthcare"]},{"name":"preferred_time","values":["Mornings, flexible"]}]}',
   null, null, null, 'new', now() - interval '1 day'),

  ('a0000006-0000-4000-8000-000000000006', '11111111-1111-4111-8111-000000000001',
   '{"form_id":"gads-derm-0041","gclid":"Cj0KCQjw_derm_6t7y","submitted_at":"2026-07-26T19:47:08Z","field_data":[{"name":"full_name","values":["Yelena Sorokina"]},{"name":"email","values":["y.sorokina@gmail.com"]},{"name":"phone_number","values":[""]},{"name":"what_brings_you_in","values":["laser hair removal pricing and packages"]},{"name":"insurance_provider","values":["N/A cosmetic"]},{"name":"preferred_time","values":["Saturdays only"]}]}',
   null, null, null, 'new', now() - interval '1 day'),

  ('a0000007-0000-4000-8000-000000000007', '11111111-1111-4111-8111-000000000001',
   '{"form_id":"gads-derm-0041","gclid":"Cj0KCQjw_derm_8u9i","submitted_at":"2026-07-27T07:12:39Z","field_data":[{"name":"full_name","values":["Marcus Idowu"]},{"name":"email","values":["m.idowu@northshore.co"]},{"name":"phone_number","values":["3125552204"]},{"name":"what_brings_you_in","values":["Dermatologist recommended follow up after biopsy at another clinic, need to establish care here. Have records."]},{"name":"insurance_provider","values":["Cigna PPO"]},{"name":"preferred_time","values":["Any weekday"]}]}',
   null, null, null, 'new', now() - interval '6 hours');

-- ---------------------------------------------------------------------------
-- Brightpath Pediatrics (meta_feed)
-- ---------------------------------------------------------------------------

insert into leads (id, campaign_id, raw_payload, parsed, score, score_reasoning, stage, created_at) values
  ('b0000001-0000-4000-8000-000000000001', '22222222-2222-4222-8222-000000000002',
   '{"leadgen_id":"6721904455","form_name":"Brightpath - New Patient","platform":"instagram","created_time":"2026-07-08T13:02:00+0000","field_data":[{"name":"full_name","values":["Alicia Ferraro"]},{"name":"email","values":["aferraro.mom@gmail.com"]},{"name":"phone_number","values":["+16305550119"]},{"name":"child_age","values":["11"]},{"name":"reason_for_visit","values":["Need sports physical before soccer tryouts Aug 12"]},{"name":"insurance","values":["Cigna"]}]}',
   '{"full_name":"Alicia Ferraro","email":"aferraro.mom@gmail.com","phone":"+16305550119","patient_is_requester":false,"child_age":11,"reason":"Sports physical","intent":"routine_time_bound","deadline":"2026-08-12 (soccer tryouts)","insurance":"Cigna","urgency_signals":["hard external deadline","seasonal physical demand"],"contact_completeness":"full"}',
   93, 'Sports physical with a hard external deadline of Aug 12 and complete contact details plus insurance. Time-bound routine visits are the highest-converting pediatric lead type because the parent has already committed to a date.', 'booked', now() - interval '19 days'),

  ('b0000002-0000-4000-8000-000000000002', '22222222-2222-4222-8222-000000000002',
   '{"leadgen_id":"6721904781","form_name":"Brightpath - New Patient","platform":"facebook","created_time":"2026-07-14T20:55:00+0000","field_data":[{"name":"full_name","values":["Devon Marsh"]},{"name":"email","values":["devon.marsh@icloud.com"]},{"name":"phone_number","values":["6305550287"]},{"name":"child_age","values":["0"]},{"name":"reason_for_visit","values":["baby due in september, looking for a pediatrician to establish with beforehand"]},{"name":"insurance","values":["Blue Cross PPO"]}]}',
   '{"full_name":"Devon Marsh","email":"devon.marsh@icloud.com","phone":"+16305550287","patient_is_requester":false,"child_age":0,"reason":"Prenatal pediatrician selection, baby due September","intent":"establish_care","deadline":"September 2026 (due date)","insurance":"Blue Cross PPO","urgency_signals":["known due date","actively comparing practices"],"contact_completeness":"full"}',
   79, 'Expectant parent establishing care ahead of a September due date. Complete contact details and insurance. Prenatal meet-and-greets convert well but the family is likely comparing several practices, so speed of response matters more than usual.', 'responded', now() - interval '13 days'),

  ('b0000003-0000-4000-8000-000000000003', '22222222-2222-4222-8222-000000000002',
   '{"leadgen_id":"6721905003","form_name":"Brightpath - New Patient","platform":"instagram","created_time":"2026-07-20T11:19:00+0000","field_data":[{"name":"full_name","values":["Sam Okonkwo"]},{"name":"email","values":[""]},{"name":"phone_number","values":["6305550344"]},{"name":"child_age","values":["4"]},{"name":"reason_for_visit","values":["third ear infection since spring, current doctor keeps giving antibiotics, want a second opinion"]},{"name":"insurance","values":["Medicaid"]}]}',
   '{"full_name":"Sam Okonkwo","email":null,"phone":"+16305550344","patient_is_requester":false,"child_age":4,"reason":"Recurring ear infections, seeking second opinion","intent":"transfer_care","insurance":"Medicaid","urgency_signals":["recurring concern","dissatisfied with current provider"],"contact_completeness":"phone only"}',
   71, 'Motivated transfer-of-care request with a recurring concern, which drives follow-through. Phone only and no email narrows outreach to a single channel. Medicaid acceptance must be confirmed by staff before scheduling.', 'contacted', now() - interval '7 days'),

  ('b0000004-0000-4000-8000-000000000004', '22222222-2222-4222-8222-000000000002',
   '{"leadgen_id":"6721905219","form_name":"Brightpath - New Patient","platform":"facebook","created_time":"2026-07-11T16:38:00+0000","field_data":[{"name":"full_name","values":["Rhea Kapoor"]},{"name":"email","values":["rhea.kapoor22@gmail.com"]},{"name":"phone_number","values":["2135550771"]},{"name":"child_age","values":["7"]},{"name":"reason_for_visit","values":["do you have any locations in los angeles"]},{"name":"insurance","values":["Kaiser"]}]}',
   '{"full_name":"Rhea Kapoor","email":"rhea.kapoor22@gmail.com","phone":"+12135550771","patient_is_requester":false,"child_age":7,"reason":"Asking about Los Angeles locations","intent":"out_of_area","insurance":"Kaiser","urgency_signals":[],"disqualifying_signals":["outside service area","Kaiser is typically closed-network"],"contact_completeness":"full"}',
   8, 'Patient is in Los Angeles and the practice serves the Chicago western suburbs. Out of service area, and Kaiser is typically a closed network. Not bookable regardless of intent.', 'lost', now() - interval '16 days'),

  ('b0000005-0000-4000-8000-000000000005', '22222222-2222-4222-8222-000000000002',
   '{"leadgen_id":"6721905588","form_name":"Brightpath - New Patient","platform":"instagram","created_time":"2026-07-26T15:24:00+0000","field_data":[{"name":"full_name","values":["Nadia Brooks"]},{"name":"email","values":["nbrooks.fam@gmail.com"]},{"name":"phone_number","values":["+1 630 555 0466"]},{"name":"child_age","values":["6"]},{"name":"reason_for_visit","values":["kindergarten physical and shots, school starts Aug 24 and they need the form"]},{"name":"insurance","values":["Aetna Better Health"]}]}',
   null, null, null, 'new', now() - interval '1 day'),

  ('b0000006-0000-4000-8000-000000000006', '22222222-2222-4222-8222-000000000002',
   '{"leadgen_id":"6721905712","form_name":"Brightpath - New Patient","platform":"facebook","created_time":"2026-07-27T02:08:00+0000","field_data":[{"name":"full_name","values":["Grant Whelan"]},{"name":"email","values":["gwhelan@zoho.com"]},{"name":"phone_number","values":[""]},{"name":"child_age","values":["9"]},{"name":"reason_for_visit","values":["just moved to the area, need a new pediatrician, no rush"]},{"name":"insurance","values":["Humana"]}]}',
   null, null, null, 'new', now() - interval '20 hours'),

  ('b0000007-0000-4000-8000-000000000007', '22222222-2222-4222-8222-000000000002',
   '{"leadgen_id":"6721905904","form_name":"Brightpath - New Patient","platform":"instagram","created_time":"2026-07-27T12:45:00+0000","field_data":[{"name":"full_name","values":["Teresa Vaughn"]},{"name":"email","values":["tvaughn.rn@gmail.com"]},{"name":"phone_number","values":["6305550588"]},{"name":"child_age","values":["2"]},{"name":"reason_for_visit","values":["toddler has been pulling at ear and fussy for two days, can we get in this week"]},{"name":"insurance","values":["United Healthcare"]}]}',
   null, null, null, 'new', now() - interval '4 hours');

-- ---------------------------------------------------------------------------
-- Meridian Heart & Vascular (google_search)
-- ---------------------------------------------------------------------------

insert into leads (id, campaign_id, raw_payload, parsed, score, score_reasoning, stage, created_at) values
  ('c0000001-0000-4000-8000-000000000001', '33333333-3333-4333-8333-000000000003',
   '{"form_id":"gads-cardio-0117","gclid":"Cj0KCQjw_card_2b3c","submitted_at":"2026-07-06T10:14:33Z","field_data":[{"name":"full_name","values":["Harold Behrens"]},{"name":"email","values":["h.behrens@comcast.net"]},{"name":"phone_number","values":["7085550231"]},{"name":"reason_for_visit","values":["My primary care doctor referred me to a cardiologist for an evaluation. I have the referral paperwork."]},{"name":"insurance_provider","values":["Medicare + AARP supplement"]},{"name":"referred_by","values":["Dr. Lin, Oakbrook Primary Care"]}]}',
   '{"full_name":"Harold Behrens","email":"h.behrens@comcast.net","phone":"+17085550231","reason":"Cardiology evaluation, physician referral in hand","intent":"referral","referred_by":"Dr. Lin, Oakbrook Primary Care","insurance":"Medicare + AARP supplement","urgency_signals":["active physician referral","paperwork already in hand","Medicare accepted"],"contact_completeness":"full"}',
   96, 'Active physician referral with paperwork in hand and Medicare plus supplement coverage. Referral-driven cardiology leads are the highest-converting segment because the decision to be seen has already been made by the referring physician.', 'booked', now() - interval '21 days'),

  ('c0000002-0000-4000-8000-000000000002', '33333333-3333-4333-8333-000000000003',
   '{"form_id":"gads-cardio-0117","gclid":"Cj0KCQjw_card_5f6g","submitted_at":"2026-07-17T15:52:07Z","field_data":[{"name":"full_name","values":["Gloria Pantoja"]},{"name":"email","values":["gpantoja@yahoo.com"]},{"name":"phone_number","values":["7085550478"]},{"name":"reason_for_visit","values":["bloodwork came back with high cholesterol and my doctor said i should see a cardiologist at some point"]},{"name":"insurance_provider","values":["Blue Cross Blue Shield"]},{"name":"referred_by","values":[""]}]}',
   '{"full_name":"Gloria Pantoja","email":"gpantoja@yahoo.com","phone":"+17085550478","reason":"Elevated cholesterol on recent bloodwork, soft referral","intent":"soft_referral","insurance":"Blue Cross Blue Shield","urgency_signals":["recent lab result"],"softening_signals":["at some point phrasing indicates no fixed timeline"],"contact_completeness":"full"}',
   68, 'Recent lab result gives a concrete reason to be seen and contact details plus insurance are complete, but the patient quoted their doctor as saying at some point, indicating no fixed timeline. Needs an outreach that offers a specific slot rather than an open invitation.', 'contacted', now() - interval '10 days'),

  ('c0000003-0000-4000-8000-000000000003', '33333333-3333-4333-8333-000000000003',
   '{"form_id":"gads-cardio-0117","gclid":"Cj0KCQjw_card_8j9k","submitted_at":"2026-07-22T08:27:19Z","field_data":[{"name":"full_name","values":["Wendell Fry"]},{"name":"email","values":["wfry1952@aol.com"]},{"name":"phone_number","values":[""]},{"name":"reason_for_visit","values":["do you take united healthcare medicare advantage"]},{"name":"insurance_provider","values":["UHC Medicare Advantage"]},{"name":"referred_by","values":[""]}]}',
   '{"full_name":"Wendell Fry","email":"wfry1952@aol.com","phone":null,"reason":"Insurance acceptance question","intent":"insurance_verification","insurance":"UHC Medicare Advantage","urgency_signals":[],"blocking_signals":["no stated clinical reason","no phone number","cannot proceed until network status confirmed"],"contact_completeness":"email only"}',
   41, 'Insurance verification question with no stated reason for visit and no phone number. Cannot be scored higher until network status is confirmed by staff, which is a prerequisite rather than a sales step. Genuine intent is unknown.', 'scored', now() - interval '5 days'),

  ('c0000004-0000-4000-8000-000000000004', '33333333-3333-4333-8333-000000000003',
   '{"form_id":"gads-cardio-0117","gclid":"Cj0KCQjw_card_1n2m","submitted_at":"2026-07-13T22:41:56Z","field_data":[{"name":"full_name","values":["Cody Reinhart"]},{"name":"email","values":["creinhart.tmp@mailinator.com"]},{"name":"phone_number","values":["7085550903"]},{"name":"reason_for_visit","values":["no insurance right now, what does a visit cost out of pocket"]},{"name":"insurance_provider","values":["Uninsured"]},{"name":"referred_by","values":[""]}]}',
   '{"full_name":"Cody Reinhart","email":"creinhart.tmp@mailinator.com","phone":"+17085550903","reason":"Out-of-pocket cost inquiry, uninsured","intent":"price_shopping","insurance":"none","urgency_signals":[],"disqualifying_signals":["uninsured for a high-cost specialty","disposable email domain","no clinical reason stated"],"contact_completeness":"full"}',
   14, 'Uninsured cost inquiry for a high-cost specialty with a disposable email domain and no stated clinical reason. Cardiology out-of-pocket pricing is a common bounce point. Route to the practice financial counselor rather than to scheduling.', 'lost', now() - interval '14 days'),

  ('c0000005-0000-4000-8000-000000000005', '33333333-3333-4333-8333-000000000003',
   '{"form_id":"gads-cardio-0117","gclid":"Cj0KCQjw_card_4r5t","submitted_at":"2026-07-26T11:09:41Z","field_data":[{"name":"full_name","values":["Annette Kowalczyk"]},{"name":"email","values":["akowalczyk@sbcglobal.net"]},{"name":"phone_number","values":["+1 708 555 0655"]},{"name":"reason_for_visit","values":["Cardiologist I have seen for 6 years is retiring and my records need to move to a new practice. Need to stay on my current medication schedule."]},{"name":"insurance_provider","values":["Medicare"]},{"name":"referred_by","values":["Dr. Osei (retiring)"]}]}',
   null, null, null, 'new', now() - interval '1 day'),

  ('c0000006-0000-4000-8000-000000000006', '33333333-3333-4333-8333-000000000003',
   '{"form_id":"gads-cardio-0117","gclid":"Cj0KCQjw_card_7w8e","submitted_at":"2026-07-27T06:33:12Z","field_data":[{"name":"full_name","values":["Pete Salvatore"]},{"name":"email","values":[""]},{"name":"phone_number","values":["7085550117"]},{"name":"reason_for_visit","values":["wife wants me to get my heart checked, im 58 and my dad had issues at my age"]},{"name":"insurance_provider","values":["Aetna PPO"]},{"name":"referred_by","values":[""]}]}',
   null, null, null, 'new', now() - interval '7 hours'),

  ('c0000007-0000-4000-8000-000000000007', '33333333-3333-4333-8333-000000000003',
   '{"form_id":"gads-cardio-0117","gclid":"Cj0KCQjw_card_0p9o","submitted_at":"2026-07-27T13:58:27Z","field_data":[{"name":"full_name","values":["Ingrid Halvorsen"]},{"name":"email","values":["i.halvorsen@nwmed.org"]},{"name":"phone_number","values":["7085550390"]},{"name":"reason_for_visit","values":["Need pre-operative cardiac clearance before knee replacement scheduled for Sept 15. Surgeon requires it."]},{"name":"insurance_provider","values":["Blue Cross PPO"]},{"name":"referred_by","values":["Dr. Whitmore, orthopedic surgery"]}]}',
   null, null, null, 'new', now() - interval '3 hours');

-- ---------------------------------------------------------------------------
-- Stage history for the already-worked leads
-- ---------------------------------------------------------------------------

insert into stage_events (lead_id, campaign_id, from_stage, to_stage, created_at)
select l.id, l.campaign_id, s.from_stage, s.to_stage, l.created_at + s.offset_after
from leads l
join (values
  ('new',       'scored',    interval '2 hours'),
  ('scored',    'contacted', interval '5 hours'),
  ('contacted', 'responded', interval '2 days'),
  ('responded', 'booked',    interval '3 days')
) as s(from_stage, to_stage, offset_after) on true
where l.stage = 'booked';

insert into stage_events (lead_id, campaign_id, from_stage, to_stage, created_at)
select l.id, l.campaign_id, s.from_stage, s.to_stage, l.created_at + s.offset_after
from leads l
join (values
  ('new',       'scored',    interval '3 hours'),
  ('scored',    'contacted', interval '7 hours'),
  ('contacted', 'responded', interval '2 days')
) as s(from_stage, to_stage, offset_after) on true
where l.stage = 'responded';

insert into stage_events (lead_id, campaign_id, from_stage, to_stage, created_at)
select l.id, l.campaign_id, s.from_stage, s.to_stage, l.created_at + s.offset_after
from leads l
join (values
  ('new',    'scored',    interval '4 hours'),
  ('scored', 'contacted', interval '9 hours')
) as s(from_stage, to_stage, offset_after) on true
where l.stage = 'contacted';

insert into stage_events (lead_id, campaign_id, from_stage, to_stage, created_at)
select l.id, l.campaign_id, 'new', 'scored', l.created_at + interval '4 hours'
from leads l where l.stage in ('scored', 'lost');

insert into stage_events (lead_id, campaign_id, from_stage, to_stage, created_at)
select l.id, l.campaign_id, 'scored', 'lost', l.created_at + interval '2 days'
from leads l where l.stage = 'lost';

-- ---------------------------------------------------------------------------
-- Follow-up messages already sent, with the compliance verdict recorded.
-- Note that none of these interpret symptoms, offer reassurance about a
-- condition, or promise an outcome -- they acknowledge what the patient wrote
-- and move to scheduling. That is the bar draft_followup has to clear.
-- ---------------------------------------------------------------------------

insert into followups (lead_id, channel, content, compliance_verdict, compliance_notes, sent_at) values
  ('a0000001-0000-4000-8000-000000000001', 'sms',
   'Hi Marisa, this is Lakeshore Dermatology following up on your request about cosmetic treatment ahead of your sister''s wedding in August. We have weekday afternoon consultations open and can get you scheduled with time to spare before the date you mentioned. Would Tuesday or Thursday afternoon work better? Reply STOP to opt out.',
   'pass', 'No clinical claims. References only the event timing and scheduling preference the patient supplied. Includes SMS opt-out language.',
   now() - interval '17 days'),

  ('a0000002-0000-4000-8000-000000000002', 'email',
   'Hello Trevor,' || chr(10) || chr(10) || 'Thank you for reaching out to Lakeshore Dermatology. We received your request for an evaluation and we have availability this week.' || chr(10) || chr(10) || 'Because you mentioned open scheduling, we can offer you our earliest opening rather than waiting for a specific slot. We accept Blue Cross Blue Shield IL, so please bring your card and a photo ID.' || chr(10) || chr(10) || 'Reply to this email or call us at (312) 555-0100 and we will get you on the schedule.' || chr(10) || chr(10) || 'Lakeshore Dermatology Patient Coordination',
   'pass', 'Deliberately avoids characterising or interpreting what the patient described. Offers prompt scheduling without implying urgency on clinical grounds. Confirms insurance acceptance only, which is administrative rather than clinical.',
   now() - interval '10 days'),

  ('a0000003-0000-4000-8000-000000000003', 'email',
   'Hello Priya,' || chr(10) || chr(10) || 'Thank you for contacting Lakeshore Dermatology about an appointment for your daughter. We have after-4pm openings on Tuesdays and Thursdays, which matches the window you mentioned.' || chr(10) || chr(10) || 'We are in network with Aetna. If you can reply with a good phone number, our coordinator can confirm a time in a couple of minutes.' || chr(10) || chr(10) || 'Lakeshore Dermatology Patient Coordination',
   'revised', 'First draft named the condition and suggested a treatment category. Revised to remove both. The message now acknowledges only the appointment request and addresses the missing phone number, which was the actual blocker.',
   now() - interval '7 days'),

  ('b0000001-0000-4000-8000-000000000001', 'sms',
   'Hi Alicia, Brightpath Pediatrics here. You asked about a sports physical before tryouts on Aug 12 -- we have openings the first week of August that would give you the completed form in time. Want me to hold one? Reply STOP to opt out.',
   'pass', 'References only the date and visit type the parent provided. No clinical content. Includes opt-out.',
   now() - interval '18 days'),

  ('b0000002-0000-4000-8000-000000000002', 'email',
   'Hello Devon,' || chr(10) || chr(10) || 'Congratulations, and thank you for considering Brightpath Pediatrics.' || chr(10) || chr(10) || 'We offer complimentary prenatal meet-and-greet visits so you can meet the pediatrician and see the office before your September due date. These are about 20 minutes and there is no charge.' || chr(10) || chr(10) || 'We are in network with Blue Cross PPO. Reply with a couple of times that work and we will get you booked.' || chr(10) || chr(10) || 'Brightpath Pediatrics',
   'pass', 'Describes a practice offering and network status. Makes no claim about care quality or outcomes and gives no medical guidance.',
   now() - interval '12 days'),

  ('b0000003-0000-4000-8000-000000000003', 'sms',
   'Hi Sam, this is Brightpath Pediatrics returning your inquiry about establishing care for your 4-year-old. We are accepting new patients and our team can confirm your Medicaid coverage over the phone. Is there a good time to reach you today? Reply STOP to opt out.',
   'revised', 'First draft referenced the recurring symptom the parent described and implied the current treatment approach could be reconsidered here. Both removed -- that is a clinical opinion the practice cannot offer before a visit. Revised to cover new-patient availability and coverage verification only.',
   now() - interval '6 days'),

  ('c0000001-0000-4000-8000-000000000001', 'email',
   'Hello Mr. Behrens,' || chr(10) || chr(10) || 'Thank you for contacting Meridian Heart & Vascular. We received your request and see that you have referral paperwork from Dr. Lin at Oakbrook Primary Care.' || chr(10) || chr(10) || 'You can send the referral to records@meridianheart.example or bring it to your visit. We accept Medicare with an AARP supplement.' || chr(10) || chr(10) || 'Our next new-patient evaluations are open the week of the 14th. Call (708) 555-0100 and we will schedule you.' || chr(10) || chr(10) || 'Meridian Heart & Vascular',
   'pass', 'Administrative and logistical only -- referral handling, coverage, scheduling. No interpretation of why the referral was made.',
   now() - interval '20 days'),

  ('c0000002-0000-4000-8000-000000000002', 'sms',
   'Hi Gloria, Meridian Heart & Vascular following up on your request for an evaluation. We have a Thursday 2:15pm and a Monday 9:30am open and we are in network with Blue Cross Blue Shield. Would either of those work? Reply STOP to opt out.',
   'revised', 'First draft referenced the lab result the patient mentioned and framed booking as time-sensitive. Removed -- characterising a lab value or implying urgency is clinical advice. Revised to offer two concrete times, which addresses the real obstacle: the patient had no fixed timeline.',
   now() - interval '9 days');
