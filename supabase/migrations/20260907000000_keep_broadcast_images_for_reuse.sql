-- Broadcast images used to be deleted from the whatsapp-broadcasts bucket as soon
-- as a broadcast settled (see 20260902000000_whatsapp_broadcast_pacing.sql). That
-- made "reuse this broadcast" from history impossible for anything with an image,
-- since image_path pointed at a file that no longer existed.
--
-- The cleanup call was removed from refreshBroadcast() in
-- src/lib/server/whatsapp-broadcast.ts - images are now kept indefinitely so
-- whatsapp.getBroadcastImageUrl can serve them back into the composer.

comment on column public.whatsapp_broadcast_log.image_path is
  'Path in the whatsapp-broadcasts storage bucket. Kept after send (not deleted) so the message and image can be reused from Broadcast History.';
