<?php
/**
 * Plugin Name: Muwazana Bridge
 * Description: Secure, member-scoped REST bridge between the Muwazana PWA and JetEngine/WordPress data.
 * Version: 2.1.0
 * Requires at least: 6.4
 * Requires PHP: 8.0
 * Author: Muwazana
 */

namespace Muwazana\Bridge;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_User;

if (! defined('ABSPATH')) {
    exit;
}

const VERSION = '2.1.0';
const CAPABILITY = 'muwazana_api_access';
const MANAGE_CAPABILITY = 'muwazana_manage_finances';
const META_ENABLED = '_muwazana_enabled';
const META_PIN_HASH = '_muwazana_pin_hash';
const META_COLOR = '_muwazana_color';
const SCHEMA_OPTION = 'muwazana_bridge_schema_version';

register_activation_hook(__FILE__, __NAMESPACE__ . '\\activate');
add_action('plugins_loaded', __NAMESPACE__ . '\\maybe_upgrade');
add_action('rest_api_init', __NAMESPACE__ . '\\register_routes');
add_action('show_user_profile', __NAMESPACE__ . '\\render_member_fields');
add_action('edit_user_profile', __NAMESPACE__ . '\\render_member_fields');
add_action('personal_options_update', __NAMESPACE__ . '\\save_member_fields');
add_action('edit_user_profile_update', __NAMESPACE__ . '\\save_member_fields');
add_action('muwazana_process_outbox', __NAMESPACE__ . '\\process_outbox');

function activate(): void
{
    $administrator = get_role('administrator');
    if ($administrator) {
        $administrator->add_cap(CAPABILITY);
    }

    add_role('muwazana_service', 'Muwazana API Service', [
        'read' => true,
        CAPABILITY => true,
    ]);

    upgrade_schema();
}

function maybe_upgrade(): void
{
    if (get_option(SCHEMA_OPTION) !== VERSION) {
        upgrade_schema();
    }
}

function upgrade_schema(): void
{
    global $wpdb;

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $table = request_table();
    $charset = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE {$table} (
        request_key varchar(64) NOT NULL,
        member_id bigint(20) unsigned NOT NULL,
        entity_type varchar(32) NOT NULL,
        entity_id bigint(20) unsigned NOT NULL DEFAULT 0,
        created_at datetime NOT NULL,
        PRIMARY KEY (request_key),
        KEY member_created (member_id, created_at)
    ) {$charset};");

    $notifications = notifications_table();
    dbDelta("CREATE TABLE {$notifications} (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        event_key varchar(191) NOT NULL,
        recipient_id bigint(20) unsigned NOT NULL,
        audience varchar(20) NOT NULL DEFAULT 'member',
        event varchar(64) NOT NULL,
        title varchar(191) NOT NULL,
        body text NOT NULL,
        entity_type varchar(32) NOT NULL DEFAULT '',
        entity_id bigint(20) unsigned NOT NULL DEFAULT 0,
        payload longtext NULL,
        read_at datetime NULL,
        created_at datetime NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY event_recipient (event_key, recipient_id, audience),
        KEY recipient_created (recipient_id, audience, created_at)
    ) {$charset};");

    $audit = audit_table();
    dbDelta("CREATE TABLE {$audit} (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        actor_id bigint(20) unsigned NOT NULL,
        action varchar(64) NOT NULL,
        entity_type varchar(32) NOT NULL,
        entity_id bigint(20) unsigned NOT NULL,
        before_values longtext NULL,
        after_values longtext NULL,
        note text NULL,
        created_at datetime NOT NULL,
        PRIMARY KEY (id),
        KEY entity_created (entity_type, entity_id, created_at),
        KEY actor_created (actor_id, created_at)
    ) {$charset};");

    $outbox = outbox_table();
    dbDelta("CREATE TABLE {$outbox} (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        event_id varchar(64) NOT NULL,
        payload longtext NOT NULL,
        attempts smallint unsigned NOT NULL DEFAULT 0,
        next_attempt datetime NOT NULL,
        last_error text NULL,
        sent_at datetime NULL,
        created_at datetime NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY event_id (event_id),
        KEY pending (sent_at, next_attempt)
    ) {$charset};");

    ensure_cct_columns('loans', [
        'principal_amount' => 'decimal(18,2) NOT NULL DEFAULT 0',
        'interest_rate' => 'decimal(8,2) NOT NULL DEFAULT 0',
        'interest_amount' => 'decimal(18,2) NOT NULL DEFAULT 0',
        'notes' => 'text NULL',
        'created_by' => 'bigint(20) unsigned NOT NULL DEFAULT 0',
    ]);
    ensure_cct_columns('loan_schedules', [
        'installment_number' => 'int unsigned NOT NULL DEFAULT 0',
        'base_amount' => 'decimal(18,2) NOT NULL DEFAULT 0',
        'carry_in_amount' => 'decimal(18,2) NOT NULL DEFAULT 0',
    ]);
    foreach (['expense', 'payment', 'loan_payments'] as $slug) {
        ensure_cct_columns($slug, [
            'manager_note' => 'text NULL',
            'created_by' => 'bigint(20) unsigned NOT NULL DEFAULT 0',
            'approved_by' => 'bigint(20) unsigned NOT NULL DEFAULT 0',
            'approved_at' => 'datetime NULL',
        ]);
    }
    ensure_cct_columns('penalty', [
        'title' => 'varchar(191) NOT NULL DEFAULT \'\'',
        'notes' => 'text NULL',
        'image_url' => 'text NULL',
        'manager_note' => 'text NULL',
        'created_by' => 'bigint(20) unsigned NOT NULL DEFAULT 0',
        'approved_by' => 'bigint(20) unsigned NOT NULL DEFAULT 0',
        'approved_at' => 'datetime NULL',
        'objection_status' => "varchar(20) NOT NULL DEFAULT 'none'",
        'objection_text' => 'text NULL',
        'objection_at' => 'datetime NULL',
        'objection_decided_at' => 'datetime NULL',
        'objection_decided_by' => 'bigint(20) unsigned NOT NULL DEFAULT 0',
        'objection_decision_note' => 'text NULL',
    ]);
    ensure_cct_columns('loan_payments', ['display_title' => 'varchar(191) NOT NULL DEFAULT \'\'']);
    backfill_loan_terms();
    update_option(SCHEMA_OPTION, VERSION, false);
}

function request_table(): string
{
    global $wpdb;
    return $wpdb->prefix . 'muwazana_requests';
}

function notifications_table(): string
{
    global $wpdb;
    return $wpdb->prefix . 'muwazana_notifications';
}

function audit_table(): string
{
    global $wpdb;
    return $wpdb->prefix . 'muwazana_audit_log';
}

function outbox_table(): string
{
    global $wpdb;
    return $wpdb->prefix . 'muwazana_outbox';
}

function cct_table(string $slug): string
{
    global $wpdb;
    $slugs = [
        'expense' => 'expense',
        'payment' => 'payment',
        'penalty' => 'jet_cct_penalty',
        'loans' => 'loans',
        'loan_schedules' => 'loan_schedules',
        'loan_payments' => 'loan_payments',
    ];
    $resolved = $slugs[$slug] ?? $slug;
    $resolved = (string) apply_filters('muwazana_cct_slug', $resolved, $slug);
    return $wpdb->prefix . 'jet_cct_' . preg_replace('/[^a-zA-Z0-9_]/', '', $resolved);
}

function service_permission(): bool
{
    return current_user_can(CAPABILITY);
}

function register_routes(): void
{
    register_rest_route('muwazana/v1', '/profiles', [
        'methods' => 'GET',
        'callback' => __NAMESPACE__ . '\\profiles_endpoint',
        'permission_callback' => __NAMESPACE__ . '\\service_permission',
    ]);
    register_rest_route('muwazana/v1', '/auth/pin', [
        'methods' => 'POST',
        'callback' => __NAMESPACE__ . '\\pin_endpoint',
        'permission_callback' => __NAMESPACE__ . '\\service_permission',
    ]);
    register_rest_route('muwazana/v1', '/members/(?P<id>\d+)/dashboard', [
        'methods' => 'GET',
        'callback' => __NAMESPACE__ . '\\dashboard_endpoint',
        'permission_callback' => __NAMESPACE__ . '\\service_permission',
    ]);
    register_rest_route('muwazana/v1', '/members/(?P<id>\d+)/transactions', [
        'methods' => 'GET',
        'callback' => __NAMESPACE__ . '\\transactions_endpoint',
        'permission_callback' => __NAMESPACE__ . '\\service_permission',
    ]);
    register_rest_route('muwazana/v1', '/members/(?P<id>\d+)/expenses', [
        'methods' => 'POST',
        'callback' => __NAMESPACE__ . '\\create_expense_endpoint',
        'permission_callback' => __NAMESPACE__ . '\\service_permission',
    ]);
    register_rest_route('muwazana/v1', '/members/(?P<id>\d+)/payments', [
        'methods' => 'POST',
        'callback' => __NAMESPACE__ . '\\create_payment_endpoint',
        'permission_callback' => __NAMESPACE__ . '\\service_permission',
    ]);
    register_rest_route('muwazana/v1', '/members/(?P<id>\d+)/penalties/(?P<penalty_id>\d+)/objection', [
        'methods' => 'POST', 'callback' => __NAMESPACE__ . '\submit_penalty_objection_endpoint',
        'permission_callback' => __NAMESPACE__ . '\service_permission',
    ]);
    register_rest_route('muwazana/v1', '/transactions/(?P<type>expense|payment|loan_payment)/(?P<id>\d+)/(?P<action>approve|reject)', [
        'methods' => 'POST',
        'callback' => __NAMESPACE__ . '\\transition_endpoint',
        'permission_callback' => __NAMESPACE__ . '\\service_permission',
    ]);
    register_rest_route('muwazana/v1', '/members/(?P<id>\d+)/notifications', [
        'methods' => 'GET', 'callback' => __NAMESPACE__ . '\\notifications_endpoint',
        'permission_callback' => __NAMESPACE__ . '\\service_permission',
    ]);
    register_rest_route('muwazana/v1', '/members/(?P<id>\d+)/notifications/read', [
        'methods' => 'POST', 'callback' => __NAMESPACE__ . '\\notifications_read_endpoint',
        'permission_callback' => __NAMESPACE__ . '\\service_permission',
    ]);
    register_rest_route('muwazana/v1', '/admin/dashboard', [
        'methods' => 'GET', 'callback' => __NAMESPACE__ . '\\admin_dashboard_endpoint',
        'permission_callback' => __NAMESPACE__ . '\\service_permission',
    ]);
    register_rest_route('muwazana/v1', '/admin/transactions', [
        'methods' => 'POST', 'callback' => __NAMESPACE__ . '\\admin_create_transaction_endpoint',
        'permission_callback' => __NAMESPACE__ . '\\service_permission',
    ]);
    register_rest_route('muwazana/v1', '/admin/transactions/(?P<type>expense|payment|loan_payment|reward|penalty)/(?P<id>\d+)', [
        'methods' => 'PATCH', 'callback' => __NAMESPACE__ . '\\admin_edit_transaction_endpoint',
        'permission_callback' => __NAMESPACE__ . '\\service_permission',
    ]);
    register_rest_route('muwazana/v1', '/admin/transactions/(?P<type>expense|payment|loan_payment|reward|penalty)/(?P<id>\d+)/(?P<action>approve|hold|reject)', [
        'methods' => 'POST', 'callback' => __NAMESPACE__ . '\\admin_transition_endpoint',
        'permission_callback' => __NAMESPACE__ . '\\service_permission',
    ]);
    register_rest_route('muwazana/v1', '/admin/loans', [
        'methods' => 'POST', 'callback' => __NAMESPACE__ . '\\admin_create_loan_endpoint',
        'permission_callback' => __NAMESPACE__ . '\\service_permission',
    ]);
    register_rest_route('muwazana/v1', '/admin/penalties/(?P<id>\d+)/objection/(?P<action>accept|reject)', [
        'methods' => 'POST', 'callback' => __NAMESPACE__ . '\decide_penalty_objection_endpoint',
        'permission_callback' => __NAMESPACE__ . '\service_permission',
    ]);
}

function render_member_fields(WP_User $user): void
{
    if (! current_user_can('edit_user', $user->ID)) {
        return;
    }
    $enabled = get_user_meta($user->ID, META_ENABLED, true) === '1';
    $manager = user_can($user, MANAGE_CAPABILITY);
    $color = sanitize_hex_color(get_user_meta($user->ID, META_COLOR, true)) ?: '#4f8f78';
    wp_nonce_field('muwazana_member_fields', 'muwazana_member_nonce');
    ?>
    <h2>تطبيق موازنة</h2>
    <table class="form-table" role="presentation">
        <tr>
            <th><label for="muwazana_enabled">تفعيل العضو</label></th>
            <td><label><input type="checkbox" id="muwazana_enabled" name="muwazana_enabled" value="1" <?php checked($enabled); ?>> إظهاره في تطبيق موازنة</label></td>
        </tr>
        <?php if (current_user_can('manage_options')) : ?>
        <tr>
            <th><label for="muwazana_manager">مدير موازنة</label></th>
            <td><label><input type="checkbox" id="muwazana_manager" name="muwazana_manager" value="1" <?php checked($manager); ?>> السماح بإدارة العمليات والقروض</label></td>
        </tr>
        <?php endif; ?>
        <tr>
            <th><label for="muwazana_pin">PIN جديد</label></th>
            <td><input type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" id="muwazana_pin" name="muwazana_pin" class="regular-text" autocomplete="new-password"><p class="description">ستة أرقام. اتركه فارغًا للاحتفاظ بالرمز الحالي.</p></td>
        </tr>
        <tr>
            <th><label for="muwazana_color">لون البطاقة</label></th>
            <td><input type="color" id="muwazana_color" name="muwazana_color" value="<?php echo esc_attr($color); ?>"></td>
        </tr>
    </table>
    <?php
}

