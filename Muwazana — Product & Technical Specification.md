# Muwazana — Complete Product & Technical Specification

**Project:** Muwazana (موازنة)
**Type:** Private Member Financial Tracking Platform
**Primary Language:** Arabic / RTL
**Currency:** Saudi Riyal (SAR)
**Architecture:** Standalone Backend + API
**Legacy Platform:** WordPress + JetEngine CCT
**Automation:** n8n / Bit Flows
**Primary Users:** Admin + Family Members

---

# 1. Executive Summary

Muwazana (موازنة) is a private financial tracking platform designed to manage small-scale financial relationships between an organization/admin and its members.

In the current use case, the "organization" is essentially the Admin, who may pay expenses on behalf of family members, advance money to them, receive repayments, give rewards/credits, or apply penalties/deductions.

The platform maintains a single running financial balance for each member.

The core principle is:

> Every financial event becomes a transaction associated with a member, and only approved transactions affect the member's financial balance.

The system is intentionally small and focused.

It is **not** intended to become a full accounting, ERP, banking, payroll, or enterprise finance platform.

---

# 2. Core Financial Concept

A member can have financial transactions in several directions.

### Money that increases what the member owes

Examples:

* Expenses paid on behalf of the member.
* Cash advances.
* Card withdrawals.
* Penalties/deductions.
* Installment loan obligations.

### Money that decreases what the member owes

Examples:

* Repayments/payments.
* Rewards.
* Credits.

All of these ultimately affect one running balance.

The system should make it immediately possible to answer:

* How much does this member owe?
* Why do they owe it?
* How much have they repaid?
* How much is pending approval?
* How much credit do they have?
* What installments remain?
* What payments are overdue?
* What transactions created the current balance?

---

# 3. Authoritative Balance Formula

The authoritative member balance is:

```text
balance = payments + rewards - expenses - penalties
```

Where:

* `payments` reduce the amount owed.
* `rewards` reduce the amount owed.
* `expenses` increase the amount owed.
* `penalties` increase the amount owed.

Only records with:

```text
status = approved
```

are included in the calculation.

## Balance Interpretation

```text
balance < 0
    Member owes money.

balance = 0
    Member has no outstanding balance.

balance > 0
    Member has a credit / overpayment.
```

Example:

```text
Expenses   = 1,000
Penalties  =   100
Payments   =   700
Rewards    =   200

balance = 700 + 200 - 1,000 - 100
balance = -200
```

The member still owes SAR 200.

---

# 4. Non-Negotiable Accounting Rule

This is one of the most important rules in the entire system:

> **Only approved records count toward financial calculations.**

This applies to every financial module.

For example:

* Pending expense → does not affect balance.
* Approved expense → affects balance.
* Rejected expense → does not affect balance.
* Pending payment → does not affect balance.
* Approved payment → affects balance.
* Rejected payment → does not affect balance.
* Pending reward → does not affect balance.
* Approved reward → affects balance.
* Pending penalty → does not affect balance.
* Approved penalty → affects balance.

This rule must be enforced at the backend/database/service layer.

It must never depend only on frontend filtering.

---

# 5. Transaction Status

The default transaction lifecycle is:

```text
pending
approved
rejected
```

Recommended behavior:

### pending

Created but not yet approved by Admin.

Does not affect balance.

### approved

Confirmed by Admin.

Affects balance.

### rejected

Explicitly rejected.

Does not affect balance.

A rejected record may contain:

```text
rejected_reason
rejected_by
rejected_at
```

The system should preserve rejected transactions instead of silently deleting them.

---

# 6. Why Rejected Records Should Be Preserved

Financial records should be auditable.

If a member submits an expense or repayment and the Admin rejects it, the system should normally keep the record with:

```text
status = rejected
```

rather than deleting it.

This allows the system to answer:

* What was submitted?
* When was it submitted?
* Who submitted it?
* Why was it rejected?
* Who rejected it?
* When was it rejected?

---

# 7. Core Data Model

The platform uses a simple modular data model.

The current/future modules are:

```text
users
expenses
payments
rewards
penalties
loans
loan_schedules
violations
attachments
audit_logs
```

Additional modules may be added later.

The architecture should not require a major redesign when a new financial module is introduced.

---

# 8. Users

The current implementation uses WordPress core users.

The long-term architecture is moving toward a standalone users table.

Conceptually:

```text
users
```

Possible fields:

