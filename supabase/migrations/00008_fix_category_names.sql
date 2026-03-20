-- Fix system category names: add accents and proper capitalization
UPDATE public.categories SET name = 'Salário'      WHERE name = 'Salario'     AND is_system = true;
UPDATE public.categories SET name = 'Alimentação'   WHERE name = 'Alimentacao' AND is_system = true;
UPDATE public.categories SET name = 'Saúde'         WHERE name = 'Saude'       AND is_system = true;
UPDATE public.categories SET name = 'Educação'      WHERE name = 'Educacao'    AND is_system = true;
UPDATE public.categories SET name = 'Assinaturas'   WHERE name = 'Assinaturas' AND is_system = true;
