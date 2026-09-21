create extension if not exists unaccent with schema extensions;

update products
set search_text = trim(
  regexp_replace(
    extensions.unaccent(
      lower(
        concat_ws(
          ' ',
          name,
          sku,
          gtin,
          metadata->>'brand',
          metadata->>'category',
          metadata->>'subcategory',
          metadata->>'subsubcategory'
        )
      )
    ),
    '[^a-z0-9]+',
    ' ',
    'g'
  )
);