```text
id
name
email
phone
role
is_active
created_at
updated_at
```

Roles should initially remain simple:

```text
admin
member
```

Do not create a complicated permission system unless it becomes necessary.

---

# 9. Expenses

The `expenses` module represents money spent or advanced on behalf of a member.

Examples:

* Admin pays SAR 150 for a member.
* Member withdraws SAR 500 from the Admin's card.
* Admin gives member SAR 1,000 cash.
* Any other approved financial advance.

Possible fields:

```text
id
user_id
amount
description
category
payment_method
transaction_date
status
group_id
created_by
approved_by
approved_at
rejected_reason
created_at
updated_at
```

The exact schema may be refined during implementation.

---

# 10. Payments

The `payments` module represents money returned by a member.

Examples:

* Cash repayment.
* Bank transfer.
* Card transfer.
* Other approved repayment.

Possible fields:

```text
id
user_id
amount
payment_method
payment_date
description
status
group_id
created_by
approved_by
approved_at
rejected_reason
created_at
updated_at
```

Important:

A payment submitted by a member remains pending until Admin approval.

It must not reduce the balance before approval.

---

# 11. Rewards

Rewards are positive credits assigned to a member.

Examples:

* Reward for a specific behavior.
* Promotional credit.
* Administrative adjustment.
* Other positive incentive.

Possible fields:

```text
id
user_id
amount
reason
description
date
status
group_id
created_by
approved_by
approved_at
rejected_reason
created_at
updated_at
```

Approved rewards reduce the member's outstanding debt.

They are included in the balance formula as:

```text
+ rewards
```

---

# 12. Penalties

Penalties represent deductions or additional financial obligations.

Examples:

* Financial penalty.
* Violation-related deduction.
* Administrative charge.

Possible fields:

```text
id
user_id
amount
reason
description
date
status
group_id
created_by
approved_by
approved_at
rejected_reason
created_at
updated_at
```

Approved penalties increase the member's outstanding debt.

They are included in the balance formula as:

```text
- penalties
```

---

# 13. Installment Loans

Installments are modeled separately from normal expenses because an installment plan represents a parent financial obligation with multiple scheduled payments.

The recommended structure is:

```text
loans
    |
    +---- loan_schedules
    +---- loan_schedules
    +---- loan_schedules
```

## loans

Represents the parent loan/obligation.

Possible fields:

```text
id
user_id
total_amount
installment_count
installment_amount
first_installment_date
status
description
created_by
created_at
updated_at
```

## loan_schedules

Represents each individual installment.

Possible fields:

```text
id
loan_id
installment_number
amount
due_date
status
paid_amount
paid_at
created_at
updated_at
```

---

# 14. Loan Status

A loan can have states such as:

```text
active
completed
cancelled
```

Individual schedules can have:

```text
upcoming
due
partial
paid
overdue
cancelled
```

The exact state machine should be implemented consistently.

---

# 15. Installment Payment Logic

A member may repay an installment partially or fully.

For example:

```text
Installment amount = SAR 500
Payment = SAR 200

Remaining installment amount = SAR 300
```

The installment should therefore support a `partial` state.

Possible lifecycle:

```text
upcoming
    ↓
due
    ↓
partial
    ↓
paid
```

Or:

```text
due
    ↓
overdue
```

if the due date passes without full payment.

The system must clearly distinguish:

* The loan's total outstanding amount.
* The current installment.
* The amount already paid.
* The remaining installment amount.
* The overall member balance.

---

# 16. Important Clarification About Loans and the Main Balance

The loan module should not accidentally double-count the same financial obligation.

If creating a loan already creates the underlying financial obligation, the implementation must define exactly when and how that obligation enters the main balance.

The architecture must avoid a situation such as:

```text
Loan total = 5,000
+
Every generated installment also counted as 5,000
```

which would incorrectly double-count the debt.

The recommended approach is to treat the loan as the source/origin of the obligation and the schedules as its payment schedule rather than independent additional debts.

The final implementation must explicitly define this relationship.

---

# 17. Violations

The system also contains a `violations` module.

A violation represents a rule violation or financial issue involving a member.

Possible fields:

```text
id
user_id
related_transaction_id
reason
description
amount
status
created_at
due_at
objection_status
```

A violation may optionally create or reference a financial penalty.

Do not automatically deduct money simply because a violation exists unless the business rule explicitly says that the violation itself has a financial effect.

This distinction is important:

```text
Violation
    ≠
Penalty
```

