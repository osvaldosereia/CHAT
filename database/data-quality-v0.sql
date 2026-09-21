
-- Corrige ofertas ativas inválidas.
update offers o
set active = false
from products p
where p.id = o.product_id
  and o.active = true
  and o.sale_price_cents >= p.sale_price_cents;

-- Impede valores negativos/zero; a comparação com preço regular é validada
-- na camada de domínio porque depende da tabela products.
alter table offers
  drop constraint if exists offers_sale_price_positive_chk;

alter table offers
  add constraint offers_sale_price_positive_chk
  check (sale_price_cents > 0);
