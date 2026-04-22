-- Allow in-app and mock email delivery for report schedules
ALTER TABLE report_schedules DROP CONSTRAINT IF EXISTS report_schedules_delivery_channel_check;
ALTER TABLE report_schedules ADD CONSTRAINT report_schedules_delivery_channel_check
  CHECK (delivery_channel IN ('email', 'slack', 'webhook', 'in_app', 'email_mock'));
