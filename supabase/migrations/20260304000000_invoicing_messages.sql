CREATE TABLE public.invoicing_messages (
  id                uuid         NOT NULL DEFAULT gen_random_uuid(),
  sender_phone      text         NOT NULL,
  sender_name       text,
  message_type      text         NOT NULL CHECK (message_type = ANY (ARRAY['text'::text, 'image'::text])),
  message_text      text,
  image_url         text,
  image_caption     text,
  received_at       timestamptz  NOT NULL,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT invoicing_messages_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_invoicing_messages_received_at ON public.invoicing_messages (received_at DESC);
