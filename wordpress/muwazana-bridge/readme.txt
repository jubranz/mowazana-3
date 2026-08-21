=== Muwazana Bridge ===
Contributors: mowazana
Tags: api, jetengine, family finance
Requires at least: 6.4
Requires PHP: 8.0
Stable tag: 2.0.0
License: GPLv2 or later

Secure REST bridge for the Muwazana member PWA.

== Installation ==

1. Copy the `muwazana-bridge` directory to `wp-content/plugins/` and activate it.
2. Create a dedicated WordPress user with the "Muwazana API Service" role.
3. Create an Application Password for that service user.
4. Edit each family member in WordPress, enable Muwazana, set a six-digit PIN, and choose a card color.
5. Add the service user and Application Password to the PWA server environment.
6. From the WordPress user profile, enable "Muwazana manager" only for the people who may approve transactions and create loans.

Version 2 creates its notification, audit, and webhook-outbox tables automatically. It also adds the required finance columns to the existing loan CCT tables without deleting prior rows.

Optional manager-event webhook constants:

define('MUWAZANA_MANAGER_EVENT_WEBHOOK_URL', 'https://n8n.example.com/webhook/muwazana-manager-events');
define('MUWAZANA_MANAGER_EVENT_WEBHOOK_SECRET', 'replace-with-a-random-secret');

The plugin assumes the CCT slugs `expense`, `payment`, `jet_cct_penalty`, `loans`, `loan_schedules`, and `loan_payments`. Use the `muwazana_cct_slug` filter if a site uses a different slug.
