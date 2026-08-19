## About this project

- ai prompt
    
    
    ---
    
    ## 📝 Prompt: Base Structure for Loan & Installment Management App
    
    You are helping me design a **Loan & Installment Management Application** built on **WordPress** using the **JetEngine plugin** (CPTs, relations, forms, dynamic content) and other tools as needed.
    
    Please create a **structured blueprint** that covers the following aspects:
    
    ---
    
    ### 1. **Base Structure: Tables (Custom Post Types & Meta Fields)**
    
    - Define the main entities:
        - **Clients** (borrowers)
        - **Loans** (loan agreements)
        - **Installments** (payments linked to loans)
        - **Transactions/Receipts** (actual payments made)
    - For each entity, specify **meta fields** (e.g., loan amount, interest rate, due date, payment status).
    - Suggest if some fields should be **taxonomy** (e.g., loan status: active, paid, default).
    
    ---
    
    ### 2. **Relationships**
    
    - Define **1-to-many** and **many-to-many** relationships using JetEngine relations:
        - Client ↔ Loans (one client has many loans)
        - Loan ↔ Installments (one loan has many installments)
        - Installment ↔ Transaction (one installment can have multiple payment attempts)
    
    ---
    
    ### 3. **Forms & Interfaces**
    
    - JetFormBuilder / JetEngine forms for:
        - Adding a new client
        - Creating a new loan (linked to client)
        - Generating installments automatically (based on loan terms)
        - Logging a payment (linked to installment)
    - Frontend client portal:
        - View active loans
        - View installment schedule
        - Upload proof of payment (receipt)
    
    ---
    
    ### 4. **Automations & Calculations**
    
    - Automate **installment generation** (number of payments, due dates, amounts).
    - Auto-calculate **loan balance**, **remaining installments**, and **penalties/late fees** if needed.
    - Send **email/SMS reminders** before due dates.
    - Auto-update loan status (e.g., "Paid" when all installments are cleared).
    
    ---
    
    ### 5. **Dashboards & Reporting**
    
    - Admin dashboard:
        - List of active loans
        - Overdue installments
        - Total collected vs pending
        - Client summary with outstanding balance
    - Client dashboard:
        - Loan details
        - Installment history
        - Next payment due
    
    ---
    
    ### 6. **Permissions & Workflows**
    
    - Roles:
        - **Admin**: Full control (loans, clients, payments).
        - **Manager**: Add/edit clients & loans, approve payments.
        - **Client**: View own data only.
    - Workflows:
        - Loan request → Admin approval → Auto-generate installments.
        - Payment logged → Await approval → Update installment status.
    
    ---
    
    📌 Output expected:
    
    A **detailed structure plan** (like a system design document) with CPTs, fields, relations, UI forms, automations, and permissions clearly outlined for direct implementation with JetEngine and WordPress.
    
    ---
    
- **Structure Blueprint**
    
    
    ---
    
    # 📘 Loan & Installment Management – Structure Blueprint
    
    ## 1. **Base Structure: Custom Post Types (CPTs) & Fields**
    
    ### **Clients (المستفيدين)**
    
    - **Name** (text)
    - **National ID / رقم الهوية** (text)
    - **Phone** (text)
    - **Email** (email)
    - **Address** (textarea)
    - **Employment Status** (select: employed, self-employed, unemployed)
    - **Credit Score** (number, optional)
    
    ### **Loans (القروض)**
    
    - **Client (linked)** (relation → Client)
    - **Loan ID** (auto-generated unique ID)
    - **Loan Amount** (number)
    - **Interest Rate %** (number)
    - **Start Date** (date)
    - **Duration (months)** (number)
    - **Installment Frequency** (select: monthly, bi-weekly, custom)
    - **Total Payable** (calculated field = principal + interest)
    - **Status** (taxonomy: Active, Closed, Default, Pending Approval)
    
    ### **Installments (الأقساط)**
    
    - **Loan (linked)** (relation → Loan)
    - **Installment Number** (number, auto sequence)
    - **Due Date** (date)
    - **Installment Amount** (number)
    - **Paid Amount** (number, default 0)
    - **Balance** (calculated field = amount - paid)
    - **Status** (taxonomy: Pending, Paid, Overdue, Partial)
    
    ### **Transactions / Payments (الدفعات)**
    
    - **Installment (linked)** (relation → Installment)
    - **Payment Date** (date)
    - **Amount Paid** (number)
    - **Payment Method** (select: Cash, Bank Transfer, Card, Wallet)
    - **Receipt Upload** (file upload)
    - **Approved By** (user relation)
    - **Status** (Pending, Approved, Rejected)
    
    ---
    
    ## 2. **Relationships (JetEngine Relations)**
    
    - **Client → Loan** (1-to-Many)
    - **Loan → Installments** (1-to-Many)
    - **Installment → Transactions** (1-to-Many)
    
    ---
    
    ## 3. **Forms & Interfaces**
    
    ### Admin / Manager Forms
    
    - **Add New Client Form**
    - **Create Loan Form** → auto-generate installments based on duration & frequency.
    - **Record Payment Form** → attach to installment, upload receipt.
    - **Update Loan Status Form** (close / mark as default).
    
    ### Client Portal (Frontend)
    
    - **View My Loans** (list with loan summary).
    - **View Installments** (schedule table with due dates & status).
    - **Make Payment / Upload Proof** form.
    - **Notifications Section** (next due payment reminder).
    
    ---
    
    ## 4. **Automations & Calculations**
    
    - **Installment Generation**: When loan is approved → auto create X installments.
    - **Balance Update**: When payment logged → update installment balance + loan balance.
    - **Overdue Flag**: If due date < today and not paid → mark installment overdue.
    - **Loan Status Auto Update**: If all installments = Paid → mark loan Closed.
    - **Notifications**:
        - Reminder 3 days before due date (Email/SMS).
        - Alert when installment becomes overdue.
    
    ---
    
    ## 5. **Dashboards & Reporting**
    
    ### Admin Dashboard
    
    - **Active Loans Summary**
    - **Overdue Installments List**
    - **Collections This Month**
    - **Top Clients (by loan size)**
    - **Pending Approvals**
    
    ### Client Dashboard
    
    - **Loan Summary Card** (amount, balance, status).
    - **Installment Schedule Table**.
    - **Recent Payments**.
    - **Next Payment Due Widget**.
    
    ---
    
    ## 6. **Permissions & Workflows**
    
    ### Roles
    
    - **Admin** → full control.
    - **Manager** → add/edit loans, approve payments.
    - **Client** → view own data only.
    
    ### Workflow Example
    
    1. Client requests loan (form submission).
    2. Admin reviews → Approves/Rejects.
    3. If approved → Installments auto-created.
    4. Client makes payment → Pending status.
    5. Manager/Admin approves payment → installment marked Paid.
    6. When all installments cleared → Loan auto-marked as Closed.
    
    ---
    
    
    
