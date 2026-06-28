# Pipeline CSV Test Fixtures

Use these files to test upload, schema detection, mapping, profiling, cleaning, validation, execution, and dashboard generation.

- `askgo_factures_mixed_quality.csv`: invoice-like data with duplicates, missing amount/status, invalid date/amount, tenant isolation row, date/numeric/categorical fields.
- `askgo_commandes_budget_2026.csv`: command/order budget data with budget codes, partial current-year data, planned future order, invalid row.
- `generic_expenses_quality_cases.csv`: generic expense data with different column names for mapping flexibility and validation edge cases.

Recommended mapping examples:

- Invoice reference: `invoice_ref`, `commande_id`, or `record_id`
- Date: `invoice_date`, `commande_date`, or `date_posted`
- Supplier: `supplier_name`, `vendor`, or `vendor_name`
- Amount: `amount` or `gross_amount`
- Category/label: `category`, `budget_code`, or `expense_type`
- Status: `status` or `approval_state`