A violation can exist without a monetary deduction.

---

# 18. Violation Objections

Members may be allowed to object to a violation.

An objection should be recorded rather than simply changing the original violation.

Possible fields:

```text
objection_status
objection_reason
objected_at
reviewed_by
reviewed_at
review_result
```

The exact workflow can be:

```text
open
    ↓
objected
    ↓
under_review
    ↓
approved / rejected / resolved
```

---

# 19. Violation Due Rule

A business rule currently exists where a violation becomes due after approximately 3 days.

This should not be scattered as hard-coded logic throughout the application.

Instead, make the duration configurable.

For example:

```text
violation_due_after_days = 3
```

Then the system can calculate:

```text
due_at = created_at + configured duration
```

A scheduled job should periodically update the status when necessary.

---

# 20. Transaction Modification Window

A transaction creator should have a limited period during which they can modify or delete their own transaction.

Current business rule:

```text
5 minutes
```

Example:

```text
Created at 10:00
Editable until 10:05
```

After the window expires:

* Normal users cannot modify the transaction.
* Normal users cannot delete the transaction.
* Admin permissions may be different.

This rule must be enforced server-side.

Do not rely only on disabling frontend buttons.

Recommended configurable value:

```text
transaction_edit_window_minutes = 5
```

---

# 21. Group ID Pattern

The system deliberately prefers a simple grouping key over unnecessary junction tables.

When one action creates multiple related records, use:

```text
group_id
```

to associate them.

Example:

An Admin gives the same reward to five members.

Instead of creating a complex many-to-many junction architecture:

```text
reward_group
    |
    +--- reward/member 1
    +--- reward/member 2
    +--- reward/member 3
    +--- reward/member 4
    +--- reward/member 5
```

each reward record can simply contain the same:

```text
group_id = ABC123
```

This allows related records to be queried together without unnecessary relational complexity.

This is a deliberate architectural decision.

Do not introduce junction tables unless there is a real many-to-many relationship that cannot be represented cleanly with a grouping key.

---

# 22. Language-Neutral Database Values

Database values should remain language-neutral.

For example:

```text
pending
approved
rejected

upcoming
partial
paid
overdue

admin
member
```

The frontend maps these values to Arabic labels.

Example:

```text
pending → قيد الانتظار
approved → معتمد
rejected → مرفوض

upcoming → قادم
partial → مدفوع جزئيًا
paid → مدفوع
overdue → متأخر
```

Do not store Arabic display labels directly in database status fields.

This keeps:

* SQL queries clean.
* Backend logic consistent.
* APIs language-neutral.
* Future multilingual support easier.

---

# 23. Common Transaction Pattern

Every financial module should follow a common conceptual pattern.

At minimum:

```text
id
user_id
amount
status
created_at
updated_at
```

and where applicable:

```text
created_by
approved_by
approved_at
rejected_reason
group_id
```

The exact fields may differ by module.

The important principle is consistency.

---

# 24. Extensibility Pattern

Future modules should plug into the same architecture.

For example:

```text
notifications
salary
bonuses
adjustments
refunds
```

A new module should generally follow:

```text
module table
    ↓
user_id
    ↓
status
    ↓
approval workflow
    ↓
balance impact
    ↓
role-based API/UI
```

Before adding a new module, explicitly define:

1. What does it represent?
2. Does it affect balance?
3. Does it increase or decrease the balance?
4. Does it require approval?
5. What statuses does it have?
6. Who can create it?
7. Who can approve it?
8. Can it be modified?
9. Can it be deleted?
10. Does it require an audit trail?

---

# 25. Financial Direction Convention

A critical implementation detail:

The system should consistently define how each transaction affects the balance.

Using the authoritative formula:

```text
balance = payments + rewards - expenses - penalties
```

therefore:

| Module    | Balance Effect |
| --------- | -------------: |
| Expenses  |       Negative |
| Penalties |       Negative |
| Payments  |       Positive |
| Rewards   |       Positive |

This convention must remain consistent throughout:

* Backend calculations.
* API responses.
* Dashboard calculations.
* Reports.
* Database queries.
* Tests.

---

# 26. Negative vs Positive Balance

The system intentionally uses this convention:

```text
negative = member owes money
positive = member has credit
```

Examples:

```text
balance = -500
```

means:

> Member owes SAR 500.

```text
balance = 0
```

means:

> No outstanding balance.

```text
balance = +250
```