function save_member_fields(int $user_id): void
{
    if (! current_user_can('edit_user', $user_id)
        || ! isset($_POST['muwazana_member_nonce'])
        || ! wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['muwazana_member_nonce'])), 'muwazana_member_fields')) {
        return;
    }

    update_user_meta($user_id, META_ENABLED, isset($_POST['muwazana_enabled']) ? '1' : '0');
    $color = isset($_POST['muwazana_color']) ? sanitize_hex_color(wp_unslash($_POST['muwazana_color'])) : '';
    update_user_meta($user_id, META_COLOR, $color ?: '#4f8f78');

    $pin = isset($_POST['muwazana_pin']) ? trim((string) wp_unslash($_POST['muwazana_pin'])) : '';
    if ($pin !== '' && preg_match('/^\d{6}$/', $pin)) {
        update_user_meta($user_id, META_PIN_HASH, wp_hash_password($pin));
    }
    if (current_user_can('manage_options')) {
        $user = get_user_by('id', $user_id);
        if ($user) {
            isset($_POST['muwazana_manager']) ? $user->add_cap(MANAGE_CAPABILITY) : $user->remove_cap(MANAGE_CAPABILITY);
        }
    }
}

function member_profile(WP_User $user): array
{
    $name = $user->display_name ?: $user->user_login;
    $initials = function_exists('mb_substr') ? mb_substr(str_replace(' ', '', $name), 0, 2) : substr($name, 0, 2);
    return [
        'id' => (int) $user->ID,
        'name' => $name,
        'initials' => $initials,
        'color' => sanitize_hex_color(get_user_meta($user->ID, META_COLOR, true)) ?: '#4f8f78',
        'canManage' => user_can($user, MANAGE_CAPABILITY),
    ];
}

function enabled_member(int $member_id): WP_User|WP_Error
{
    $user = get_user_by('id', $member_id);
    if (! $user || get_user_meta($member_id, META_ENABLED, true) !== '1') {
        return new WP_Error('muwazana_member_not_found', 'العضو غير متاح.', ['status' => 404]);
    }
    return $user;
}

function profiles_endpoint(): WP_REST_Response
{
    $query = new \WP_User_Query([
        'meta_key' => META_ENABLED,
        'meta_value' => '1',
        'orderby' => 'display_name',
        'order' => 'ASC',
    ]);
    return new WP_REST_Response(array_map(__NAMESPACE__ . '\\member_profile', $query->get_results()));
}

function pin_endpoint(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $member_id = absint($request->get_param('memberId'));
    $pin = (string) $request->get_param('pin');
    $client_key = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $request->get_param('clientKey'));
    $user = enabled_member($member_id);
    if (is_wp_error($user)) {
        return $user;
    }

    $rate_key = 'muw_pin_' . substr(hash('sha256', $member_id . '|' . $client_key), 0, 32);
    $attempts = get_transient($rate_key);
    $attempts = is_array($attempts) ? $attempts : ['count' => 0, 'locked_until' => 0];
    if ((int) $attempts['locked_until'] > time()) {
        return new WP_Error('muwazana_pin_locked', 'محاولات كثيرة. حاول بعد 15 دقيقة.', ['status' => 429]);
    }

    $hash = (string) get_user_meta($member_id, META_PIN_HASH, true);
    if (! preg_match('/^\d{6}$/', $pin) || ! $hash || ! wp_check_password($pin, $hash, $member_id)) {
        $attempts['count'] = (int) $attempts['count'] + 1;
        if ($attempts['count'] >= 5) {
            $attempts = ['count' => 0, 'locked_until' => time() + 15 * MINUTE_IN_SECONDS];
        }
        set_transient($rate_key, $attempts, 15 * MINUTE_IN_SECONDS);
        return new WP_Error('muwazana_pin_invalid', 'الرمز غير صحيح.', ['status' => 401]);
    }

    delete_transient($rate_key);
    return new WP_REST_Response(member_profile($user));
}

function dashboard_endpoint(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    refresh_installment_states();
    $member_id = absint($request['id']);
    $user = enabled_member($member_id);
    if (is_wp_error($user)) {
        return $user;
    }

    $expenses = member_rows('expense', $member_id);
    $payments = member_rows('payment', $member_id);
    $penalties = member_rows('penalty', $member_id);
    $rewards = member_rewards($member_id);
    $loan_payments = member_rows('loan_payments', $member_id);
    $loans = member_loans($member_id);
    $schedules = member_schedules($member_id, array_column($loans, '_ID'));

    $totals = [
        'expenses' => approved_sum($expenses, 'tr_status'),
        'payments' => approved_sum($payments, 'tr_status'),
        'rewards' => approved_sum($rewards, 'tr_status'),
        'penalties' => approved_sum($penalties, 'tr_status'),
    ];
    $balance = round($totals['payments'] + $totals['rewards'] - $totals['expenses'] - $totals['penalties'], 2);
    $pending = pending_sum($expenses, 'tr_status') + pending_sum($payments, 'tr_status') + pending_sum($penalties, 'tr_status') + pending_sum($rewards, 'tr_status') + pending_sum($loan_payments, 'payment_status');

    $transactions = array_merge(
        rows_to_transactions($expenses, 'expense'),
        rows_to_transactions($payments, 'payment'),
        rows_to_transactions($penalties, 'penalty'),
        rows_to_transactions($rewards, 'reward'),
        rows_to_transactions($loan_payments, 'loan_payment')
    );
    usort($transactions, static fn(array $a, array $b): int => strcmp($b['date'], $a['date']));

    $installments = array_map(__NAMESPACE__ . '\\schedule_payload', $schedules);
    // بعض القروض القديمة أو المضافة يدويًا لا تملك صفًا في جدول الأقساط رغم
    // وجود installment_amount. ننشئ القسط القادم عند أول قراءة، ليبقى السداد
    // مرتبطًا بسجل CCT حقيقي وليس بقيمة افتراضية في الواجهة.
    foreach ($loans as $loan) {
        if (normalize_status($loan['status'] ?? '') !== 'active') continue;
        $loan_id = absint($loan['_ID'] ?? 0);
        $has_open_installment = (bool) array_filter($installments, static fn(array $schedule): bool =>
            $schedule['loanId'] === $loan_id
            && $schedule['remainingAmount'] > 0
            && ! in_array($schedule['status'], ['paid', 'cancelled', 'carried_forward'], true)
        );
        if (! $has_open_installment) {
            $created_schedule = ensure_next_schedule($loan);
            if ($created_schedule) {
                $installments[] = schedule_payload($created_schedule);
            }
        }
    }
    $loan_payloads = array_map(static function (array $loan) use ($installments, $loan_payments): array {
        $loan_id = (int) ($loan['_ID'] ?? 0);
        $candidates = array_values(array_filter($installments, static fn(array $schedule): bool =>
            $schedule['loanId'] === $loan_id
            && $schedule['remainingAmount'] > 0
            && ! in_array($schedule['status'], ['paid', 'cancelled', 'carried_forward'], true)
        ));
        usort($candidates, static fn(array $a, array $b): int => strcmp($a['dueDate'], $b['dueDate']));
        $total = amount($loan['total_amount'] ?? $loan['amount'] ?? 0);
        $approved_payments = loan_payment_sum($loan_payments, $loan_id, 'approved');
        $pending_payments = loan_payment_sum($loan_payments, $loan_id, 'pending');
        $stored_remaining = loan_remaining_amount($loan);
        // Reconcile older/manual approvals that changed Loan Payments but did
        // not update the denormalized remaining_amount field on the loan.
        $remaining = $approved_payments > 0
            ? min($stored_remaining, max(0, round($total - $approved_payments, 2)))
            : $stored_remaining;
        return [
            'id' => $loan_id,
            'title' => (string) ($loan['title'] ?? 'قرض'),
            'principalAmount' => amount($loan['principal_amount'] ?? $loan['amount'] ?? $total),
            'interestRate' => amount($loan['interest_rate'] ?? 0),
            'interestAmount' => amount($loan['interest_amount'] ?? 0),
            'totalAmount' => $total,
            'remainingAmount' => $remaining,
            'installmentCount' => absint($loan['installment_count'] ?? 0),
            'installmentAmount' => amount($loan['installment_amount'] ?? $loan['monthly_installment'] ?? 0),
            'startDate' => iso_date($loan['start_date'] ?? ''),
            'notes' => (string) ($loan['notes'] ?? ''),
            'pendingPaymentAmount' => $pending_payments,
            'status' => normalize_status($loan['status'] ?? ''),
            'nextInstallment' => $candidates[0] ?? null,
        ];
    }, $loans);
    $obligations = obligations_payload($balance, $installments, $loan_payloads);

    return new WP_REST_Response([
        'member' => member_profile($user),
        'balance' => $balance,
        'pendingAmount' => round($pending, 2),
        'obligations' => $obligations,
        'unreadNotifications' => unread_notification_count($member_id, 'member'),
        'totals' => $totals,
        'loans' => $loan_payloads,
        'installments' => $installments,
        'recent' => array_slice($transactions, 0, 25),
    ]);
}

function transactions_endpoint(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $member_id = absint($request['id']);
    $member = enabled_member($member_id);
    if (is_wp_error($member)) return $member;
    $type = sanitize_key((string) $request->get_param('type'));
    $scope = sanitize_key((string) $request->get_param('scope'));
    $status = sanitize_key((string) $request->get_param('status'));
    $page = max(1, absint($request->get_param('page') ?: 1));
    $per_page = min(25, max(1, absint($request->get_param('perPage') ?: 5)));
    $items = member_transactions($member_id);
    if ($scope === 'short') {
        $items = array_values(array_filter($items, static fn(array $item): bool => $item['type'] !== 'loan_payment'));
    }
    if ($type) {
        $items = array_values(array_filter($items, static fn(array $item): bool => $item['type'] === $type));
    }
    if ($status) {
        $items = array_values(array_filter($items, static function (array $item) use ($status): bool {
            return $status === 'pending'
                ? in_array($item['status'], ['pending', 'on_hold'], true)
                : $item['status'] === $status;
        }));
    }
    $total = count($items);
    $total_pages = max(1, (int) ceil($total / $per_page));
    $page = min($page, $total_pages);
    return new WP_REST_Response([
        'transactions' => array_slice($items, ($page - 1) * $per_page, $per_page),
        'page' => $page,
        'perPage' => $per_page,
        'total' => $total,
        'totalPages' => $total_pages,
    ]);
}

function create_expense_endpoint(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $member_id = absint($request['id']);
    $user = enabled_member($member_id);
    if (is_wp_error($user)) {
        return $user;
    }
    $input = $request->get_json_params();
    $amount = amount($input['amount'] ?? 0);
    $request_id = sanitize_request_key($input['requestId'] ?? '');
    if ($amount <= 0 || ! $request_id) {
        return new WP_Error('muwazana_invalid_expense', 'بيانات السحب غير صالحة.', ['status' => 400]);
    }

    $existing = idempotent_result($request_id, 'expense');
    if ($existing) {
        return new WP_REST_Response(transaction_from_row($existing, 'expense'), 200);
    }

    $now = current_time('mysql');
    $data = [
        'title' => sanitize_text_field($input['category'] ?? 'سحب'),
        'amount' => number_format($amount, 2, '.', ''),
        'date' => cct_date_timestamp($input['date'] ?? ''),
        'store' => sanitize_text_field($input['store'] ?? ''),
        'notes' => sanitize_textarea_field($input['note'] ?? ''),
        'tr_status' => 'pending',
        'name' => $user->display_name,
        'mobile' => member_mobile($member_id),
        'email' => $user->user_email,
        'decline_reson' => '',
        'cct_author_id' => $member_id,
        'cct_created' => $now,
        'cct_modified' => $now,
    ];
    $row = idempotent_insert($request_id, $member_id, 'expense', 'expense', $data);
    return created_transaction_response($row, 'expense', 'expense', $user);
}

function create_payment_endpoint(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $member_id = absint($request['id']);
    $user = enabled_member($member_id);
    if (is_wp_error($user)) {
        return $user;
    }
    $input = $request->get_json_params();
    $amount = amount($input['amount'] ?? 0);
    $request_id = sanitize_request_key($input['requestId'] ?? '');
    $target = ($input['targetType'] ?? '') === 'installment' ? 'installment' : 'general';
    if ($amount <= 0 || ! $request_id) {
        return new WP_Error('muwazana_invalid_payment', 'بيانات السداد غير صالحة.', ['status' => 400]);
    }

    $entity_type = $target === 'installment' ? 'loan_payment' : 'payment';
    $existing = idempotent_result($request_id, $entity_type);
    if ($existing) {
        return new WP_REST_Response(transaction_from_row($existing, $entity_type), 200);
    }

    $now = current_time('mysql');
    if ($target === 'installment') {
        $installment_id = absint($input['installmentId'] ?? 0);
        $schedule = cct_row('loan_schedules', $installment_id);
        if (! $schedule || ! member_owns_schedule($member_id, $schedule)) {
            return new WP_Error('muwazana_installment_not_found', 'القسط غير متاح.', ['status' => 404]);
        }
        $schedule_loan = cct_row('loans', absint($schedule['loan_id'] ?? 0));
        if (! $schedule_loan || normalize_status($schedule_loan['status'] ?? '') !== 'active') {
            return new WP_Error('muwazana_loan_not_active', 'القرض غير نشط حاليًا.', ['status' => 409]);
        }
        $remaining = schedule_remaining($schedule);
        if ($remaining <= 0 || $amount > $remaining) {
            return new WP_Error('muwazana_payment_too_large', 'المبلغ أكبر من المتبقي في القسط.', ['status' => 400]);
        }
        if (schedule_has_pending_payment($installment_id)) {
            return new WP_Error('muwazana_payment_already_pending', 'يوجد سداد لهذا القسط بانتظار قرار المدير.', ['status' => 409]);
        }
        $data = [
            'loan_id' => absint($schedule['loan_id'] ?? 0),
            'installment_id' => $installment_id,
            'amount' => number_format($amount, 2, '.', ''),
            'payment_date' => iso_date($input['date'] ?? ''),
            'payment_method' => '',
            'notes' => sanitize_textarea_field($input['note'] ?? ''),
            'display_title' => installment_display_title($schedule),
            'payment_status' => 'pending',
            'cct_author_id' => $member_id,
            'cct_created' => $now,
            'cct_modified' => $now,
        ];
        $row = idempotent_insert($request_id, $member_id, 'loan_payment', 'loan_payments', $data);
        return created_transaction_response($row, 'loan_payment', 'payment', $user);
    }

    $data = [
        'title' => 'إيداع عام',
        'amount' => number_format($amount, 2, '.', ''),
        'date' => cct_date_timestamp($input['date'] ?? ''),
        'note' => sanitize_textarea_field($input['note'] ?? ''),
        'tr_status' => 'pending',
        'name' => $user->display_name,
        'mobile' => member_mobile($member_id),
        'email' => $user->user_email,
        'cct_author_id' => $member_id,
        'cct_created' => $now,
        'cct_modified' => $now,
    ];
    $row = idempotent_insert($request_id, $member_id, 'payment', 'payment', $data);
    return created_transaction_response($row, 'payment', 'payment', $user);
}

