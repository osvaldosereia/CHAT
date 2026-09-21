-- Development hardening
create index if not exists checkout_sessions_cart_idx on checkout_sessions(cart_id);
