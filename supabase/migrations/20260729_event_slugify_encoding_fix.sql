-- Keep slug transliteration independent from migration-file encoding.
-- This intentionally does not rewrite existing public slugs.

create or replace function private.slugify_event(value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select trim(both '-' from regexp_replace(
    translate(
      lower(value),
      chr(228) || chr(246) || chr(252) || chr(223) ||
      chr(224) || chr(225) || chr(226) ||
      chr(232) || chr(233) || chr(234) ||
      chr(236) || chr(237) || chr(238) ||
      chr(242) || chr(243) || chr(244) ||
      chr(249) || chr(250) || chr(251),
      'aousaaaeeeiiiooouuu'
    ),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;