function penalty_objection_state(array $row): array
{
    $status = sanitize_key((string) ($row['objection_status'] ?? 'none'));
    if (! in_array($status, ['none', 'pending', 'accepted', 'rejected'], true)) $status = 'none';
    try {
        $deadline = (new \DateTimeImmutable(row_date($row), new \DateTimeZone('Asia/Riyadh')))->modify('+15 days');
    } catch (\Exception) {
        $deadline = new \DateTimeImmutable('now', new \DateTimeZone('Asia/Riyadh'));
    }
    $expired = $status === 'none' && $deadline < new \DateTimeImmutable('now', new \DateTimeZone('Asia/Riyadh'));
    return [
        'status' => $expired ? 'expired' : $status,
        'text' => (string) ($row['objection_text'] ?? ''),
        'deadline' => $deadline->format(DATE_ATOM),
        'canObject' => $status === 'none' && ! $expired && normalize_status($row['tr_status'] ?? '') === 'approved',
    ];
}

function submit_penalty_objection_endpoint(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $member_id = absint($request['id']);
    $member = enabled_member($member_id);
    if (is_wp_error($member)) return $member;
    $penalty_id = absint($request['penalty_id']);
    $row = cct_row('penalty', $penalty_id);
    if (! $row || ! member_owns_row($member_id, $row)) return new WP_Error('muwazana_penalty_not_found', 'المخالفة غير متاحة.', ['status' => 404]);
    $input = $request->get_json_params();
    $text = sanitize_textarea_field($input['text'] ?? '');
    if (mb_strlen($text) < 2 || mb_strlen($text) > 1000) return new WP_Error('muwazana_invalid_objection', 'اكتب سبب الاعتراض بوضوح.', ['status' => 400]);
    $state = penalty_objection_state($row);
    if (! $state['canObject']) return new WP_Error('muwazana_objection_closed', 'انتهت مهلة الاعتراض أو يوجد اعتراض مسجل.', ['status' => 409]);
    update_cct('penalty', $penalty_id, [
        'objection_status' => 'pending', 'objection_text' => $text,
        'objection_at' => current_time('mysql'), 'cct_modified' => current_time('mysql'),
    ]);
    $updated = cct_row('penalty', $penalty_id) ?: array_merge($row, ['objection_status' => 'pending', 'objection_text' => $text]);
    $transaction = transaction_from_row($updated, 'penalty');
    notify_managers('penalty.objection.created.' . $penalty_id, 'penalty.objection.created', 'اعتراض جديد على مخالفة', $member->display_name . ': ' . $text, 'penalty', $penalty_id, ['transaction' => $transaction]);
    publish_manager_event('penalty.objection.created', $member, $member, $transaction, $text);
    return new WP_REST_Response($transaction, 201);
}

function decide_penalty_objection_endpoint(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $input = $request->get_json_params();
    $actor = manager_user(absint($input['actorId'] ?? 0));
    if (is_wp_error($actor)) return $actor;
    $penalty_id = absint($request['id']);
    $action = $request['action'] === 'accept' ? 'accept' : 'reject';
    $note = sanitize_textarea_field($input['note'] ?? '');
    $row = cct_row('penalty', $penalty_id);
    if (! $row || sanitize_key((string) ($row['objection_status'] ?? '')) !== 'pending') return new WP_Error('muwazana_objection_not_pending', 'لا يوجد اعتراض بانتظار القرار.', ['status' => 409]);
    $next = $action === 'accept' ? 'accepted' : 'rejected';
    update_cct('penalty', $penalty_id, [
        'objection_status' => $next, 'objection_decided_at' => current_time('mysql'),
        'objection_decided_by' => $actor->ID, 'objection_decision_note' => $note,
        'cct_modified' => current_time('mysql'),
    ]);
    $updated = cct_row('penalty', $penalty_id) ?: array_merge($row, ['objection_status' => $next, 'objection_decision_note' => $note]);
    $transaction = transaction_from_row($updated, 'penalty');
    $member_id = absint($row['cct_author_id'] ?? $row['user_id'] ?? 0);
    $member = get_user_by('id', $member_id);
    if ($member) {
        $title = $action === 'accept' ? 'تم قبول اعتراضك' : 'تم رفض اعتراضك';
        create_notification($member_id, 'member', 'penalty.objection.' . $next . '.' . $penalty_id, 'penalty.objection.' . $next, $title, $note ?: $transaction['title'], 'penalty', $penalty_id);
        publish_manager_event('penalty.objection.' . $next, $actor, $member, $transaction, $note);
    }
    audit_event((int) $actor->ID, 'penalty.objection.' . $next, 'penalty', $penalty_id, transaction_from_row($row, 'penalty'), $transaction, $note);
    return new WP_REST_Response($transaction);
}

/**
 * Sends approval requests after a new transaction is committed. A retry with
 * the same requestId returns the original row without sending a second alert.
 */
function created_transaction_response(array|WP_Error $row, string $transaction_type, string $event_type, WP_User $user): WP_REST_Response|WP_Error
{
    if (is_wp_error($row)) {
        return $row;
    }

    $created = (bool) ($row['_muwazana_created'] ?? false);
    $transaction = transaction_from_row($row, $transaction_type);
    if ($created) {
        notify_managers(
            'transaction.created.' . $transaction_type . '.' . $transaction['id'],
            'transaction.created',
            'عملية جديدة للمراجعة',
            $user->display_name . ': ' . $transaction['title'],
            $transaction_type,
            (int) $transaction['id']
        );
        if (! dispatch_approval_webhook($event_type, $transaction, $user)) {
            notify_managers(
                'telegram.failed.' . $transaction_type . '.' . $transaction['id'],
                'integration.telegram_failed',
                'تعذّر إرسال تنبيه تليجرام',
                'تم الحفظ، لكن تعذّر إرسال تنبيه تليجرام. ستظهر العملية في WordPress.',
                $transaction_type,
                (int) $transaction['id']
            );
        }
    }

    return new WP_REST_Response($transaction, $created ? 201 : 200);
}

/**
 * Each WordPress environment selects its own n8n endpoint in wp-config.php.
 * No header, token, or password is sent to the webhook.
 */
function approval_webhook_url(string $event_type): string
{
    $constant = $event_type === 'expense'
        ? 'MUWAZANA_EXPENSE_APPROVAL_WEBHOOK_URL'
        : 'MUWAZANA_PAYMENT_APPROVAL_WEBHOOK_URL';
    $url = defined($constant) ? (string) constant($constant) : '';
    $environment = function_exists('wp_get_environment_type') ? wp_get_environment_type() : 'production';
    $url = apply_filters('muwazana_approval_webhook_url', $url, $event_type, $environment);

    return is_string($url) && wp_http_validate_url($url) ? $url : '';
}

function dispatch_approval_webhook(string $event_type, array $transaction, WP_User $user): bool
{
    $url = approval_webhook_url($event_type);
    if ($url === '') {
        return false;
    }

    $response = wp_safe_remote_post($url, [
        'timeout' => 4,
        'blocking' => true,
        'headers' => ['Content-Type' => 'application/json'],
        'body' => wp_json_encode([
            'event' => $event_type . '.created',
            'timestamp' => gmdate('c'),
            'data' => array_merge($transaction, ['member' => member_profile($user)]),
        ]),
    ]);
    $code = is_wp_error($response) ? 0 : wp_remote_retrieve_response_code($response);
    return $code >= 200 && $code < 300;
}

function transition_endpoint(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    global $wpdb;
    $type = sanitize_key($request['type']);
    $id = absint($request['id']);
    $action = $request['action'] === 'approve' ? 'approve' : 'reject';
    $slug = $type === 'loan_payment' ? 'loan_payments' : $type;
    $status_field = $type === 'loan_payment' ? 'payment_status' : 'tr_status';
    $row = cct_row($slug, $id);
    if (! $row) {
        return new WP_Error('muwazana_transaction_not_found', 'العملية غير موجودة.', ['status' => 404]);
    }
    $current = normalize_status($row[$status_field] ?? '');
    $next = $action === 'approve' ? 'approved' : 'rejected';
    if ($current === $next) {
        return new WP_REST_Response(['ok' => true, 'status' => $next, 'id' => $id, 'notification' => notification_recipient($row)]);
    }
    if (! in_array($current, ['pending', 'unknown'], true)) {
        return new WP_Error('muwazana_invalid_transition', 'لا يمكن تغيير حالة هذه العملية.', ['status' => 409]);
    }

    $wpdb->query('START TRANSACTION');
    try {
        $locked = cct_row_for_update($slug, $id);
        if (! $locked || ! in_array(normalize_status($locked[$status_field] ?? ''), ['pending', 'unknown'], true)) {
            throw new \RuntimeException('Transaction already decided');
        }
        $row = $locked;
        $updates = [$status_field => $next, 'cct_modified' => current_time('mysql')];
        if ($action === 'reject') {
            $reason = sanitize_text_field($request->get_param('reason') ?: 'مرفوض عبر تليجرام');
            if ($type === 'expense') {
                $updates['decline_reson'] = $reason;
            }
            if ($type === 'loan_payment') {
                $updates['notes'] = trim((string) ($row['notes'] ?? '') . "\n" . $reason);
            }
        }
        update_cct($slug, $id, $updates);
        if ($action === 'approve' && $type === 'loan_payment') {
            apply_installment_payment($row);
        }
        $wpdb->query('COMMIT');
    } catch (\Throwable $error) {
        $wpdb->query('ROLLBACK');
        return new WP_Error('muwazana_transition_failed', 'تعذر تحديث العملية.', ['status' => 500]);
    }
    do_action('muwazana_transaction_transitioned', $type, $id, $next, get_current_user_id());
    $member_id = absint($row['cct_author_id'] ?? 0);
    $transition_note = $action === 'reject' ? sanitize_text_field($request->get_param('reason') ?: 'مرفوض عبر تليجرام') : '';
    create_notification($member_id, 'member', 'telegram.transaction.' . $next . '.' . $type . '.' . $id, 'transaction.' . $next,
        $next === 'approved' ? 'تم اعتماد العملية' : 'تم رفض العملية', $transition_note ?: transaction_from_row($row, $type)['title'], $type, $id);
    audit_event(get_current_user_id(), 'transaction.' . $next, $type, $id, transaction_from_row($row, $type), ['status' => $next], $transition_note);
    return new WP_REST_Response(['ok' => true, 'status' => $next, 'id' => $id, 'notification' => notification_recipient($row)]);
}

function notification_recipient(array $row): array
{
    $member_id = absint($row['cct_author_id'] ?? 0);
    $user = $member_id ? get_user_by('id', $member_id) : false;
    return [
        'name' => $user ? $user->display_name : (string) ($row['name'] ?? 'عضو موازنة'),
        'mobile' => $member_id ? member_mobile($member_id) : sanitize_text_field($row['mobile'] ?? ''),
    ];
}

function apply_installment_payment(array $payment): void
{
    global $wpdb;
    $schedule_id = absint($payment['installment_id'] ?? 0);
    $schedule_table = cct_table('loan_schedules');
    $schedule = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$schedule_table} WHERE _ID = %d FOR UPDATE", $schedule_id), ARRAY_A);
    if (! $schedule) {
        throw new \RuntimeException('Installment not found');
    }
    if (in_array(normalize_status($schedule['status'] ?? ''), ['paid', 'cancelled', 'carried_forward'], true)) {
        throw new \RuntimeException('Installment is already closed');
    }
    $payment_amount = amount($payment['amount'] ?? 0);
    $available = schedule_remaining($schedule);
    if ($payment_amount <= 0 || $payment_amount > $available) {
        throw new \RuntimeException('Payment exceeds installment remainder');
    }
    $paid = amount($schedule['paid_amount'] ?? $schedule['amount_piad'] ?? 0) + $payment_amount;
    $total = amount($schedule['amount'] ?? 0);
    $remaining = max(0, round($total - $paid, 2));
    $status = $remaining <= 0 ? 'paid' : 'carried_forward';
    update_cct('loan_schedules', $schedule_id, [
        'paid_amount' => number_format($paid, 2, '.', ''),
        'amount_piad' => number_format($paid, 2, '.', ''),
        'amount_remain' => '0.00',
        'status' => $status,
        'paid_at' => current_time('mysql'),
        'payment_id' => absint($payment['_ID'] ?? 0),
        'cct_modified' => current_time('mysql'),
    ]);

    $loan_id = absint($payment['loan_id'] ?? $schedule['loan_id'] ?? 0);
    if ($remaining > 0) {
        carry_to_next_installment($schedule, $remaining);
    }
    $loan = cct_row('loans', $loan_id);
    if ($loan) {
        $loan_remaining = max(0, round(loan_remaining_amount($loan) - $payment_amount, 2));
        update_cct('loans', $loan_id, [
            'remaining_amount' => number_format($loan_remaining, 2, '.', ''),
            'status' => $loan_remaining <= 0 ? 'completed' : 'active',
            'cct_modified' => current_time('mysql'),
        ]);
    }
}