means:

> Member has SAR 250 credit.

The frontend can display these states in a user-friendly Arabic format.

---

# 27. Dashboard — Admin

The Admin dashboard should provide a clear financial overview.

## Global metrics

Examples:

```text
Total outstanding debt
Total member credit
Pending transactions
Overdue installments
Active loans
Open violations
```

## Member overview

Each member should have:

```text
Name
Current Balance
Pending Amount
Active Loans
Next Installment
Overdue Amount
```

The Admin should be able to drill into a member and see the complete transaction history.

---

# 28. Dashboard — Member

A member should primarily see their own financial information.

The member dashboard should answer:

```text
كم علي؟
ماذا دفعت؟
ماذا بقي؟
متى القسط القادم؟
هل لدي دفعات بانتظار الموافقة؟
هل لدي مخالفات؟
هل لدي رصيد أو مكافآت؟
```

Possible sections:

* Current balance.
* Expenses.
* Payments.
* Rewards.
* Penalties.
* Loans.
* Upcoming installments.
* Overdue installments.
* Violations.
* Pending requests.

Members must never be able to access another member's financial information.

---

# 29. Monthly Cycle

The system has a practical monthly financial cycle.

Salary is typically received around the 27th or 28th of each month.

However, normal debts do not expire at the end of a month.

Example:

```text
January:
Debt = 1,000
Payment = 400
Remaining = 600
```

February:

```text
Opening outstanding balance = 600
```

The system should therefore calculate balances from the complete approved transaction history rather than resetting balances monthly.

Monthly summaries can be generated for reporting, but the underlying balance remains continuous.

---

# 30. Balance Calculation Architecture

The balance should be calculated from authoritative approved transactions.

Conceptually:

```sql
SUM(approved_payments)
+ SUM(approved_rewards)
- SUM(approved_expenses)
- SUM(approved_penalties)
```

The backend should be the source of truth.

The frontend should not independently calculate the authoritative financial balance.

Caching/materialized balances may be introduced later for performance, but there must always be a reliable source of truth.

---

# 31. Data Integrity

Financial data must be treated as sensitive and important.

Important rules:

* Never trust a frontend-provided `user_id`.
* Verify ownership server-side.
* Validate transaction amounts.
* Validate permissions.
* Validate status transitions.
* Prevent unauthorized approval.
* Prevent unauthorized deletion.
* Prevent double approval.
* Prevent duplicate financial processing.
* Use database transactions where multiple related records must be created atomically.

---

# 32. Audit Trail

Important financial actions should be auditable.

Examples:

```text
expense created
expense approved
expense rejected
payment created
payment approved
payment rejected
reward approved
penalty approved
loan created
installment paid
violation created
violation objected
```

An `audit_logs` table may contain:

```text
id
actor_user_id
action
entity_type
entity_id
old_values
new_values
created_at
```

The exact implementation can be optimized later.

The principle is:

> Important financial state changes should be traceable.

---

# 33. Authentication and Authorization

The system has two primary roles:

```text
admin
member
```

## Admin

Can:

* View all members.
* View all transactions.
* Create transactions.
* Approve transactions.
* Reject transactions.
* Manage loans.
* Manage installments.
* Manage rewards.
* Manage penalties.
* Review violations.
* Review objections.
* View reports.
* Manage users.

## Member

Can:

* View own balance.
* View own transactions.
* Submit payments.
* View own installments.
* View own rewards.
* View own penalties.
* View own violations.
* Submit objections where permitted.

Members cannot:

* Approve transactions.
* Access other members' financial data.
* Change another member's transactions.
* Manipulate their own balance directly.

---

# 34. Security Principle

Authorization must happen on the backend.

Never assume:

```text
if frontend hides button → user cannot perform action
```

Instead:

```text
API receives request
    ↓
Authenticate user
    ↓
Check role
    ↓
Check ownership
    ↓
Validate business rules
    ↓
Perform operation
```

This applies especially to:

* Approvals.
* Deletions.
* Modifications.
* Financial amounts.
* User IDs.
* Balance-affecting operations.

---

# 35. Automation Strategy

The project uses self-hosted automation rather than relying heavily on SaaS automation platforms.

Current strategy:

```text
WordPress / JetEngine
        ↓
Bit Flows
```

and:

```text
Standalone Backend
        ↓
n8n
```

This approach is intended to minimize recurring SaaS costs while maintaining flexible automation.

---

# 36. Webhook Events