- tables
    - Clients Table
        
        
        | Field | Type | Notes |
        | --- | --- | --- |
        | Name | Text | Full name |
        | National ID | Text | Unique identifier |
        | Phone | Text | Client phone number |
        | Email | Email | Client email |
        | Address | Textarea | Residential address |
        | Employment Status | Select | Employed / Self-employed / Unemployed |
        | Credit Score | Number | Optional – for risk assessment |
    - Loans Table
        
        
        | Field | Type | Notes |
        | --- | --- | --- |
        | Client (linked) | Relation | Link to Client |
        | Loan ID | Auto ID | Unique loan identifier |
        | Loan Amount | Number | Principal amount |
        | Interest Rate % | Number | Annual interest rate |
        | Start Date | Date | Loan start date |
        | Duration (months) | Number | Loan term in months |
        | Installment Frequency | Select | Monthly / Bi-weekly / Custom |
        | Total Payable | Calculated | Principal + interest |
        | Status | Taxonomy | Active / Closed / Default / Pending Approval |
    - Installments Table
        
        
        | Field | Type | Notes |
        | --- | --- | --- |
        | Loan (linked) | Relation | Link to Loan |
        | Installment Number | Number | Auto sequence number |
        | Due Date | Date | Installment due date |
        | Installment Amount | Number | Amount due |
        | Paid Amount | Number | Amount paid so far |
        | Balance | Calculated | Remaining balance |
        | Status | Taxonomy | Pending / Paid / Overdue / Partial |
    - Transactions Table
        
        
        | Field | Type | Notes |
        | --- | --- | --- |
        | Installment (linked) | Relation | Link to Installment |
        | Payment Date | Date | Date of payment |
        | Amount Paid | Number | Paid amount |
        | Payment Method | Select | Cash / Bank Transfer / Card / Wallet |
        | Receipt Upload | File Upload | Upload proof of payment |
        | Approved By | User Relation | Manager/Admin approving payment |
        | Status | Taxonomy | Pending / Approved / Rejected |
    - Relations Table
        
        
        | From Entity | To Entity | Type | Notes |
        | --- | --- | --- | --- |
        | Client | Loan | 1-to-Many | كل عميل يقدر يكون عنده أكثر من قرض |
        | Loan | Installment | 1-to-Many | كل قرض يتجزأ إلى عدة أقساط |
        | Installment | Transaction | 1-to-Many | كل قسط ممكن يدفع على دفعات متعددة |
        | Manager/Admin | Transaction | 1-to-Many | مسؤول يوافق على دفعات مختلفة |
    - Workflows Table
        
        
        | Step No | Workflow Step | Trigger / Action | Notes |
        | --- | --- | --- | --- |
        | 1 | Client submits loan request | Form submission | يرسل العميل طلب قرض من خلال الفورم. |
        | 2 | Admin/Manager reviews request | Manual approval | يقرر قبول أو رفض الطلب. |
        | 3 | Loan approved → Installments created | Automation (JetEngine / JetFormBuilder) | النظام ينشئ الأقساط تلقائياً حسب المدة والمبلغ. |
        | 4 | Installment reminder sent | Automation (email/SMS 3 days before due date) | يرسل تذكير للعميل بالدفعة المستحقة. |
        | 5 | Client makes payment | Form submission → Transaction created | العميل يرفع إثبات الدفع (وصل/تحويل). |
        | 6 | Manager/Admin approves payment | Manual action | القسط يتحدث لحالة "مدفوع". |
        | 7 | Overdue installments flagged | Daily automation | الأقساط المتأخرة تتغير حالتها إلى "متأخر". |
        | 8 | Loan marked closed | Automation (all installments = Paid) | عند اكتمال الدفع → القرض يتغير حالته إلى "مغلق". |
- 


