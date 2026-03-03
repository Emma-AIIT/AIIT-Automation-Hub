ALTER TABLE public.invoicing_messages
  DROP CONSTRAINT invoicing_messages_message_type_check;

ALTER TABLE public.invoicing_messages
  ADD CONSTRAINT invoicing_messages_message_type_check
  CHECK (message_type = ANY (ARRAY['text'::text, 'image'::text, 'textMessage'::text, 'imageMessage'::text]));