function carry_to_next_installment(array $schedule, float $carry): void
{
    global $wpdb;
    $table = cct_table('loan_schedules');
    $loan_id = absint($schedule['loan_id'] ?? 0);
    $number = absint($schedule['installment_number'] ?? 0);
    $next = $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM {$table} WHERE loan_id = %d AND _ID <> %d AND (installment_number > %d OR due_date > %s) AND status NOT IN ('paid','cancelled','carried_forward') ORDER BY due_date ASC, _ID ASC LIMIT 1 FOR UPDATE",
        $loan_id,
        absint($schedule['_ID'] ?? 0),
        $number,
        (string) ($schedule['due_date'] ?? '')
    ), ARRAY_A);
    if ($next) {
        $new_total = round(amount($next['amount'] ?? 0) + $carry, 2);
        $new_remaining = round(schedule_remaining($next) + $carry, 2);
        update_cct('loan_schedules', absint($next['_ID']), [
            'amount' => number_format($new_total, 2, '.', ''),
            'amount_remain' => number_format($new_remaining, 2, '.', ''),
            'carry_in_amount' => number_format(amount($next['carry_in_amount'] ?? 0) + $carry, 2, '.', ''),
            'cct_modified' => current_time('mysql'),
        ]);
        return;
    }

    $member_id = absint($schedule['user_id'] ?? $schedule['cct_author_id'] ?? 0);
    $due = monthly_due_date(iso_date($schedule['due_date'] ?? ''), 1);
    $now = current_time('mysql');
    $id = insert_cct('loan_schedules', [
        'loan_id' => $loan_id,
        'user_id' => $member_id,
        'installment_number' => max(1, $number + 1),
        'due_date' => $due,
        'base_amount' => '0.00',
        'carry_in_amount' => number_format($carry, 2, '.', ''),
        'amount' => number_format($carry, 2, '.', ''),
        'amount_piad' => '0.00',
        'paid_amount' => '0.00',
        'amount_remain' => number_format($carry, 2, '.', ''),
        'status' => 'upcoming',
        'notes' => 'قسط إضافي من مبلغ مرحّل',
        'cct_author_id' => $member_id,
        'cct_created' => $now,
        'cct_modified' => $now,
    ]);
    if (is_wp_error($id)) throw new \RuntimeException($id->get_error_message());
}

function member_rows(string $slug, int $member_id): array
{
    global $wpdb;
    $table = cct_table($slug);
    if (! table_exists($table)) {
        return [];
    }
    $columns = $wpdb->get_col("SHOW COLUMNS FROM {$table}", 0) ?: [];
    $owner_columns = ['cct_author_id'];
    if (in_array('user_id', $columns, true)) {
        $owner_columns[] = 'user_id';
    }
    $where = implode(' OR ', array_map(static fn(string $column): string => "{$column} = %d", $owner_columns));
    $args = array_fill(0, count($owner_columns), $member_id);
    return $wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} WHERE ({$where}) ORDER BY _ID DESC LIMIT 500", ...$args), ARRAY_A) ?: [];
}

function member_transactions(int $member_id): array
{
    $items = array_merge(
        rows_to_transactions(member_rows('expense', $member_id), 'expense'),
        rows_to_transactions(member_rows('payment', $member_id), 'payment'),
        rows_to_transactions(member_rows('penalty', $member_id), 'penalty'),
        rows_to_transactions(member_rewards($member_id), 'reward'),
        rows_to_transactions(member_rows('loan_payments', $member_id), 'loan_payment')
    );
    usort($items, static fn(array $a, array $b): int => strcmp($b['date'], $a['date']));
    return $items;
}

function schedule_has_pending_payment(int $schedule_id, int $exclude_id = 0): bool
{
    global $wpdb;
    $table = cct_table('loan_payments');
    if (! table_exists($table)) return false;
    $sql = "SELECT COUNT(*) FROM {$table} WHERE installment_id = %d AND payment_status IN ('pending','on_hold')";
    $args = [$schedule_id];
    if ($exclude_id) {
        $sql .= ' AND _ID <> %d';
        $args[] = $exclude_id;
    }
    return (int) $wpdb->get_var($wpdb->prepare($sql, ...$args)) > 0;
}

function installment_display_title(array $schedule): string
{
    $loan = cct_row('loans', absint($schedule['loan_id'] ?? 0));
    $title = sanitize_text_field((string) ($loan['title'] ?? 'القرض'));
    $number = absint($schedule['installment_number'] ?? 0);
    $count = absint($loan['installment_count'] ?? 0);
    return 'قسط ' . $title . ($number ? ' — ' . $number . ($count ? ' من ' . $count : '') : '');
}

function obligations_payload(float $balance, array $installments, array $loans): array
{
    $month_end = wp_date('Y-m-t', null, new \DateTimeZone('Asia/Riyadh'));
    $active = [];
    foreach ($loans as $loan) $active[(int) $loan['id']] = $loan['status'] === 'active';
    $monthly = 0.0;
    foreach ($installments as $installment) {
        if (($active[(int) $installment['loanId']] ?? false)
            && $installment['dueDate'] <= $month_end
            && ! in_array($installment['status'], ['paid', 'cancelled', 'carried_forward'], true)) {
            $monthly += amount($installment['remainingAmount']);
        }
    }
    $debt = round(max(0, -$balance), 2);
    return [
        'debt' => $debt,
        'monthlyInstallments' => round($monthly, 2),
        'monthlyRequired' => round($debt + $monthly, 2),
        'monthEnd' => $month_end,
    ];
}

function member_loans(int $member_id): array
{
    global $wpdb;
    $table = cct_table('loans');
    if (! table_exists($table)) {
        return [];
    }
    return $wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} WHERE user_id = %d OR cct_author_id = %d ORDER BY _ID DESC", $member_id, $member_id), ARRAY_A) ?: [];
}

function member_schedules(int $member_id, array $loan_ids): array
{
    global $wpdb;
    $table = cct_table('loan_schedules');
    if (! table_exists($table)) {
        return [];
    }
    $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} WHERE user_id = %d OR cct_author_id = %d ORDER BY due_date ASC", $member_id, $member_id), ARRAY_A) ?: [];
    if ($loan_ids) {
        $placeholders = implode(',', array_fill(0, count($loan_ids), '%d'));
        $by_loan = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} WHERE loan_id IN ({$placeholders}) ORDER BY due_date ASC", ...array_map('absint', $loan_ids)), ARRAY_A) ?: [];
        $rows = array_merge($rows, $by_loan);
    }
    $unique = [];
    foreach ($rows as $row) {
        $unique[(int) $row['_ID']] = $row;
    }
    return array_values($unique);
}

/**
 * Returns the recorded remaining balance, falling back to the loan total for
 * rows created before `remaining_amount` became mandatory.
 */
function loan_remaining_amount(array $loan): float
{
    $remaining = $loan['remaining_amount'] ?? null;
    $total = amount($loan['total_amount'] ?? $loan['amount'] ?? 0);
    if ($remaining === null || $remaining === '') {
        return $total;
    }

    $value = amount($remaining);
    // JetEngine may default this field to zero when a loan is added manually.
    // A loan that is still active must therefore start from its full total.
    $terminal = in_array(normalize_status($loan['status'] ?? ''), ['paid', 'completed', 'cancelled'], true);
    return $value <= 0 && $total > 0 && ! $terminal ? $total : $value;
}

function loan_member_id(array $loan): int
{
    $user_id = absint($loan['user_id'] ?? 0);
    return $user_id ?: absint($loan['cct_author_id'] ?? 0);
}

function loan_payment_sum(array $payments, int $loan_id, string $status): float
{
    $sum = 0.0;
    foreach ($payments as $payment) {
        if (absint($payment['loan_id'] ?? 0) !== $loan_id) {
            continue;
        }
        if (normalize_status($payment['payment_status'] ?? '') === $status) {
            $sum += amount($payment['amount'] ?? 0);
        }
    }
    return round($sum, 2);
}

/**
 * Creates one real upcoming CCT installment for loans whose schedule was not
 * generated by the older WordPress workflow. It deliberately creates only the
 * next installment; after it is paid, the next dashboard read creates the one
 * that follows, keeping partial payments and early settlement accurate.
 */
function ensure_next_schedule(array $loan): ?array
{
    $loan_id = absint($loan['_ID'] ?? 0);
    $member_id = loan_member_id($loan);
    $remaining = loan_remaining_amount($loan);
    $monthly_amount = amount($loan['installment_amount'] ?? $loan['monthly_installment'] ?? 0);
    if ($monthly_amount <= 0) {
        $count = absint($loan['installment_count'] ?? 0);
        $monthly_amount = $count > 0 ? round($remaining / $count, 2) : 0;
    }
    if (! $loan_id || ! $member_id || $remaining <= 0 || $monthly_amount <= 0) {
        return null;
    }

    $start = iso_date($loan['start_date'] ?? '');
    $today = new \DateTimeImmutable(wp_date('Y-m-d'), wp_timezone());
    try {
        $due = $start ? new \DateTimeImmutable($start, wp_timezone()) : $today;
    } catch (\Throwable) {
        $due = $today;
    }
    for ($month = 0; $due < $today && $month < 240; $month++) {
        $due = $due->modify('+1 month');
    }

    $amount_due = min($monthly_amount, $remaining);
    $now = current_time('mysql');
    $id = insert_cct('loan_schedules', [
        'loan_id' => $loan_id,
        'user_id' => $member_id,
        'due_date' => $due->format('Y-m-d'),
        'amount' => number_format($amount_due, 2, '.', ''),
        'amount_piad' => '0.00',
        'amount_remain' => number_format($amount_due, 2, '.', ''),
        'status' => 'upcoming',
        'paid_amount' => '0.00',
        'payment_id' => 0,
        'notes' => 'قسط تلقائي',
        'cct_author_id' => $member_id,
        'cct_created' => $now,
        'cct_modified' => $now,
    ]);
    return is_wp_error($id) ? null : cct_row('loan_schedules', $id);
}

function member_rewards(int $member_id): array
{
    $query = new \WP_Query([
        'post_type' => 'reward',
        'post_status' => ['publish', 'private', 'draft'],
        'posts_per_page' => 500,
        'meta_query' => [
            'relation' => 'OR',
            ['key' => 'cct_author_id', 'value' => $member_id, 'compare' => '='],
            ['key' => 'user_id', 'value' => $member_id, 'compare' => '='],
        ],
        'no_found_rows' => true,
    ]);
    $rows = [];
    foreach ($query->posts as $post) {
        $rows[] = [
            '_ID' => $post->ID,
            'title' => get_the_title($post),
            'amount' => first_meta($post->ID, ['amount', 'reward_amount']),
            'date' => first_meta($post->ID, ['date', 'reward_date']) ?: get_the_date('Y-m-d', $post),
            'tr_status' => first_meta($post->ID, ['tr_status', 'status', 'reward_status']) ?: ($post->post_status === 'publish' ? 'approved' : 'pending'),
            'notes' => first_meta($post->ID, ['notes', 'description', 'reason']),
            'cct_author_id' => $member_id,
            'cct_created' => $post->post_date,
        ];
    }
    return $rows;
}

function all_rewards(): array
{
    $query = new \WP_Query([
        'post_type' => 'reward', 'post_status' => ['publish', 'private', 'draft'],
        'posts_per_page' => 1000, 'no_found_rows' => true,
    ]);
    $rows = [];
    foreach ($query->posts as $post) {
        $member_id = absint(first_meta($post->ID, ['cct_author_id', 'user_id']));
        $rows[] = [
            '_ID' => $post->ID, 'title' => get_the_title($post),
            'amount' => first_meta($post->ID, ['amount', 'reward_amount']),
            'date' => first_meta($post->ID, ['date', 'reward_date']) ?: get_the_date('Y-m-d', $post),
            'tr_status' => first_meta($post->ID, ['tr_status', 'status', 'reward_status']) ?: ($post->post_status === 'publish' ? 'approved' : 'pending'),
            'notes' => first_meta($post->ID, ['notes', 'description', 'reason']),
            'image_url' => first_meta($post->ID, ['image_url', 'evidence_image_url']),
            'cct_author_id' => $member_id, 'cct_created' => $post->post_date,
        ];
    }
    return $rows;
}

function first_meta(int $post_id, array $keys): mixed
{
    foreach ($keys as $key) {
        $value = get_post_meta($post_id, $key, true);
        if ($value !== '' && $value !== null) {
            return $value;
        }
    }
    return '';
}

function approved_sum(array $rows, string $status_field): float
{
    return round(array_reduce($rows, static fn(float $sum, array $row): float => $sum + (normalize_status($row[$status_field] ?? '') === 'approved' && sanitize_key((string) ($row['objection_status'] ?? '')) !== 'accepted' ? amount($row['amount'] ?? 0) : 0), 0.0), 2);
}

function pending_sum(array $rows, string $status_field): float
{
    return array_reduce($rows, static fn(float $sum, array $row): float => $sum + (in_array(normalize_status($row[$status_field] ?? ''), ['pending', 'on_hold'], true) ? amount($row['amount'] ?? 0) : 0), 0.0);
}