The backend should expose reliable webhook events.

Example event naming:

```text
expense.created
expense.updated
expense.approved
expense.rejected

payment.created
payment.updated
payment.approved
payment.rejected

reward.created
reward.approved
reward.rejected

penalty.created
penalty.approved
penalty.rejected

loan.created
loan.updated

installment.created
installment.due
installment.overdue
installment.paid

violation.created
violation.objected
violation.due
violation.resolved
```

The naming convention should remain consistent.

---

# 37. Webhook Payloads

Webhook payloads should contain enough context for n8n or another automation system to act without requiring unnecessary additional API calls.

Example conceptual payload:

```json
{
  "event": "payment.approved",
  "timestamp": "2026-08-19T18:00:00Z",
  "data": {
    "payment_id": "123",
    "user_id": "45",
    "amount": 500,
    "status": "approved"
  }
}
```

The exact payload schema should be standardized before production.

---

# 38. Idempotency

Automation and financial processing must account for duplicate requests.

For example, if the same webhook is delivered twice, the system must not:

```text
approve the same payment twice
```

or:

```text
create the same financial record twice
```

Use unique identifiers/idempotency keys where appropriate.

This is especially important for:

* Webhooks.
* Payment processing.
* Installment payments.
* Bulk operations.
* External automation.

---

# 39. Bulk Operations

The system may support operations affecting multiple members.

Examples:

* Give a reward to multiple members.
* Create expenses for several members.
* Create recurring financial records.

Use the previously defined:

```text
group_id
```

to associate records created by the same logical operation.

Example:

```text
group_id = reward_2026_08_001
```

All related reward records can then be retrieved together.

---

# 40. Migration from WordPress

The system originated as:

```text
WordPress
+
JetEngine CCT
+
JetFormBuilder
+
Bricks
```

This architecture was useful for rapid prototyping and administration.

However, the long-term direction is:

```text
Standalone Database
        ↓
Standalone Backend/API
        ↓
Frontend
        ↓
Automation / n8n
```

The migration should preserve the established business rules.

The goal is not to blindly reproduce WordPress internally.

Instead:

> Preserve the business model while improving the technical architecture.

---

# 41. Current Parallel Workstreams

Some modules may still exist in the WordPress/JetEngine environment while the standalone backend is being developed.

For example:

```text
WordPress / JetEngine
    ├── rewards
    ├── violations
    └── forms / admin workflows

Standalone Backend
    ├── users
    ├── expenses
    ├── payments
    ├── loans
    ├── loan schedules
    └── future modules
```

This is a transitional architecture.

Do not assume that every WordPress implementation must remain permanently.

---

# 42. API Design

The standalone backend should expose clean REST or equivalent API endpoints.

Examples:

```text
GET    /users
GET    /users/:id
GET    /users/:id/balance

GET    /expenses
POST   /expenses
PATCH  /expenses/:id

GET    /payments
POST   /payments
PATCH  /payments/:id

GET    /rewards
POST   /rewards

GET    /penalties
POST   /penalties

GET    /loans
POST   /loans

GET    /loans/:id/schedules

POST   /transactions/:id/approve
POST   /transactions/:id/reject
```

The exact endpoint structure may be changed if a better API design is proposed.

---

# 43. Approval API

Approval should be treated as a business action rather than a generic field update.

Prefer:

```text
POST /transactions/:id/approve
```

instead of allowing clients to arbitrarily send:

```json
{
  "status": "approved"
}
```

This makes it easier to enforce:

* Authorization.
* State transitions.
* Audit logging.
* Validation.
* Idempotency.

The same applies to rejection.

---

# 44. State Transitions

Financial states should have controlled transitions.

For example:

```text
pending
    ├── approved
    └── rejected
```

Avoid arbitrary transitions such as:

```text
approved → pending
```

unless the business logic explicitly supports them.

This prevents accidental financial corruption.

---

# 45. Database Design Philosophy

The database should favor:

* Clear tables.
* Foreign keys.
* Simple relationships.
* Explicit statuses.
* Consistent naming.
* Proper indexes.
* Referential integrity.

Avoid:

* Over-normalization.
* Unnecessary polymorphic complexity.
* Excessive junction tables.
* Storing calculated balances as the only source of truth.

The system should remain understandable to another developer.

---

# 46. Recommended Indexes

Financial queries will frequently filter by:

```text
user_id
status
created_at
transaction_date
due_date
group_id
```

