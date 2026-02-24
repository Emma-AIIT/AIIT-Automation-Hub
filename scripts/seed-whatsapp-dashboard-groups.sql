-- Seed whatsapp_dashboard_groups with the 35 selected groups for the participants dashboard.
-- Run once in Supabase SQL Editor (or: psql $DATABASE_URL -f scripts/seed-whatsapp-dashboard-groups.sql).
-- Idempotent: re-running upserts and does not duplicate rows.

INSERT INTO public.whatsapp_dashboard_groups (group_id, group_name)
VALUES
  ('120363024669282426@g.us', 'The Hijra Project —Make The Move'),
  ('120363027087098570@g.us', 'Quran College Community'),
  ('120363028462428125@g.us', 'Quran College Community'),
  ('120363029002965248@g.us', 'Halal Food Directory AU'),
  ('120363029676124863@g.us', 'ISLAMIC HOMESCHOOLING SALAFI And Education'),
  ('120363029841996340@g.us', 'Muslim Businesses Melbourne™'),
  ('120363039712912666@g.us', 'DAILY DAHWAH GROUP'),
  ('120363045641757018@g.us', 'VISITS, DUA & AZZA'),
  ('120363047052738417@g.us', 'JANAZA ASSISTANCE- EDUCATION - ANNOUNCEMENTS'),
  ('120363048027045121@g.us', 'Reminders For The Believers'),
  ('120363049684454509@g.us', 'Islamic Q and A group 2'),
  ('120363134553393604@g.us', 'Islamic Medical Doctors, psychiatrist, psychologist'),
  ('120363147377076505@g.us', 'Muslim gumtree'),
  ('120363156374712811@g.us', 'Hajj 2026 Australia approved package Support Group'),
  ('120363185178033545@g.us', 'Water wells☝🏻 / food packs'),
  ('120363234341299529@g.us', 'MUSLIM BUSINESSES & WORK 2'),
  ('120363259429973740@g.us', 'Community Sadaqa Meals'),
  ('120363374432574845@g.us', 'Brothers Looking for Work 2'),
  ('120363402211828805@g.us', 'HASANAT CARE TEAM'),
  ('120363402579223061@g.us', 'DAR AL HOUDA'),
  ('120363404183213330@g.us', 'RAMADAN FREE FOOD'),
  ('120363407307386635@g.us', 'Sydney Ramadan Paid Volunteers Charities'),
  ('120363412752924950@g.us', 'Brothers trade group'),
  ('120363415115674204@g.us', 'Community Iftaars Sydney (BROTHERS Group)'),
  ('120363421289296582@g.us', 'Makanzi boxing group'),
  ('120363421854098853@g.us', 'DAR AL HOUDA'),
  ('120363423222704270@g.us', 'Al badeyah Arabians'),
  ('120363425180392942@g.us', 'Taraweeh @ 15/47 Allingham St Condel Park'),
  ('120363425712779619@g.us', 'Catherine field taraweeh'),
  ('61410815807-1632385655@g.us', 'Melbourne Brothers ASWJ Manhaj as Salafiyya ☝'),
  ('61452000009-1606934337@g.us', 'Quran and Sunnah Group 2'),
  ('61497777444-1617956400@g.us', 'MANHAJ AS-SALAF'),
  ('8613173867470-1615440259@g.us', 'Quran College Men')
ON CONFLICT (group_id) DO UPDATE SET group_name = EXCLUDED.group_name;