function rows_to_transactions(array $rows, string $type): array
{
    return array_map(static fn(array $row): array => transaction_from_row($row, $type), $rows);
}

function transaction_from_row(array $row, string $type): array
{
    $status_field = $type === 'loan_payment' ? 'payment_status' : 'tr_status';
    $title = (string) ($row['display_title'] ?? $row['title'] ?? '');
    if ($type === 'payment' && in_array($title, ['سداد عام', 'إيداع'], true)) {
        $title = 'إيداع عام';
    }
    if (! $title) {
        $title = match ($type) {
            'payment' => 'إيداع عام',
            'loan_payment' => 'إيداع قسط',
            'reward' => 'مكافأة',
            'penalty' => 'مخالفة',
            default => 'سحب',
        };
    }
    return [
        'id' => absint($row['_ID'] ?? 0),
        'type' => $type,
        'title' => $title,
        'amount' => amount($row['amount'] ?? 0),
        'date' => row_date($row),
        'status' => normalize_status($row[$status_field] ?? ''),
        'note' => (string) ($row['note'] ?? $row['notes'] ?? $row['description'] ?? ''),
        'managerNote' => (string) ($row['manager_note'] ?? ''),
        'memberId' => absint($row['user_id'] ?? $row['cct_author_id'] ?? 0),
        'loanId' => $type === 'loan_payment' ? absint($row['loan_id'] ?? 0) : null,
        'installmentId' => $type === 'loan_payment' ? absint($row['installment_id'] ?? 0) : null,
        'imageUrl' => (string) ($row['image_url'] ?? ''),
        'objectionStatus' => $type === 'penalty' ? penalty_objection_state($row)['status'] : 'none',
        'objectionText' => $type === 'penalty' ? penalty_objection_state($row)['text'] : '',
        'objectionDeadline' => $type === 'penalty' ? penalty_objection_state($row)['deadline'] : null,
        'canObject' => $type === 'penalty' ? penalty_objection_state($row)['canObject'] : false,
    ];
}

function schedule_payload(array $row): array
{
    $total = amount($row['amount'] ?? 0);
    $paid = amount($row['paid_amount'] ?? $row['amount_piad'] ?? 0);
    $remaining = isset($row['amount_remain']) && $row['amount_remain'] !== '' ? amount($row['amount_remain']) : max(0, $total - $paid);
    $loan = cct_row('loans', absint($row['loan_id'] ?? 0));
    return [
        'id' => absint($row['_ID'] ?? 0),
        'loanId' => absint($row['loan_id'] ?? 0),
        'title' => installment_display_title($row),
        'number' => absint($row['installment_number'] ?? 0),
        'count' => absint($loan['installment_count'] ?? 0),
        'baseAmount' => amount($row['base_amount'] ?? $total),
        'carryInAmount' => amount($row['carry_in_amount'] ?? 0),
        'amount' => $total,
        'paidAmount' => $paid,
        'remainingAmount' => $remaining,
        'dueDate' => iso_date($row['due_date'] ?? ''),
        'status' => normalize_status($row['status'] ?? ''),
        'hasPendingPayment' => schedule_has_pending_payment(absint($row['_ID'] ?? 0)),
    ];
}

function normalize_status(mixed $value): string
{
    $raw = (string) $value;
    $value = trim(function_exists('mb_strtolower') ? mb_strtolower($raw) : strtolower($raw));
    $map = [
        'pending' => 'pending', 'on_hold' => 'on_hold', 'hold' => 'on_hold', 'معلق' => 'on_hold', 'معلّق' => 'on_hold',
        'approved' => 'approved', 'approve' => 'approved',
        'rejected' => 'rejected', 'decline' => 'rejected', 'declined' => 'rejected',
        'upcoming' => 'upcoming', 'قادم' => 'upcoming', 'due' => 'due', 'مستحق' => 'due',
        'partial' => 'partial', 'مدفوع جزئيا' => 'partial', 'مدفوع جزئياً' => 'partial',
        'paid' => 'paid', 'مدفوع' => 'paid', 'overdue' => 'overdue', 'متأخر' => 'overdue',
        'carried_forward' => 'carried_forward', 'carried' => 'carried_forward', 'مرحّل' => 'carried_forward',
        'draft' => 'draft', 'مسودة' => 'draft',
        'active' => 'active', 'نشط' => 'active', 'suspended' => 'suspended',
        'completed' => 'completed', 'مكتمل' => 'completed',
        'cancelled' => 'cancelled', 'canceled' => 'cancelled', 'ملغي' => 'cancelled',
    ];
    if ($value === '' || $value === 'undefined' || $value === 'null') {
        return 'unknown';
    }
    return $map[$value] ?? 'unknown';
}

function amount(mixed $value): float
{
    return round(is_numeric($value) ? (float) $value : 0.0, 2);
}

function row_date(array $row): string
{
    $date_value = '';
    foreach (['payment_date', 'date', 'due_date'] as $key) {
        if (! empty($row[$key])) {
            $date_value = (string) $row[$key];
            break;
        }
    }

    $created_value = $row['cct_created'] ?? $row['created_at'] ?? '';
    $created = local_created_datetime($created_value);
    if ($date_value !== '') {
        $date = parsed_date($date_value);
        if (! $date) {
            return $created ? $created->format(DATE_ATOM) : wp_date('c');
        }
        if ($created) {
            return "{$date}T{$created->format('H:i:sP')}";
        }
        return "{$date}T12:00:00";
    }

    if ($created) return $created->format(DATE_ATOM);

    return wp_date('c');
}

function local_created_datetime(mixed $value): ?\DateTimeImmutable
{
    $value = trim((string) $value);
    if ($value === '') return null;
    try {
        return (new \DateTimeImmutable($value, wp_timezone()))
            ->setTimezone(new \DateTimeZone('Asia/Riyadh'));
    } catch (\Exception) {
        return null;
    }
}

function iso_date(mixed $value): string
{
    return parsed_date($value) ?: wp_date('Y-m-d', null, new \DateTimeZone('Asia/Riyadh'));
}

function parsed_date(mixed $value): ?string
{
    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }

    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $value, $match)) {
        return checkdate((int) $match[2], (int) $match[3], (int) $match[1]) ? $match[0] : null;
    }

    if (preg_match('/^(19|20)\d{6}$/', $value)) {
        $year = (int) substr($value, 0, 4);
        $month = (int) substr($value, 4, 2);
        $day = (int) substr($value, 6, 2);
        return checkdate($month, $day, $year) ? sprintf('%04d-%02d-%02d', $year, $month, $day) : null;
    }

    if (is_numeric($value)) {
        $timestamp = (int) $value;
        if ($timestamp > 9999999999) {
            $timestamp = (int) floor($timestamp / 1000);
        }
        if ($timestamp <= 86400) {
            return null;
        }
        return wp_date('Y-m-d', $timestamp, new \DateTimeZone('Asia/Riyadh'));
    }

    $timestamp = strtotime($value);
    return $timestamp && $timestamp > 86400
        ? wp_date('Y-m-d', $timestamp, new \DateTimeZone('Asia/Riyadh'))
        : null;
}

function cct_date_timestamp(mixed $value): int
{
    $date = iso_date($value);
    try {
        return (new \DateTimeImmutable("{$date} 00:00:00", new \DateTimeZone('Asia/Riyadh')))->getTimestamp();
    } catch (\Exception) {
        return current_time('timestamp', true);
    }
}

function legacy_date(mixed $value): string
{
    $timestamp = strtotime(iso_date($value) . ' 12:00:00');
    return wp_date('F j, Y', $timestamp ?: time());
}

function member_mobile(int $member_id): string
{
    foreach (['mobile', 'phone', 'billing_phone'] as $key) {
        $value = get_user_meta($member_id, $key, true);
        if ($value) {
            return sanitize_text_field($value);
        }
    }
    return '';
}

function sanitize_request_key(mixed $value): string
{
    $value = preg_replace('/[^a-zA-Z0-9-]/', '', (string) $value);
    return strlen($value) >= 16 && strlen($value) <= 64 ? $value : '';
}

function table_exists(string $table): bool
{
    global $wpdb;
    static $cache = [];
    if (! array_key_exists($table, $cache)) {
        $cache[$table] = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) === $table;
    }
    return $cache[$table];
}

function table_columns(string $table): array
{
    global $wpdb;
    return table_exists($table) ? ($wpdb->get_col("DESCRIBE {$table}", 0) ?: []) : [];
}

function cct_row(string $slug, int $id): ?array
{
    global $wpdb;
    $table = cct_table($slug);
    if (! table_exists($table)) {
        return null;
    }
    $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE _ID = %d LIMIT 1", $id), ARRAY_A);
    return $row ?: null;
}

function cct_row_for_update(string $slug, int $id): ?array
{
    global $wpdb;
    $table = cct_table($slug);
    if (! table_exists($table)) return null;
    $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE _ID = %d LIMIT 1 FOR UPDATE", $id), ARRAY_A);
    return $row ?: null;
}

function insert_cct(string $slug, array $data): int|WP_Error
{
    global $wpdb;
    $table = cct_table($slug);
    if (! table_exists($table)) {
        return new WP_Error('muwazana_cct_missing', "جدول {$slug} غير متاح.", ['status' => 500]);
    }
    $columns = table_columns($table);
    $data = array_intersect_key($data, array_flip($columns));
    if (! $wpdb->insert($table, $data)) {
        return new WP_Error('muwazana_insert_failed', 'تعذر حفظ العملية.', ['status' => 500]);
    }
    return (int) $wpdb->insert_id;
}

function update_cct(string $slug, int $id, array $data): void
{
    global $wpdb;
    $table = cct_table($slug);
    $data = array_intersect_key($data, array_flip(table_columns($table)));
    if ($data && $wpdb->update($table, $data, ['_ID' => $id]) === false) {
        throw new \RuntimeException('CCT update failed');
    }
}

function idempotent_result(string $request_id, string $entity_type): ?array
{
    global $wpdb;
    $request = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . request_table() . ' WHERE request_key = %s AND entity_type = %s', $request_id, $entity_type), ARRAY_A);
    if (! $request || ! $request['entity_id']) {
        return null;
    }
    if ($entity_type === 'reward') {
        foreach (all_rewards() as $row) {
            if (absint($row['_ID'] ?? 0) === (int) $request['entity_id']) return $row;
        }
        return null;
    }
    return cct_row($entity_type === 'loan_payment' ? 'loan_payments' : $entity_type, (int) $request['entity_id']);
}

function idempotent_insert(string $request_id, int $member_id, string $entity_type, string $slug, array $data): array|WP_Error
{
    global $wpdb;
    $wpdb->query('START TRANSACTION');
    $inserted = $wpdb->insert(request_table(), [
        'request_key' => $request_id,
        'member_id' => $member_id,
        'entity_type' => $entity_type,
        'entity_id' => 0,
        'created_at' => current_time('mysql'),
    ]);
    if (! $inserted) {
        $wpdb->query('ROLLBACK');
        $existing = idempotent_result($request_id, $entity_type);
        return $existing
            ? array_merge($existing, ['_muwazana_created' => false])
            : new WP_Error('muwazana_duplicate_pending', 'الطلب قيد المعالجة.', ['status' => 409]);
    }

    $entity_id = insert_cct($slug, $data);
    if (is_wp_error($entity_id)) {
        $wpdb->query('ROLLBACK');
        return $entity_id;
    }
    $wpdb->update(request_table(), ['entity_id' => $entity_id], ['request_key' => $request_id]);
    $wpdb->query('COMMIT');
    $row = cct_row($slug, $entity_id) ?: array_merge($data, ['_ID' => $entity_id]);
    return array_merge($row, ['_muwazana_created' => true]);
}

function member_owns_schedule(int $member_id, array $schedule): bool
{
    if ((int) ($schedule['user_id'] ?? 0) === $member_id || (int) ($schedule['cct_author_id'] ?? 0) === $member_id) {
        return true;
    }
    $loan = cct_row('loans', absint($schedule['loan_id'] ?? 0));
    return $loan && ((int) ($loan['user_id'] ?? 0) === $member_id || (int) ($loan['cct_author_id'] ?? 0) === $member_id);
}

function member_owns_row(int $member_id, array $row): bool
{
    return $member_id > 0 && in_array($member_id, [absint($row['cct_author_id'] ?? 0), absint($row['user_id'] ?? 0)], true);
}

function schedule_remaining(array $schedule): float
{
    if (isset($schedule['amount_remain']) && $schedule['amount_remain'] !== '') {
        return amount($schedule['amount_remain']);
    }
    return max(0, amount($schedule['amount'] ?? 0) - amount($schedule['paid_amount'] ?? $schedule['amount_piad'] ?? 0));
}

function ensure_cct_columns(string $slug, array $definitions): void
{
    global $wpdb;
    $table = cct_table($slug);
    if (! table_exists($table)) return;
    $columns = table_columns($table);
    foreach ($definitions as $name => $definition) {
        if (! in_array($name, $columns, true)) {
            $safe_name = preg_replace('/[^a-zA-Z0-9_]/', '', (string) $name);
            $wpdb->query("ALTER TABLE {$table} ADD COLUMN {$safe_name} {$definition}");
        }
    }
}

function backfill_loan_terms(): void
{
    global $wpdb;
    $table = cct_table('loans');
    if (! table_exists($table)) return;
    $columns = table_columns($table);
    if (in_array('principal_amount', $columns, true) && in_array('total_amount', $columns, true)) {
        $fallback = in_array('amount', $columns, true) ? 'COALESCE(NULLIF(total_amount,0), amount, 0)' : 'COALESCE(total_amount,0)';
        $wpdb->query("UPDATE {$table} SET principal_amount = {$fallback} WHERE principal_amount IS NULL OR principal_amount = 0");
    }
    if (in_array('interest_amount', $columns, true)) {
        $wpdb->query("UPDATE {$table} SET interest_amount = 0 WHERE interest_amount IS NULL");
    }
    if (in_array('interest_rate', $columns, true)) {
        $wpdb->query("UPDATE {$table} SET interest_rate = 0 WHERE interest_rate IS NULL");
    }
    reconcile_legacy_schedules();
}