These should be considered for indexing depending on the chosen database.

For example:

```text
(user_id, status)
(user_id, created_at)
(status, due_date)
(group_id)
```

Do not blindly add every possible index; use actual query patterns.

---

# 47. Decimal / Money Handling

Never use floating-point numbers for authoritative monetary calculations.

Use an appropriate fixed-precision decimal type.

For example:

```text
DECIMAL(12,2)
```

or the equivalent in the selected database.

All monetary values should use Saudi Riyal with two decimal places unless the product requirements change.

---

# 48. Dates and Time

Store timestamps consistently.

Recommended approach:

* Store timestamps in UTC at the backend/database level.
* Convert to Saudi Arabia time (`Asia/Riyadh`) for display and business rules where appropriate.

Be especially careful with:

* Due dates.
* 5-minute edit windows.
* 3-day violation deadlines.
* Monthly calculations.
* Installment schedules.
* Notifications.

---

# 49. Notifications

Notifications are a future/optional module.

Potential events:

```text
Payment approved
Payment rejected
Installment due soon
Installment overdue
Violation created
Violation becoming due
Reward approved
Penalty approved
```

The architecture should allow notifications to be triggered from webhook events rather than embedding notification logic inside every module.

---

# 50. Future Salary Integration

Salary integration may be added in the future.

Do not build it unless explicitly requested.

If added later, it should integrate through a dedicated module rather than changing the core balance model unnecessarily.

---

# 51. Reporting

The system may eventually provide:

* Monthly summaries.
* Member financial history.
* Debt trends.
* Payment history.
* Installment performance.
* Rewards and penalties.
* Outstanding balances.

Reports should derive from authoritative approved transaction data.

Pending/rejected records should be clearly separated.

---

# 52. Mobile-First UX

The system is primarily intended to be used from mobile devices.

Priorities:

1. Clear balance.
2. Fast transaction entry.
3. Simple approval actions.
4. Easy payment submission.
5. Clear installment status.
6. Easy navigation.
7. Minimal typing.

The interface should use Arabic RTL.

---

# 53. UI Status Mapping

Database values remain English.

Frontend maps them to Arabic.

Example:

```text
pending      → قيد المراجعة
approved     → معتمد
rejected     → مرفوض

upcoming     → قادم
due          → مستحق
partial      → مدفوع جزئيًا
paid         → مدفوع
overdue      → متأخر

active       → نشط
completed    → مكتمل
cancelled    → ملغي
```

The UI can additionally use icons/colors to make states visually clear.

---

# 54. Error Handling

Financial operations should fail safely.

If an operation fails halfway through, the database should not be left in an inconsistent state.

For multi-record operations, use database transactions.

Example:

Creating a loan may involve:

```text
Create loan
+
Create N schedules
+
Create audit event
```

These should either all succeed or be rolled back where appropriate.

---

# 55. Concurrency

The system should account for two administrators or processes attempting to change the same financial record.

For example:

```text
Admin A approves payment
Admin B approves payment
```

The result must not double-apply the payment.

Use appropriate database constraints/transactions/locking or state checks.

---

# 56. Deletion Policy

Financial records should generally be preserved.

Instead of physically deleting important financial records, prefer:

```text
cancelled
```

or another appropriate state where possible.

Hard deletion should be restricted and carefully considered.

This is especially important for:

* Expenses.
* Payments.
* Rewards.
* Penalties.
* Loans.
* Installments.

---

# 57. Source of Truth

There must be one authoritative source of financial truth.

During migration, avoid having:

```text
WordPress balance
+
Standalone balance
```

both independently determining the final amount.

During the transitional phase, explicitly define which system is authoritative for each module.

The final architecture should have the standalone backend/database as the authoritative financial source.

---

# 58. Testing Strategy

Financial calculations require automated tests.

At minimum test:

## Balance

```text
No transactions → 0

Expense 100 → -100

Payment 50 → -50

Reward 25 → -25

Penalty 10 → -35
```

## Approval

```text
Pending expense → no balance effect

Approved expense → balance affected

Rejected expense → no balance effect
```

## Payment

```text
Pending payment → no balance effect

Approved payment → balance increases
```

## Installments

Test:

* Full payment.
* Partial payment.
* Overdue installment.
* Multiple installments.
* Loan completion.
* Rejected payment.

## Edit window

Test:

```text
0–5 minutes → editable
after 5 minutes → restricted
```

## Violations

