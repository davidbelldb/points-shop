-- Dirty Talk — word bank tuning.
-- Keep only the rude words David wanted (voluptuous, nymphomania, cunnilingus,
-- lascivious, titillate, aphrodisiac, promiscuous); drop the rest; add cruder
-- filth + a set of commonly-mispronounced "catch her out" words.

DELETE FROM jstw_word_bank WHERE word IN (
  'ORGASMIC','CLITORIS','TESTICLES','SEDUCTION','FORNICATE','LUBRICANT',
  'EJACULATE','SEXUALITY','GENITALIA','MASTURBATE','DOMINATRIX','SUBMISSIVE',
  'SEDUCTRESS','EROTICALLY','PROVOCATIVE','INTERCOURSE'
);

-- Cruder additions
INSERT INTO jstw_word_bank (word, syllables) VALUES
  ('MOTHERFUCKER','["moth","er","fuck","er"]'),
  ('COCKSUCKER','["cock","suck","er"]'),
  ('CLUSTERFUCK','["clus","ter","fuck"]'),
  ('COCKWOMBLE','["cock","wom","ble"]'),
  ('TWATWAFFLE','["twat","waf","fle"]'),
  ('WHOREMONGER','["whore","mon","ger"]'),
  ('FINGERBANG','["fin","ger","bang"]'),
  ('TEABAGGING','["tea","bag","ging"]'),
  ('ANALINGUS','["an","a","lin","gus"]'),
  ('FELLATIO','["fel","la","ti","o"]'),
  ('MOTORBOAT','["mo","tor","boat"]'),
  ('WANKER','["wank","er"]'),
  ('BELLEND','["bell","end"]'),
  ('MINGER','["min","ger"]')
ON CONFLICT (word) DO NOTHING;

-- Phonetically debatable / commonly mispronounced — the trip-up words.
-- (Several are short / 2-syllable, so they only get served if the admin bands
--  are lowered below 8 letters / 3 syllables.)
INSERT INTO jstw_word_bank (word, syllables) VALUES
  ('BURY','["bur","y"]'),
  ('ALMOND','["al","mond"]'),
  ('SALMON','["sal","mon"]'),
  ('COLONEL','["col","o","nel"]'),
  ('SUBTLE','["sub","tle"]'),
  ('NICHE','["niche"]'),
  ('SEGUE','["seg","ue"]'),
  ('QUINOA','["qui","no","a"]'),
  ('GNOCCHI','["gnoc","chi"]'),
  ('ANEMONE','["a","nem","o","ne"]'),
  ('EPITOME','["e","pit","o","me"]'),
  ('MISCHIEVOUS','["mis","chie","vous"]'),
  ('HYPERBOLE','["hy","per","bo","le"]'),
  ('FEBRUARY','["feb","ru","a","ry"]'),
  ('WEDNESDAY','["wed","nes","day"]'),
  ('MAYONNAISE','["may","on","naise"]'),
  ('PREROGATIVE','["pre","rog","a","tive"]'),
  ('ESPRESSO','["es","pres","so"]'),
  ('WORCESTER','["wor","ces","ter"]'),
  ('ANTARCTIC','["ant","arc","tic"]'),
  ('RENDEZVOUS','["ren","dez","vous"]')
ON CONFLICT (word) DO NOTHING;