function reconcile_legacy_schedules(): void
{
    global $wpdb;
    $loan_table = cct_table('loans');
    $schedule_table = cct_table('loan_schedules');
    if (! table_exists($loan_table) || ! table_exists($schedule_table)) return;
    $loans = $wpdb->get_results("SELECT * FROM {$loan_table} WHERE status IN ('active','نشط') LIMIT 500", ARRAY_A) ?: [];
    foreach ($loans as $loan) {
        $loan_id = absint($loan['_ID'] ?? 0);
        $member_id = loan_member_id($loan);
        $remaining = loan_remaining_amount($loan);
        $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$schedule_table} WHERE loan_id = %d ORDER BY due_date ASC, _ID ASC", $loan_id), ARRAY_A) ?: [];
        $allocated = 0.0;
        $last_date = iso_date($loan['start_date'] ?? '');
        $max_number = 0;
        foreach ($rows as $row_index => $row) {
            if (! absint($row['installment_number'] ?? 0)) {
                $derived_number = $row_index + 1;
                update_cct('loan_schedules', absint($row['_ID']), [
                    'installment_number' => $derived_number,
                    'base_amount' => number_format(amount($row['amount'] ?? 0), 2, '.', ''),
                ]);
                $row['installment_number'] = $derived_number;
                $row['base_amount'] = $row['amount'] ?? 0;
            }
            if (! in_array(normalize_status($row['status'] ?? ''), ['paid', 'cancelled', 'carried_forward'], true)) {
                $allocated += schedule_remaining($row);
            }
            $last_date = max($last_date, iso_date($row['due_date'] ?? ''));
            $max_number = max($max_number, absint($row['installment_number'] ?? 0));
        }
        $unallocated = round(max(0, $remaining - $allocated), 2);
        $regular = amount($loan['installment_amount'] ?? $loan['monthly_installment'] ?? 0);
        $count = absint($loan['installment_count'] ?? 0);
        if (! $loan_id || ! $member_id || $unallocated <= 0 || $regular <= 0) continue;
        $guard = 0;
        while ($unallocated > 0 && $guard++ < 240 && (! $count || $max_number < $count || $unallocated > $regular)) {
            $max_number++;
            $value = min($regular, $unallocated);
            $last_date = $rows || $max_number > 1 ? monthly_due_date($last_date, 1) : iso_date($loan['start_date'] ?? '');
            $now = current_time('mysql');
            insert_cct('loan_schedules', [
                'loan_id' => $loan_id, 'user_id' => $member_id, 'installment_number' => $max_number,
                'due_date' => $last_date, 'base_amount' => number_format($value, 2, '.', ''),
                'carry_in_amount' => '0.00', 'amount' => number_format($value, 2, '.', ''),
                'amount_piad' => '0.00', 'paid_amount' => '0.00', 'amount_remain' => number_format($value, 2, '.', ''),
                'status' => 'upcoming', 'notes' => 'قسط مرحّل من بيانات الإصدار السابق',
                'cct_author_id' => $member_id, 'cct_created' => $now, 'cct_modified' => $now,
            ]);
            $unallocated = round($unallocated - $value, 2);
        }
    }
}

function monthly_due_date(string $start_date, int $offset): string
{
    $start = new \DateTimeImmutable(iso_date($start_date), new \DateTimeZone('Asia/Riyadh'));
    $day = (int) $start->format('d');
    $month_start = $start->modify('first day of this month')->modify('+' . $offset . ' months');
    $last_day = (int) $month_start->format('t');
    return $month_start->setDate((int) $month_start->format('Y'), (int) $month_start->format('m'), min($day, $last_day))->format('Y-m-d');
}

function manager_user(int $actor_id): WP_User|WP_Error
{
    $user = get_user_by('id', $actor_id);
    if (! $user || ! user_can($user, MANAGE_CAPABILITY)) {
        return new WP_Error('muwazana_manager_forbidden', 'غير مصرح لك بإدارة موازنة.', ['status' => 403]);
    }
    return $user;
}

function manager_ids(): array
{
    $ids = [];
    foreach (get_users(['fields' => ['ID']]) as $user) {
        if (user_can((int) $user->ID, MANAGE_CAPABILITY)) $ids[] = (int) $user->ID;
    }
    return $ids;
}

function create_notification(int $recipient_id, string $audience, string $event_key, string $event, string $title, string $body, string $entity_type = '', int $entity_id = 0, array $payload = []): void
{
    global $wpdb;
    if (! $recipient_id) return;
    $wpdb->query($wpdb->prepare(
        'INSERT IGNORE INTO ' . notifications_table() . ' (event_key,recipient_id,audience,event,title,body,entity_type,entity_id,payload,created_at) VALUES (%s,%d,%s,%s,%s,%s,%s,%d,%s,%s)',
        sanitize_key($event_key), $recipient_id, $audience, sanitize_key($event), sanitize_text_field($title), sanitize_textarea_field($body),
        sanitize_key($entity_type), $entity_id, wp_json_encode($payload), current_time('mysql')
    ));
}

function notify_managers(string $event_key, string $event, string $title, string $body, string $entity_type = '', int $entity_id = 0, array $payload = []): void
{
    foreach (manager_ids() as $manager_id) {
        create_notification($manager_id, 'manager', $event_key, $event, $title, $body, $entity_type, $entity_id, $payload);
    }
}

function unread_notification_count(int $recipient_id, string $audience): int
{
    global $wpdb;
    return (int) $wpdb->get_var($wpdb->prepare(
        'SELECT COUNT(*) FROM ' . notifications_table() . ' WHERE recipient_id = %d AND audience = %s AND read_at IS NULL',
        $recipient_id, $audience
    ));
}

function notification_payload(array $row): array
{
    return [
        'id' => (int) $row['id'], 'event' => (string) $row['event'], 'title' => (string) $row['title'],
        'body' => (string) $row['body'], 'entityType' => (string) $row['entity_type'],
        'entityId' => (int) $row['entity_id'], 'createdAt' => local_created_datetime($row['created_at'])?->format(DATE_ATOM) ?? (string) $row['created_at'],
        'readAt' => $row['read_at'] ? (local_created_datetime($row['read_at'])?->format(DATE_ATOM) ?? (string) $row['read_at']) : null,
        'managerOnly' => $row['audience'] === 'manager',
    ];
}

function notifications_endpoint(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    global $wpdb;
    $recipient_id = absint($request['id']);
    $audience = $request->get_param('audience') === 'manager' ? 'manager' : 'member';
    if ($audience === 'manager' && is_wp_error(manager_user($recipient_id))) return manager_user($recipient_id);
    if ($audience === 'member' && is_wp_error(enabled_member($recipient_id))) return enabled_member($recipient_id);
    $rows = $wpdb->get_results($wpdb->prepare(
        'SELECT * FROM ' . notifications_table() . ' WHERE recipient_id = %d AND audience = %s ORDER BY created_at DESC, id DESC LIMIT 100',
        $recipient_id, $audience
    ), ARRAY_A) ?: [];
    return new WP_REST_Response(['notifications' => array_map(__NAMESPACE__ . '\\notification_payload', $rows), 'unread' => unread_notification_count($recipient_id, $audience)]);
}

function notifications_read_endpoint(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    global $wpdb;
    $recipient_id = absint($request['id']);
    $input = $request->get_json_params();
    $audience = ! empty($input['manager']) ? 'manager' : 'member';
    if ($audience === 'manager' && is_wp_error(manager_user($recipient_id))) return manager_user($recipient_id);
    $where = ['recipient_id' => $recipient_id, 'audience' => $audience];
    if (empty($input['all'])) $where['id'] = absint($input['id'] ?? 0);
    $wpdb->update(notifications_table(), ['read_at' => current_time('mysql')], $where);
    return new WP_REST_Response(['ok' => true]);
}

function all_cct_rows(string $slug): array
{
    global $wpdb;
    $table = cct_table($slug);
    return table_exists($table) ? ($wpdb->get_results("SELECT * FROM {$table} ORDER BY _ID DESC LIMIT 1000", ARRAY_A) ?: []) : [];
}

function admin_all_transactions(): array
{
    $items = array_merge(
        rows_to_transactions(all_cct_rows('expense'), 'expense'),
        rows_to_transactions(all_cct_rows('payment'), 'payment'),
        rows_to_transactions(all_cct_rows('loan_payments'), 'loan_payment'),
        rows_to_transactions(all_cct_rows('penalty'), 'penalty'),
        rows_to_transactions(all_rewards(), 'reward')
    );
    foreach ($items as &$item) {
        $user = ! empty($item['memberId']) ? get_user_by('id', (int) $item['memberId']) : false;
        $item['memberName'] = $user ? $user->display_name : 'عضو موازنة';
    }
    unset($item);
    usort($items, static fn(array $a, array $b): int => strcmp($b['date'], $a['date']));
    return $items;
}

function admin_dashboard_endpoint(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    global $wpdb;
    $actor_id = absint($request->get_param('actorId'));
    $actor = manager_user($actor_id);
    if (is_wp_error($actor)) return $actor;
    refresh_installment_states();
    $all_items = admin_all_transactions();
    $pending_count = count(array_filter($all_items, static fn(array $item): bool => $item['status'] === 'pending'));
    $hold_count = count(array_filter($all_items, static fn(array $item): bool => $item['status'] === 'on_hold'));
    $items = $all_items;
    $status = sanitize_key((string) $request->get_param('status'));
    $type = sanitize_key((string) $request->get_param('type'));
    $member_id = absint($request->get_param('memberId'));
    if ($status) $items = array_values(array_filter($items, static fn(array $item): bool => $item['status'] === $status));
    if ($type) $items = array_values(array_filter($items, static fn(array $item): bool => $item['type'] === $type));
    if ($member_id) $items = array_values(array_filter($items, static fn(array $item): bool => (int) $item['memberId'] === $member_id));
    $page = max(1, absint($request->get_param('page') ?: 1));
    $per_page = min(50, max(1, absint($request->get_param('perPage') ?: 8)));
    $total = count($items);
    $total_pages = max(1, (int) ceil($total / $per_page));
    $page = min($page, $total_pages);
    $notification_rows = $wpdb->get_results($wpdb->prepare(
        'SELECT * FROM ' . notifications_table() . " WHERE recipient_id = %d AND audience = 'manager' ORDER BY created_at DESC, id DESC LIMIT 50",
        $actor_id
    ), ARRAY_A) ?: [];
    $schedule_table = cct_table('loan_schedules');
    $loan_table = cct_table('loans');
    $overdue = table_exists($schedule_table) ? (int) $wpdb->get_var("SELECT COUNT(*) FROM {$schedule_table} WHERE status = 'overdue'") : 0;
    $active_loans = table_exists($loan_table) ? (int) $wpdb->get_var("SELECT COUNT(*) FROM {$loan_table} WHERE status IN ('active','نشط')") : 0;
    $profiles = profiles_endpoint()->get_data();
    $admin_installments = [];
    if (table_exists($schedule_table)) {
        foreach (($wpdb->get_results("SELECT * FROM {$schedule_table} WHERE status NOT IN ('paid','cancelled','carried_forward') ORDER BY due_date ASC LIMIT 1000", ARRAY_A) ?: []) as $schedule_row) {
            $schedule_item = schedule_payload($schedule_row);
            $schedule_item['memberId'] = absint($schedule_row['user_id'] ?? $schedule_row['cct_author_id'] ?? 0);
            if (! $schedule_item['memberId']) {
                $schedule_loan = cct_row('loans', absint($schedule_row['loan_id'] ?? 0));
                $schedule_item['memberId'] = $schedule_loan ? loan_member_id($schedule_loan) : 0;
            }
            $admin_installments[] = $schedule_item;
        }
    }
    return new WP_REST_Response([
        'metrics' => ['pending' => $pending_count, 'onHold' => $hold_count, 'overdueInstallments' => $overdue, 'activeLoans' => $active_loans],
        'profiles' => $profiles,
        'installments' => $admin_installments,
        'transactions' => [
            'transactions' => array_slice($items, ($page - 1) * $per_page, $per_page),
            'page' => $page, 'perPage' => $per_page, 'total' => $total, 'totalPages' => $total_pages,
        ],
        'notifications' => array_map(__NAMESPACE__ . '\\notification_payload', $notification_rows),
        'unreadNotifications' => unread_notification_count($actor_id, 'manager'),
    ]);
}

