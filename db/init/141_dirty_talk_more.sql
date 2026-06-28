-- Dirty Talk — more words. All 8–12 letters / 3+ syllables so they're served
-- under the current admin bands.

-- More filth
INSERT INTO jstw_word_bank (word, syllables) VALUES
  ('DEBAUCHERY','["de","bauch","er","y"]'),
  ('VOYEURISTIC','["voy","eur","is","tic"]'),
  ('PENETRATION','["pen","e","tra","tion"]'),
  ('STIMULATION','["stim","u","la","tion"]'),
  ('COPULATING','["cop","u","lat","ing"]'),
  ('RAUNCHINESS','["raunch","i","ness"]'),
  ('HORNINESS','["horn","i","ness"]'),
  ('KINKINESS','["kink","i","ness"]'),
  ('MUFFDIVING','["muff","div","ing"]'),
  ('SCISSORING','["scis","sor","ing"]'),
  ('KNOBJOCKEY','["knob","jock","ey"]'),
  ('KNOBGOBBLER','["knob","gob","bler"]'),
  ('CUMGUZZLER','["cum","guz","zler"]'),
  ('FANNYBATTER','["fan","ny","bat","ter"]'),
  ('SPUNKBUBBLE','["spunk","bub","ble"]'),
  ('DOGGYSTYLE','["dog","gy","style"]')
ON CONFLICT (word) DO NOTHING;

-- More phonetically tricky trip-ups
INSERT INTO jstw_word_bank (word, syllables) VALUES
  ('CHIPOTLE','["chi","pot","le"]'),
  ('JALAPENO','["jal","a","pe","no"]'),
  ('BRUSCHETTA','["brus","chet","ta"]'),
  ('PARMESAN','["par","me","san"]'),
  ('CARIBBEAN','["car","ib","be","an"]'),
  ('DETERIORATE','["de","te","ri","o","rate"]'),
  ('PARLIAMENT','["par","lia","ment"]'),
  ('TEMPERATURE','["tem","per","a","ture"]'),
  ('VEGETABLE','["veg","e","ta","ble"]'),
  ('COMFORTABLE','["com","fort","a","ble"]'),
  ('JEWELLERY','["jew","el","ler","y"]'),
  ('ASTERISK','["as","ter","isk"]'),
  ('PRESCRIPTION','["pre","scrip","tion"]'),
  ('DEFINITELY','["def","i","nite","ly"]'),
  ('DIPHTHERIA','["diph","the","ri","a"]'),
  ('LIEUTENANT','["lieu","ten","ant"]'),
  ('RASPBERRY','["rasp","ber","ry"]'),
  ('ENVELOPE','["en","ve","lope"]'),
  ('MASSACRE','["mas","sa","cre"]'),
  ('BOLOGNESE','["bol","og","nese"]'),
  ('SPECIFICALLY','["spe","cif","i","cal","ly"]')
ON CONFLICT (word) DO NOTHING;
