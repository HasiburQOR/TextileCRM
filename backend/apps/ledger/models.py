"""The Settlement Ledger is gone (BR-49–51 redesign): the agreement type
became a label, the rate/currency configuration moved onto
SisterProfile, and the per-invoice amount-owed calculation it used to
feed now lives in apps.invoicing (Invoice.amount_owed). This app keeps
its migration history only — 0002 deletes the SettlementLedger table."""

# No models remain. The app itself stays installed so its migrations
# (including the table drop) keep applying against existing databases.