function admin_create_transaction_endpoint(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    global $wpdb;
    $input = $request->get_json_params();
    $actor = manager_user(absint($input['actorId'] ?? 0));
    if (is_wp_error($actor)) return $actor;
    $member_id = absint($input['memberId'] ?? 0);
    $member = enabled_member($member_id);
    if (is_wp_error($member)) return $member;
    $type = sanitize_key((string) ($input['type'] ?? ''));
    $amount_value = amount($input['amount'] ?? 0);
    $request_id = sanitize_request_key($input['requestId'] ?? '');
    if (! in_array($type, ['expense', 'payment', 'loan_payment', 'reward', 'penalty'], true) || $amount_value <= 0 || ! $request_id) {
        return new WP_Error('muwazana_invalid_admin_transaction', 'بيانات العملية غير صالحة.', ['status' => 400]);
    }
    $existing = idempotent_result($request_id, $type);
    if ($existing) return new WP_REST_Response(transaction_from_row($existing, $type));
    $now = current_time('mysql');
    $common = ['cct_author_id' => $member_id, 'created_by' => $actor->ID, 'cct_created' => $now, 'cct_modified' => $now];
    if ($type === 'expense') {
        $data = array_merge($common, [
            'title' => sanitize_text_field($input['category'] ?? 'سحب'), 'amount' => number_format($amount_value, 2, '.', ''),
            'date' => cct_date_timestamp($input['date'] ?? ''), 'notes' => sanitize_textarea_field($input['note'] ?? ''),
            'tr_status' => 'approved', 'name' => $member->display_name, 'mobile' => member_mobile($member_id), 'email' => $member->user_email,
            'approved_by' => $actor->ID, 'approved_at' => $now,
        ]);
        $row = idempotent_insert($request_id, $member_id, $type, 'expense', $data);
    } elseif ($type === 'payment') {
        $data = array_merge($common, [
            'title' => 'إيداع عام', 'amount' => number_format($amount_value, 2, '.', ''),
            'date' => cct_date_timestamp($input['date'] ?? ''), 'note' => sanitize_textarea_field($input['note'] ?? ''),
            'tr_status' => 'approved', 'name' => $member->display_name, 'mobile' => member_mobile($member_id), 'email' => $member->user_email,
            'approved_by' => $actor->ID, 'approved_at' => $now,
        ]);
        $row = idempotent_insert($request_id, $member_id, $type, 'payment', $data);
    } elseif ($type === 'loan_payment') {
        $schedule_id = absint($input['installmentId'] ?? 0);
        $schedule = cct_row('loan_schedules', $schedule_id);
        if (! $schedule || ! member_owns_schedule($member_id, $schedule)) return new WP_Error('muwazana_installment_not_found', 'القسط غير متاح.', ['status' => 404]);
        $schedule_loan = cct_row('loans', absint($schedule['loan_id'] ?? 0));
        if (! $schedule_loan || normalize_status($schedule_loan['status'] ?? '') !== 'active') return new WP_Error('muwazana_loan_not_active', 'القرض غير نشط حاليًا.', ['status' => 409]);
        if (schedule_has_pending_payment($schedule_id) || $amount_value > schedule_remaining($schedule)) {
            return new WP_Error('muwazana_installment_unavailable', 'القسط لديه دفعة معلقة أو المبلغ أكبر من المتبقي.', ['status' => 409]);
        }
        $data = array_merge($common, [
            'loan_id' => absint($schedule['loan_id'] ?? 0), 'installment_id' => $schedule_id,
            'display_title' => installment_display_title($schedule), 'amount' => number_format($amount_value, 2, '.', ''),
            'payment_date' => iso_date($input['date'] ?? ''), 'notes' => sanitize_textarea_field($input['note'] ?? ''),
            'payment_status' => 'approved', 'approved_by' => $actor->ID, 'approved_at' => $now,
        ]);
        $row = atomic_approved_loan_payment($request_id, $member_id, $data);
    } elseif ($type === 'penalty') {
        $title = sanitize_text_field($input['category'] ?? 'مخالفة');
        $image_url = store_evidence_image((string) ($input['imageData'] ?? ''), $title);
        if (is_wp_error($image_url)) return $image_url;
        $data = array_merge($common, [
            'title' => $title, 'amount' => number_format($amount_value, 2, '.', ''),
            'date' => cct_date_timestamp($input['date'] ?? ''), 'notes' => sanitize_textarea_field($input['note'] ?? ''),
            'image_url' => $image_url, 'tr_status' => 'approved', 'name' => $member->display_name,
            'mobile' => member_mobile($member_id), 'email' => $member->user_email,
            'approved_by' => $actor->ID, 'approved_at' => $now,
        ]);
        $row = idempotent_insert($request_id, $member_id, $type, 'penalty', $data);
    } else {
        $title = sanitize_text_field($input['category'] ?? 'مكافأة');
        $image_url = store_evidence_image((string) ($input['imageData'] ?? ''), $title);
        if (is_wp_error($image_url)) return $image_url;
        $inserted_request = $wpdb->insert(request_table(), [
            'request_key' => $request_id, 'member_id' => $member_id, 'entity_type' => 'reward',
            'entity_id' => 0, 'created_at' => $now,
        ]);
        if (! $inserted_request) {
            $existing = idempotent_result($request_id, 'reward');
            return $existing ? new WP_REST_Response(transaction_from_row($existing, 'reward')) : new WP_Error('muwazana_duplicate_pending', 'الطلب قيد المعالجة.', ['status' => 409]);
        }
        $post_id = wp_insert_post([
            'post_type' => 'reward', 'post_status' => 'publish', 'post_title' => $title,
            'post_content' => sanitize_textarea_field($input['note'] ?? ''), 'post_author' => $actor->ID,
        ], true);
        if (is_wp_error($post_id)) {
            $wpdb->delete(request_table(), ['request_key' => $request_id]);
            return new WP_Error('muwazana_reward_failed', 'تعذر حفظ المكافأة.', ['status' => 500]);
        }
        update_post_meta($post_id, 'amount', number_format($amount_value, 2, '.', ''));
        update_post_meta($post_id, 'date', iso_date($input['date'] ?? ''));
        update_post_meta($post_id, 'tr_status', 'approved');
        update_post_meta($post_id, 'notes', sanitize_textarea_field($input['note'] ?? ''));
        update_post_meta($post_id, 'cct_author_id', $member_id);
        update_post_meta($post_id, 'created_by', $actor->ID);
        update_post_meta($post_id, 'image_url', $image_url);
        $wpdb->update(request_table(), ['entity_id' => $post_id], ['request_key' => $request_id]);
        $row = [
            '_ID' => $post_id, 'title' => $title, 'amount' => $amount_value, 'date' => iso_date($input['date'] ?? ''),
            'tr_status' => 'approved', 'notes' => sanitize_textarea_field($input['note'] ?? ''),
            'image_url' => $image_url, 'cct_author_id' => $member_id, 'cct_created' => $now,
        ];
    }
    if (is_wp_error($row)) return $row;
    $transaction = transaction_from_row($row, $type);
    audit_event((int) $actor->ID, 'transaction.created_and_approved', $type, (int) $transaction['id'], [], $transaction, (string) ($input['note'] ?? ''));
    $event = in_array($type, ['reward', 'penalty'], true) ? 'member.' . $type . '.created' : 'transaction.approved';
    publish_manager_event($event, $actor, $member, $transaction, (string) ($input['note'] ?? ''));
    $label = $type === 'reward' ? 'تمت إضافة مكافأة' : ($type === 'penalty' ? 'تمت إضافة مخالفة' : 'عملية أضافها المدير');
    $member_body = $type === 'penalty'
        ? 'أضاف المدير مخالفة - ' . $transaction['title'] . '. يمكنك تقديم اعتراض خلال 15 يومًا.'
        : 'أضاف المدير ' . $transaction['title'] . ' واعتمدها مباشرة.';
    create_notification($member_id, 'member', 'admin.created.' . $type . '.' . $transaction['id'], $event, $label, $member_body, $type, (int) $transaction['id'], ['imageUrl' => $transaction['imageUrl'] ?? '', 'canObject' => $transaction['canObject'] ?? false, 'objectionDeadline' => $transaction['objectionDeadline'] ?? null]);
    return new WP_REST_Response($transaction, 201);
}

