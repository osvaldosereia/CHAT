
    create index if not exists papoai_commerce_turns_customer_id_idx
      on public.papoai_commerce_turns(customer_id)
      where customer_id is not null;
  