Test:

```text
creation
objection
3-day due rule
resolution
```

---

# 59. Development Strategy

Do not build the entire system in one step.

Recommended implementation order:

## Phase 1 — Foundation

* Project setup.
* Database.
* Authentication.
* Users.
* Roles.
* API structure.

## Phase 2 — Core Financial Transactions

* Expenses.
* Payments.
* Approval workflow.
* Balance calculation.

## Phase 3 — Dashboard

* Admin dashboard.
* Member dashboard.
* Transaction history.

## Phase 4 — Installments

* Loans.
* Loan schedules.
* Partial payments.
* Due/overdue logic.

## Phase 5 — Rewards & Penalties

* Rewards.
* Penalties.
* Approval workflow.

## Phase 6 — Violations

* Violations.
* Objections.
* Due rules.
* Attachments.

## Phase 7 — Automation

* Webhooks.
* n8n.
* Notifications.
* Scheduled jobs.

## Phase 8 — Migration

* Migrate approved/relevant WordPress data.
* Validate balances.
* Verify records.
* Switch source of truth.

---

# 60. Do Not Overbuild

This project should remain intentionally small.

Do not introduce:

* Double-entry accounting.
* General ledger accounting.
* Invoicing.
* Inventory.
* Payroll.
* CRM.
* Multi-company accounting.
* Public marketplace functionality.
* Complex multi-tenant architecture.
* Microservices without a real need.

The objective is:

> Build a reliable private financial tracking system, not an ERP.

---

# 61. Important Product Principle

The system should be designed around the user's real questions, not around abstract accounting concepts.

The Admin should be able to answer:

> Who owes me money?

> How much?

> Why?

> What has been paid?

> What is waiting for approval?

> What is overdue?

> What is the next installment?

> What transactions happened?

> What changed the balance?

The member should be able to answer:

> How much do I owe?

> What do I owe it for?

> What have I paid?

> What is still pending?

> When is my next installment?

> Do I have any violations?

---

# 62. Final Architectural Principle

The entire system should follow this simple pattern:

```text
                 ┌──────────────┐
                 │    Users     │
                 └──────┬───────┘
                        │
                        │ user_id
                        ▼
        ┌──────────────────────────────┐
        │      Financial Modules       │
        ├──────────────────────────────┤
        │ Expenses                     │
        │ Payments                     │
        │ Rewards                      │
        │ Penalties                    │
        │ Loans                        │
        │ Loan Schedules               │
        └──────────────┬───────────────┘
                       │
                       │ status
                       ▼
              ┌─────────────────┐
              │ Approval System │
              ├─────────────────┤
              │ pending         │
              │ approved        │
              │ rejected        │
              └────────┬────────┘
                       │
                       │ approved only
                       ▼
              ┌─────────────────┐
              │ Balance Engine  │
              ├─────────────────┤
              │ payments        │
              │ + rewards       │
              │ - expenses      │
              │ - penalties     │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Member Balance  │
              └─────────────────┘
```

The key invariant is:

```text
ONLY APPROVED FINANCIAL RECORDS
CAN AFFECT THE AUTHORITATIVE BALANCE.
```

---

# 63. Instructions to the AI Developer

Treat this document as the project's business and architecture context.

Before implementing:

1. Understand the complete financial model.
2. Identify ambiguous requirements.
3. Do not silently invent financial rules.
4. Explain important assumptions.
5. Propose the database schema.
6. Explain relationships and constraints.
7. Explain balance calculation.
8. Explain approval/state transitions.
9. Explain authentication and authorization.
10. Divide implementation into small phases.

When coding:

* Keep the architecture simple.
* Prefer maintainability over abstraction.
* Keep database values language-neutral.
* Enforce financial rules server-side.
* Never trust frontend calculations for authoritative balances.
* Never allow pending/rejected records to affect balances.
* Avoid duplicate financial processing.
* Preserve financial history.
* Use database transactions for atomic operations.
* Add tests for every important financial rule.

Do not rewrite working parts of the system unnecessarily.

Do not create a large number of files or abstractions without a clear purpose.

Do not add features that are outside the scope of Muwazana unless explicitly requested.

---

# 64. The One-Sentence Definition

If the entire project needs to be summarized in one sentence:

> **Muwazana is a private Arabic-first financial tracking platform that manages member debts, repayments, rewards, penalties, and installment obligations through approval-gated transactions, producing one authoritative running balance per member.**
