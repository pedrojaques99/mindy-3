-- Add new translations for the 'Most Liked Resources' section
INSERT INTO translations (language, key, value)
VALUES
  -- English translations
  ('en', 'home.sections.mostLikedResources', 'Most Liked Resources'),
  
  -- Portuguese translations
  ('pt-BR', 'home.sections.mostLikedResources', 'Recursos Mais Curtidos')
ON CONFLICT (language, key) DO UPDATE
SET value = EXCLUDED.value; 