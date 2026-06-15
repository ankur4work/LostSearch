# Data Processing Addendum (template)

_This is a template. Actual DPAs between DemandRadar (the "Processor")
and the Customer (the "Controller") are prepared from this boilerplate on
request. Not legal advice. Review with counsel before use._

## 1. Subject matter

This DPA governs Processor's processing of Personal Data on behalf of the
Controller in connection with the DemandRadar application.

## 2. Duration

For the term of Controller's Shopify subscription to the Service plus the
retention periods set out in §8.

## 3. Nature and purpose of processing

- Analysis of shopper search queries on the Controller's Shopify storefront.
- Computation of product-gap classifications and revenue estimates.
- Delivery of weekly digest emails to the Controller's designated email.
- Error monitoring and product analytics (see §7).

## 4. Types of Personal Data

- Controller's business contact (shop domain, merchant email).
- Controller's Shopify offline access token (encrypted at rest, never exported).

_No Personal Data of shoppers is processed by Processor._

## 5. Categories of data subjects

The Controller (shop owner/operator). No end-consumer data subjects are in
scope.

## 6. Obligations of the Processor

6.1. Process Personal Data only on documented instructions from the
Controller, including transfers, unless required by law.

6.2. Ensure persons authorized to process the Personal Data have committed
themselves to confidentiality or are under an appropriate statutory
obligation of confidentiality.

6.3. Take all measures required pursuant to Article 32 GDPR. Current
technical measures are enumerated in `docs/RECORDS_OF_PROCESSING.md` §8.

6.4. Respect the conditions in §7 (sub-processors).

6.5. Assist the Controller in responding to data-subject requests and in
complying with Articles 32–36 GDPR.

6.6. Delete or return all Personal Data after the end of the provision of
services (see §8 of this DPA).

6.7. Make available to the Controller all information necessary to
demonstrate compliance and allow audits (by Controller or its nominated
auditor, on reasonable notice).

## 7. Sub-processors

Controller authorizes Processor to engage the sub-processors listed in the
current `docs/PII_INVENTORY.md`. Processor will notify Controller of any
addition or replacement at least 30 days in advance and give Controller the
right to object on reasonable grounds.

## 8. Retention and deletion

- Active store data: retained for the life of the Controller's install plus
  30 days.
- Uninstall triggers a 30-day grace window; Shopify's `shop/redact` webhook
  triggers a 48h-delayed hard delete (cancellable by reinstall).
- Billing audit logs: 7 years (tax requirement).
- Backups propagate deletions on their next snapshot cycle (nightly).

## 9. International transfers

Transfers of Personal Data outside the Controller's region are governed by
Standard Contractual Clauses (SCCs) as adopted by the European Commission,
incorporated by reference.

## 10. Security incident

Processor shall notify Controller without undue delay (and no later than 72
hours) after becoming aware of a Personal Data Breach. Notification shall
include the nature of the breach, likely consequences, and measures taken to
mitigate its effects.

## 11. Governing law

As specified in the primary Terms of Service between Controller and
Processor.

## 12. Signatures

| Processor | Controller |
|---|---|
| Name: | Name: |
| Signature: | Signature: |
| Date: | Date: |

---

**Contact for DPA execution**: see `PRIVACY_CONTACT_EMAIL` env var.
