-- Just Say The Word — harder words (8–12 letters, 3+ syllables), plus a rude set
-- for the grown-ups. Azure scores against the reference text acoustically, so
-- crude words assess exactly like any other.
INSERT INTO jstw_word_bank (word, syllables) VALUES
  -- Tongue-twisting clean ones
  ('CINNAMON','["cin","na","mon"]'),
  ('ELEVATOR','["el","e","va","tor"]'),
  ('ALLIGATOR','["al","li","ga","tor"]'),
  ('HELICOPTER','["hel","i","cop","ter"]'),
  ('CALCULATOR','["cal","cu","la","tor"]'),
  ('VOCABULARY','["vo","cab","u","lar","y"]'),
  ('THERMOMETER','["ther","mom","e","ter"]'),
  ('CATERPILLAR','["cat","er","pil","lar"]'),
  ('PHENOMENON','["phe","nom","e","non"]'),
  ('BUREAUCRACY','["bu","reau","cra","cy"]'),
  ('ABRACADABRA','["ab","ra","ca","dab","ra"]'),
  ('KALEIDOSCOPE','["ka","lei","do","scope"]'),
  ('HIPPOPOTAMUS','["hip","po","pot","a","mus"]'),
  ('ONOMATOPOEIA','["on","o","mat","o","poe","ia"]'),
  -- Rude ones
  ('ORGASMIC','["or","gas","mic"]'),
  ('CLITORIS','["clit","o","ris"]'),
  ('TESTICLES','["tes","ti","cles"]'),
  ('SEDUCTION','["se","duc","tion"]'),
  ('FORNICATE','["for","ni","cate"]'),
  ('TITILLATE','["tit","il","late"]'),
  ('LUBRICANT','["lu","bri","cant"]'),
  ('EJACULATE','["e","jac","u","late"]'),
  ('SEXUALITY','["sex","u","al","i","ty"]'),
  ('GENITALIA','["gen","i","ta","lia"]'),
  ('MASTURBATE','["mas","tur","bate"]'),
  ('DOMINATRIX','["dom","i","na","trix"]'),
  ('VOLUPTUOUS','["vo","lup","tu","ous"]'),
  ('SUBMISSIVE','["sub","mis","sive"]'),
  ('LASCIVIOUS','["las","civ","i","ous"]'),
  ('SEDUCTRESS','["se","duc","tress"]'),
  ('EROTICALLY','["e","rot","i","cal","ly"]'),
  ('PROVOCATIVE','["pro","voc","a","tive"]'),
  ('APHRODISIAC','["aph","ro","dis","i","ac"]'),
  ('PROMISCUOUS','["pro","mis","cu","ous"]'),
  ('INTERCOURSE','["in","ter","course"]'),
  ('NYMPHOMANIA','["nym","pho","ma","ni","a"]'),
  ('CUNNILINGUS','["cun","ni","lin","gus"]')
ON CONFLICT (word) DO NOTHING;
