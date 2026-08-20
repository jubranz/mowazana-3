<?php
/**
 * Plugin Name: Muwazana Bridge
 * Description: Secure, member-scoped REST bridge between the Muwazana PWA and JetEngine/WordPress data.
 * Version: 1.0.7
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

const VERSION = '1.0.7';
const CAPABILITY = 'muwazana_api_access';
const META_ENABLED = '_muwazana_enabled';
const META_PIN_HASH = '_muwazana_pin_hash';
const META_COLOR = '_muwazana_color';

register_activation_hook(__FILE__, __NAMESPACE__ . '\\activate');
add_action('rest_api_init', __NAMESPACE__ . '\\register_routes');
add_action('show_user_profile', __NAMESPACE__ . '\\render_member_fields');
add_action('edit_user_profile', __NAMESPACE__ . '\\render_member_fields');
add_action('personal_options_update', __NAMESPACE__ . '\\save_member_fields');
add_action('edit_user_profile_update', __NAMESPACE__ . '\\save_member_fields');

function activate(): void
{
    global $wpdb;

    $administrator = get_role('administrator');
    if ($administrator) {
        $administrator->add_cap(CAPABILITY);
    }

    add_role('muwazana_service', 'Muwazana API Service', [
        'read' => true,
        CAPABILITY => true,
    ]);

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
}

function request_table(): string
{
    global $wpdb;
    return $wpdb->prefix . 'muwazana_requests';
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
    register_rest_route('muwazana/v1', '/transactions/(?P<type>expense|payment|loan_payment)/(?P<id>\d+)/(?P<action>approve|reject)', [
        'methods' => 'POST',
        'callback' => __NAMESPACE__ . '\\transition_endpoint',
        'permission_callback' => __NAMESPACE__ . '\\service_permission',
    ]);
}

function render_member_fields(WP_User $user): void
{
    if (! current_user_can('edit_user', $user->ID)) {
        return;
    }
    $enabled = get_user_meta($user->ID, META_ENABLED, true) === '1';
    $color = sanitize_hex_color(get_user_meta($user->ID, META_COLOR, true)) ?: '#4f8f78';
    wp_nonce_field('muwazana_member_fields', 'muwazana_member_nonce');
    ?>
    <h2>تطبيق موازنة</h2>
    <table class="form-table" role="presentation">
        <tr>
            <th><label for="muwazana_enabled">تفعيل العضو</label></th>
            <td><label><input type="checkbox" id="muwazana_enabled" name="muwazana_enabled" value="1" <?php checked($enabled); ?>> إظهاره في تطبيق موازنة</label></td>
        </tr>
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
        $loan_id = absint($loan['_ID'] ?? 0);
        $has_open_installment = (bool) array_filter($installments, static fn(array $schedule): bool =>
            $schedule['loanId'] === $loan_id
            && $schedule['remainingAmount'] > 0
            && ! in_array($schedule['status'], ['paid', 'cancelled'], true)
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
            && ! in_array($schedule['status'], ['paid', 'cancelled'], true)
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
            'totalAmount' => $total,
            'remainingAmount' => $remaining,
            'pendingPaymentAmount' => $pending_payments,
            'status' => normalize_status($loan['status'] ?? ''),
            'nextInstallment' => $candidates[0] ?? null,
        ];
    }, $loans);

    return new WP_REST_Response([
        'member' => member_profile($user),
        'balance' => $balance,
        'pendingAmount' => round($pending, 2),
        'totals' => $totals,
        'loans' => $loan_payloads,
        'installments' => $installments,
        'recent' => array_slice($transactions, 0, 25),
    ]);
}

function transactions_endpoint(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    $dashboard = dashboard_endpoint($request);
    if (is_wp_error($dashboard)) {
        return $dashboard;
    }
    $type = sanitize_key((string) $request->get_param('type'));
    $data = $dashboard->get_data();
    $items = $data['recent'] ?? [];
    if ($type) {
        $items = array_values(array_filter($items, static fn(array $item): bool => $item['type'] === $type));
    }
    return new WP_REST_Response($items);
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
        'date' => legacy_date($input['date'] ?? ''),
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
        $remaining = schedule_remaining($schedule);
        if ($remaining <= 0 || $amount > $remaining) {
            return new WP_Error('muwazana_payment_too_large', 'المبلغ أكبر من المتبقي في القسط.', ['status' => 400]);
        }
        $data = [
            'loan_id' => absint($schedule['loan_id'] ?? 0),
            'installment_id' => $installment_id,
            'amount' => number_format($amount, 2, '.', ''),
            'payment_date' => iso_date($input['date'] ?? ''),
            'payment_method' => '',
            'notes' => sanitize_textarea_field($input['note'] ?? ''),
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
        'date' => legacy_date($input['date'] ?? ''),
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
        dispatch_approval_webhook($event_type, $transaction, $user);
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

function dispatch_approval_webhook(string $event_type, array $transaction, WP_User $user): void
{
    $url = approval_webhook_url($event_type);
    if ($url === '') {
        return;
    }

    wp_safe_remote_post($url, [
        'timeout' => 3,
        'blocking' => false,
        'headers' => ['Content-Type' => 'application/json'],
        'body' => wp_json_encode([
            'event' => $event_type . '.created',
            'timestamp' => gmdate('c'),
            'data' => array_merge($transaction, ['member' => member_profile($user)]),
        ]),
    ]);
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
    $schedule_id = absint($payment['installment_id'] ?? 0);
    $schedule = cct_row('loan_schedules', $schedule_id);
    if (! $schedule) {
        throw new \RuntimeException('Installment not found');
    }
    $paid = amount($schedule['paid_amount'] ?? $schedule['amount_piad'] ?? 0) + amount($payment['amount'] ?? 0);
    $total = amount($schedule['amount'] ?? 0);
    $remaining = max(0, round($total - $paid, 2));
    update_cct('loan_schedules', $schedule_id, [
        'paid_amount' => number_format($paid, 2, '.', ''),
        'amount_piad' => number_format($paid, 2, '.', ''),
        'amount_remain' => number_format($remaining, 2, '.', ''),
        'status' => $remaining <= 0 ? 'paid' : 'partial',
        'paid_at' => current_time('mysql'),
        'payment_id' => absint($payment['_ID'] ?? 0),
        'cct_modified' => current_time('mysql'),
    ]);

    $loan_id = absint($payment['loan_id'] ?? $schedule['loan_id'] ?? 0);
    $loan = cct_row('loans', $loan_id);
    if ($loan) {
        $loan_remaining = max(0, round(amount($loan['remaining_amount'] ?? $loan['total_amount'] ?? 0) - amount($payment['amount'] ?? 0), 2));
        update_cct('loans', $loan_id, [
            'remaining_amount' => number_format($loan_remaining, 2, '.', ''),
            'status' => $loan_remaining <= 0 ? 'completed' : 'active',
            'cct_modified' => current_time('mysql'),
        ]);
    }
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
    return round(array_reduce($rows, static fn(float $sum, array $row): float => $sum + (normalize_status($row[$status_field] ?? '') === 'approved' ? amount($row['amount'] ?? 0) : 0), 0.0), 2);
}

function pending_sum(array $rows, string $status_field): float
{
    return array_reduce($rows, static fn(float $sum, array $row): float => $sum + (normalize_status($row[$status_field] ?? '') === 'pending' ? amount($row['amount'] ?? 0) : 0), 0.0);
}

function rows_to_transactions(array $rows, string $type): array
{
    return array_map(static fn(array $row): array => transaction_from_row($row, $type), $rows);
}

function transaction_from_row(array $row, string $type): array
{
    $status_field = $type === 'loan_payment' ? 'payment_status' : 'tr_status';
    $title = (string) ($row['title'] ?? '');
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
    ];
}

function schedule_payload(array $row): array
{
    $total = amount($row['amount'] ?? 0);
    $paid = amount($row['paid_amount'] ?? $row['amount_piad'] ?? 0);
    $remaining = isset($row['amount_remain']) && $row['amount_remain'] !== '' ? amount($row['amount_remain']) : max(0, $total - $paid);
    return [
        'id' => absint($row['_ID'] ?? 0),
        'loanId' => absint($row['loan_id'] ?? 0),
        'title' => (string) (! empty($row['notes']) ? $row['notes'] : 'قسط'),
        'amount' => $total,
        'paidAmount' => $paid,
        'remainingAmount' => $remaining,
        'dueDate' => iso_date($row['due_date'] ?? ''),
        'status' => normalize_status($row['status'] ?? ''),
    ];
}

function normalize_status(mixed $value): string
{
    $raw = (string) $value;
    $value = trim(function_exists('mb_strtolower') ? mb_strtolower($raw) : strtolower($raw));
    $map = [
        'pending' => 'pending', 'approved' => 'approved', 'approve' => 'approved',
        'rejected' => 'rejected', 'decline' => 'rejected', 'declined' => 'rejected',
        'upcoming' => 'upcoming', 'قادم' => 'upcoming', 'due' => 'due', 'مستحق' => 'due',
        'partial' => 'partial', 'مدفوع جزئيا' => 'partial', 'مدفوع جزئياً' => 'partial',
        'paid' => 'paid', 'مدفوع' => 'paid', 'overdue' => 'overdue', 'متأخر' => 'overdue',
        'active' => 'active', 'نشط' => 'active', 'completed' => 'completed', 'مكتمل' => 'completed',
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
        $date = iso_date($date_value);
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
    $value = trim((string) $value);
    if (preg_match('/^\d{4}-\d{2}-\d{2}/', $value, $match)) {
        return $match[0];
    }
    $timestamp = strtotime($value);
    return $timestamp ? wp_date('Y-m-d', $timestamp) : wp_date('Y-m-d');
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
    static $cache = [];
    if (! isset($cache[$table])) {
        $cache[$table] = table_exists($table) ? $wpdb->get_col("DESCRIBE {$table}", 0) : [];
    }
    return $cache[$table];
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

function schedule_remaining(array $schedule): float
{
    if (isset($schedule['amount_remain']) && $schedule['amount_remain'] !== '') {
        return amount($schedule['amount_remain']);
    }
    return max(0, amount($schedule['amount'] ?? 0) - amount($schedule['paid_amount'] ?? $schedule['amount_piad'] ?? 0));
}