/** Stores optional evidence as a WordPress media item and returns its public URL. */
function store_evidence_image(string $data_url, string $title): string|WP_Error
{
    if ($data_url === '') return '';
    if (! preg_match('#^data:(image/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$#', $data_url, $matches)) {
        return new WP_Error('muwazana_invalid_image', 'ملف الصورة غير صالح.', ['status' => 400]);
    }
    $bytes = base64_decode(preg_replace('/\s+/', '', $matches[2]), true);
    if ($bytes === false || strlen($bytes) > 2500000) {
        return new WP_Error('muwazana_image_too_large', 'حجم الصورة يجب ألا يتجاوز 2.5 م.ب.', ['status' => 400]);
    }
    $extension = match ($matches[1]) { 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif', default => 'jpg' };
    $upload = wp_upload_bits('muwazana-' . sanitize_title($title ?: 'evidence') . '-' . time() . '.' . $extension, null, $bytes);
    if (! empty($upload['error'])) return new WP_Error('muwazana_image_upload_failed', 'تعذر رفع الصورة.', ['status' => 500]);
    $attachment_id = wp_insert_attachment(['post_mime_type' => $matches[1], 'post_title' => $title, 'post_status' => 'inherit'], $upload['file']);
    if (is_wp_error($attachment_id)) return new WP_Error('muwazana_image_upload_failed', 'تعذر حفظ الصورة.', ['status' => 500]);
    require_once ABSPATH . 'wp-admin/includes/image.php';
    wp_update_attachment_metadata($attachment_id, wp_generate_attachment_metadata($attachment_id, $upload['file']));
    return (string) wp_get_attachment_url($attachment_id);
}

function atomic_approved_loan_payment(string $request_id, int $member_id, array $data): array|WP_Error
{
    global $wpdb;
    $wpdb->query('START TRANSACTION');
    try {
        $inserted = $wpdb->insert(request_table(), [
            'request_key' => $request_id, 'member_id' => $member_id, 'entity_type' => 'loan_payment',
            'entity_id' => 0, 'created_at' => current_time('mysql'),
        ]);
        if (! $inserted) {
            $wpdb->query('ROLLBACK');
            $existing = idempotent_result($request_id, 'loan_payment');
            return $existing ? array_merge($existing, ['_muwazana_created' => false]) : new WP_Error('muwazana_duplicate_pending', 'الطلب قيد المعالجة.', ['status' => 409]);
        }
        $entity_id = insert_cct('loan_payments', $data);
        if (is_wp_error($entity_id)) throw new \RuntimeException($entity_id->get_error_message());
        $wpdb->update(request_table(), ['entity_id' => $entity_id], ['request_key' => $request_id]);
        $row = cct_row('loan_payments', $entity_id) ?: array_merge($data, ['_ID' => $entity_id]);
        apply_installment_payment($row);
        $wpdb->query('COMMIT');
        return array_merge($row, ['_muwazana_created' => true]);
    } catch (\Throwable $error) {
        $wpdb->query('ROLLBACK');
        return new WP_Error('muwazana_installment_apply_failed', 'تعذر تطبيق سداد القسط.', ['status' => 500]);
    }
}

function admin_edit_transaction_endpoint(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $input = $request->get_json_params();
    $actor = manager_user(absint($input['actorId'] ?? 0));
    if (is_wp_error($actor)) return $actor;
    $type = sanitize_key((string) $request['type']);
    $id = absint($request['id']);
    $slug = $type === 'loan_payment' ? 'loan_payments' : $type;
    $status_field = $type === 'loan_payment' ? 'payment_status' : 'tr_status';
    $row = cct_row($slug, $id);
    if (! $row) return new WP_Error('muwazana_transaction_not_found', 'العملية غير موجودة.', ['status' => 404]);
    if (! in_array(normalize_status($row[$status_field] ?? ''), ['pending', 'on_hold'], true)) {
        return new WP_Error('muwazana_transaction_locked', 'لا يمكن تعديل عملية نهائية.', ['status' => 409]);
    }
    $updates = ['cct_modified' => current_time('mysql')];
    if (isset($input['amount'])) {
        $new_amount = amount($input['amount']);
        if ($new_amount <= 0) return new WP_Error('muwazana_invalid_amount', 'المبلغ غير صالح.', ['status' => 400]);
        if ($type === 'loan_payment') {
            $schedule = cct_row('loan_schedules', absint($row['installment_id'] ?? 0));
            if (! $schedule || $new_amount > schedule_remaining($schedule)) return new WP_Error('muwazana_payment_too_large', 'المبلغ أكبر من المتبقي في القسط.', ['status' => 400]);
        }
        $updates['amount'] = number_format($new_amount, 2, '.', '');
    }
    if (isset($input['title']) && $type === 'expense') $updates['title'] = sanitize_text_field($input['title']);
    if (isset($input['note'])) $updates[$type === 'payment' ? 'note' : 'notes'] = sanitize_textarea_field($input['note']);
    if (isset($input['date'])) $updates[$type === 'loan_payment' ? 'payment_date' : 'date'] = $type === 'loan_payment' ? iso_date($input['date']) : cct_date_timestamp($input['date']);
    update_cct($slug, $id, $updates);
    $updated = cct_row($slug, $id) ?: array_merge($row, $updates);
    $transaction = transaction_from_row($updated, $type);
    $member_id = absint($row['cct_author_id'] ?? 0);
    $member = get_user_by('id', $member_id);
    audit_event((int) $actor->ID, 'transaction.edited', $type, $id, transaction_from_row($row, $type), $transaction, 'تعديل قبل الاعتماد');
    if ($member) publish_manager_event('transaction.edited', $actor, $member, $transaction, 'تعديل قبل الاعتماد');
    create_notification($member_id, 'member', 'transaction.edited.' . $type . '.' . $id . '.' . time(), 'transaction.edited', 'تم تعديل العملية', 'عدّل المدير بيانات ' . $transaction['title'] . ' قبل اتخاذ القرار.', $type, $id);
    return new WP_REST_Response($transaction);
}

function admin_transition_endpoint(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    global $wpdb;
    $input = $request->get_json_params();
    $actor = manager_user(absint($input['actorId'] ?? 0));
    if (is_wp_error($actor)) return $actor;
    $type = sanitize_key((string) $request['type']);
    $id = absint($request['id']);
    $action = sanitize_key((string) $request['action']);
    $note = sanitize_textarea_field($input['note'] ?? '');
    if (in_array($action, ['hold', 'reject'], true) && strlen(trim($note)) < 2) return new WP_Error('muwazana_note_required', 'الملاحظة مطلوبة.', ['status' => 400]);
    $slug = $type === 'loan_payment' ? 'loan_payments' : $type;
    $status_field = $type === 'loan_payment' ? 'payment_status' : 'tr_status';
    $row = cct_row($slug, $id);
    if (! $row) return new WP_Error('muwazana_transaction_not_found', 'العملية غير موجودة.', ['status' => 404]);
    $current = normalize_status($row[$status_field] ?? '');
    if (! in_array($current, ['pending', 'on_hold'], true)) return new WP_Error('muwazana_invalid_transition', 'لا يمكن تغيير حالة هذه العملية.', ['status' => 409]);
    $next = $action === 'approve' ? 'approved' : ($action === 'hold' ? 'on_hold' : 'rejected');
    $wpdb->query('START TRANSACTION');
    try {
        $locked = cct_row_for_update($slug, $id);
        if (! $locked || ! in_array(normalize_status($locked[$status_field] ?? ''), ['pending', 'on_hold'], true)) {
            throw new \RuntimeException('Transaction already decided');
        }
        $row = $locked;
        $updates = [$status_field => $next, 'manager_note' => $note, 'cct_modified' => current_time('mysql')];
        if ($next === 'approved') { $updates['approved_by'] = $actor->ID; $updates['approved_at'] = current_time('mysql'); }
        if ($next === 'rejected' && $type === 'expense') $updates['decline_reson'] = $note;
        update_cct($slug, $id, $updates);
        if ($next === 'approved' && $type === 'loan_payment') apply_installment_payment($row);
        $wpdb->query('COMMIT');
    } catch (\Throwable $error) {
        $wpdb->query('ROLLBACK');
        return new WP_Error('muwazana_transition_failed', 'تعذر تنفيذ القرار.', ['status' => 500]);
    }
    $updated = cct_row($slug, $id) ?: array_merge($row, $updates);
    $transaction = transaction_from_row($updated, $type);
    $member_id = absint($row['cct_author_id'] ?? 0);
    $member = get_user_by('id', $member_id);
    audit_event((int) $actor->ID, 'transaction.' . $next, $type, $id, transaction_from_row($row, $type), $transaction, $note);
    if ($member) publish_manager_event('transaction.' . $next, $actor, $member, $transaction, $note);
    $labels = ['approved' => 'تم اعتماد العملية', 'on_hold' => 'تم تعليق العملية', 'rejected' => 'تم رفض العملية'];
    create_notification($member_id, 'member', 'transaction.' . $next . '.' . $type . '.' . $id, 'transaction.' . $next, $labels[$next], $note ?: $transaction['title'], $type, $id);
    return new WP_REST_Response($transaction);
}

function admin_create_loan_endpoint(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $input = $request->get_json_params();
    $actor = manager_user(absint($input['actorId'] ?? 0));
    if (is_wp_error($actor)) return $actor;
    $member_id = absint($input['memberId'] ?? 0);
    $member = enabled_member($member_id);
    if (is_wp_error($member)) return $member;
    $title = sanitize_text_field($input['title'] ?? '');
    $principal = amount($input['principalAmount'] ?? 0);
    $rate = amount($input['interestRate'] ?? 0);
    $count = absint($input['installmentCount'] ?? 0);
    $start = parsed_date($input['startDate'] ?? '');
    $status = sanitize_key((string) ($input['status'] ?? 'draft'));
    $request_id = sanitize_request_key($input['requestId'] ?? '');
    if (! $title || $principal <= 0 || $rate < 0 || ! $count || $count > 240 || ! $start || ! in_array($status, ['draft', 'active', 'suspended', 'cancelled'], true) || ! $request_id) {
        return new WP_Error('muwazana_invalid_loan', 'بيانات القرض غير صالحة.', ['status' => 400]);
    }
    $existing = idempotent_result($request_id, 'loans');
    if ($existing) return new WP_REST_Response(loan_row_payload($existing));
    $interest = round($principal * $rate / 100, 2);
    $total = round($principal + $interest, 2);
    $installment = round($total / $count, 2);
    $now = current_time('mysql');
    $data = [
        'title' => $title, 'amount' => number_format($principal, 2, '.', ''), 'principal_amount' => number_format($principal, 2, '.', ''),
        'interest_rate' => number_format($rate, 2, '.', ''), 'interest_amount' => number_format($interest, 2, '.', ''),
        'total_amount' => number_format($total, 2, '.', ''), 'remaining_amount' => number_format($total, 2, '.', ''),
        'installment_count' => $count, 'installment_amount' => number_format($installment, 2, '.', ''),
        'start_date' => $start, 'status' => $status, 'notes' => sanitize_textarea_field($input['notes'] ?? ''),
        'user_id' => $member_id, 'created_by' => $actor->ID, 'cct_author_id' => $member_id,
        'cct_created' => $now, 'cct_modified' => $now,
    ];
    $row = idempotent_insert($request_id, $member_id, 'loans', 'loans', $data);
    if (is_wp_error($row)) return $row;
    if (! empty($row['_muwazana_created']) && $status === 'active') generate_loan_schedules($row);
    $payload = loan_row_payload($row);
    audit_event((int) $actor->ID, 'loan.created', 'loan', (int) $payload['id'], [], $payload, (string) ($input['notes'] ?? ''));
    publish_manager_event('loan.created', $actor, $member, ['id' => $payload['id'], 'type' => 'loan', 'title' => $title, 'amount' => $total, 'status' => $status], (string) ($input['notes'] ?? ''));
    create_notification($member_id, 'member', 'loan.created.' . $payload['id'], 'loan.created', 'تمت إضافة قرض جديد', 'أضاف المدير ' . $title . ' بإجمالي ' . number_format($total, 2) . ' ريال.', 'loan', (int) $payload['id']);
    return new WP_REST_Response($payload, 201);
}

function loan_row_payload(array $loan): array
{
    $total = amount($loan['total_amount'] ?? $loan['amount'] ?? 0);
    return [
        'id' => absint($loan['_ID'] ?? 0), 'title' => (string) ($loan['title'] ?? 'قرض'),
        'principalAmount' => amount($loan['principal_amount'] ?? $loan['amount'] ?? $total),
        'interestRate' => amount($loan['interest_rate'] ?? 0), 'interestAmount' => amount($loan['interest_amount'] ?? 0),
        'totalAmount' => $total, 'remainingAmount' => loan_remaining_amount($loan),
        'installmentCount' => absint($loan['installment_count'] ?? 0),
        'installmentAmount' => amount($loan['installment_amount'] ?? 0),
        'startDate' => iso_date($loan['start_date'] ?? ''), 'notes' => (string) ($loan['notes'] ?? ''),
        'status' => normalize_status($loan['status'] ?? ''), 'nextInstallment' => null,
    ];
}

function generate_loan_schedules(array $loan): void
{
    $loan_id = absint($loan['_ID'] ?? 0);
    $member_id = loan_member_id($loan);
    $count = absint($loan['installment_count'] ?? 0);
    $total = amount($loan['total_amount'] ?? 0);
    $regular = round($total / max(1, $count), 2);
    $allocated = 0.0;
    $start = iso_date($loan['start_date'] ?? '');
    for ($index = 0; $index < $count; $index++) {
        $value = $index === $count - 1 ? round($total - $allocated, 2) : $regular;
        $allocated = round($allocated + $value, 2);
        $now = current_time('mysql');
        $id = insert_cct('loan_schedules', [
            'loan_id' => $loan_id, 'user_id' => $member_id, 'installment_number' => $index + 1,
            'due_date' => monthly_due_date($start, $index), 'base_amount' => number_format($value, 2, '.', ''),
            'carry_in_amount' => '0.00', 'amount' => number_format($value, 2, '.', ''),
            'amount_piad' => '0.00', 'paid_amount' => '0.00', 'amount_remain' => number_format($value, 2, '.', ''),
            'status' => 'upcoming', 'payment_id' => 0, 'notes' => '',
            'cct_author_id' => $member_id, 'cct_created' => $now, 'cct_modified' => $now,
        ]);
        if (is_wp_error($id)) throw new \RuntimeException($id->get_error_message());
    }
}

function refresh_installment_states(): void
{
    global $wpdb;
    $schedule_table = cct_table('loan_schedules');
    if (! table_exists($schedule_table)) return;
    $today = wp_date('Y-m-d', null, new \DateTimeZone('Asia/Riyadh'));
    $rows = $wpdb->get_results("SELECT * FROM {$schedule_table} WHERE status IN ('upcoming','due','overdue') LIMIT 1000", ARRAY_A) ?: [];
    foreach ($rows as $row) {
        $loan = cct_row('loans', absint($row['loan_id'] ?? 0));
        if (! $loan || normalize_status($loan['status'] ?? '') !== 'active') continue;
        $due = iso_date($row['due_date'] ?? '');
        $next = $due < $today ? 'overdue' : ($due === $today ? 'due' : 'upcoming');
        if ($next !== normalize_status($row['status'] ?? '')) {
            update_cct('loan_schedules', absint($row['_ID']), ['status' => $next, 'cct_modified' => current_time('mysql')]);
            if (in_array($next, ['due', 'overdue'], true)) {
                $member_id = absint($row['user_id'] ?? $row['cct_author_id'] ?? loan_member_id($loan));
                create_notification($member_id, 'member', 'installment.' . $next . '.' . absint($row['_ID']), 'installment.' . $next,
                    $next === 'due' ? 'قسط مستحق اليوم' : 'قسط متأخر', installment_display_title($row), 'loan_schedules', absint($row['_ID']));
            }
        }
    }
}

function audit_event(int $actor_id, string $action, string $entity_type, int $entity_id, array $before, array $after, string $note = ''): void
{
    global $wpdb;
    $wpdb->insert(audit_table(), [
        'actor_id' => $actor_id, 'action' => sanitize_key($action), 'entity_type' => sanitize_key($entity_type), 'entity_id' => $entity_id,
        'before_values' => wp_json_encode($before), 'after_values' => wp_json_encode($after), 'note' => sanitize_textarea_field($note),
        'created_at' => current_time('mysql'),
    ]);
}

function publish_manager_event(string $event, WP_User $actor, WP_User $member, array $entity, string $note): void
{
    $payload = [
        'eventId' => wp_generate_uuid4(), 'eventType' => $event, 'occurredAt' => gmdate('c'),
        'actor' => ['id' => (int) $actor->ID, 'name' => $actor->display_name],
        'member' => ['id' => (int) $member->ID, 'name' => $member->display_name, 'mobile' => member_mobile((int) $member->ID)],
        'transaction' => $entity, 'managerNote' => $note,
    ];
    queue_manager_webhook($payload);
}

function queue_manager_webhook(array $payload): void
{
    global $wpdb;
    $event_id = sanitize_text_field((string) ($payload['eventId'] ?? wp_generate_uuid4()));
    $wpdb->query($wpdb->prepare(
        'INSERT IGNORE INTO ' . outbox_table() . ' (event_id,payload,attempts,next_attempt,created_at) VALUES (%s,%s,0,%s,%s)',
        $event_id, wp_json_encode($payload), current_time('mysql'), current_time('mysql')
    ));
    process_outbox();
}

function process_outbox(): void
{
    global $wpdb;
    $url = defined('MUWAZANA_MANAGER_EVENT_WEBHOOK_URL') ? (string) constant('MUWAZANA_MANAGER_EVENT_WEBHOOK_URL') : '';
    if (! wp_http_validate_url($url)) return;
    $rows = $wpdb->get_results($wpdb->prepare(
        'SELECT * FROM ' . outbox_table() . ' WHERE sent_at IS NULL AND next_attempt <= %s ORDER BY id ASC LIMIT 10', current_time('mysql')
    ), ARRAY_A) ?: [];
    foreach ($rows as $row) {
        $body = (string) $row['payload'];
        $headers = ['Content-Type' => 'application/json', 'X-Muwazana-Event' => (string) $row['event_id']];
        if (defined('MUWAZANA_MANAGER_EVENT_WEBHOOK_SECRET') && (string) constant('MUWAZANA_MANAGER_EVENT_WEBHOOK_SECRET') !== '') {
            $headers['X-Muwazana-Signature'] = 'sha256=' . hash_hmac('sha256', $body, (string) constant('MUWAZANA_MANAGER_EVENT_WEBHOOK_SECRET'));
        }
        $response = wp_safe_remote_post($url, ['timeout' => 5, 'blocking' => true, 'headers' => $headers, 'body' => $body]);
        $code = is_wp_error($response) ? 0 : wp_remote_retrieve_response_code($response);
        if ($code >= 200 && $code < 300) {
            $wpdb->update(outbox_table(), ['sent_at' => current_time('mysql'), 'last_error' => ''], ['id' => (int) $row['id']]);
        } else {
            $attempts = (int) $row['attempts'] + 1;
            $delay = min(360, 5 * (2 ** min(6, $attempts - 1)));
            $next = wp_date('Y-m-d H:i:s', time() + $delay * MINUTE_IN_SECONDS, wp_timezone());
            $error = is_wp_error($response) ? $response->get_error_message() : 'HTTP ' . $code;
            $wpdb->update(outbox_table(), ['attempts' => $attempts, 'next_attempt' => $next, 'last_error' => sanitize_text_field($error)], ['id' => (int) $row['id']]);
            notify_managers('manager.webhook.failed.' . $row['event_id'], 'integration.manager_webhook_failed', 'تعذّر إرسال إشعار المدير', 'حُفظ الحدث وسيعاد إرساله تلقائيًا.', 'outbox', (int) $row['id']);
        }
    }
    $pending = (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . outbox_table() . ' WHERE sent_at IS NULL');
    if ($pending && ! wp_next_scheduled('muwazana_process_outbox')) wp_schedule_single_event(time() + 5 * MINUTE_IN_SECONDS, 'muwazana_process_outbox');
}
