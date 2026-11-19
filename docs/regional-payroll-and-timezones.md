# Regional settings and payroll coverage

Workspace administrators can set the country, currency, formatting locale and attendance time zone in Company settings. Workspaces without saved settings use India, INR, en-IN and Asia/Kolkata. Currency and locale are workspace preferences. Existing salaries, expenses, payslips and other financial records keep their original denomination.

## Attendance time zone

Choose an IANA time zone before recording attendance. The employee clock, core attendance pages and API, punch corrections, dashboard and holiday calendar use the workspace zone. Punch timestamps remain UTC instants. Roster, leave, holiday and payroll calendar dates keep their canonical stored date representation. When a local day spans a daylight-saving transition, punch windows follow the actual local midnight boundaries. Manually entered times in a skipped hour are rejected. A repeated local time resolves to its first occurrence.

Existing punches, attendance or pending corrections lock the operational time zone in Company settings. Changing that zone for an active workspace requires an effective-dated migration and a rollout plan for staff and devices. A workspace uses one attendance time zone. Vendor integrations that send unqualified wall-clock timestamps still use the existing IST input contract. Daily and monthly attendance reports, their spreadsheets, and mobile punch evidence display the workspace time zone. Daily raw-punch presence uses the workspace calendar day. Monthly reports use saved work dates and reconciled punches.

## Payroll capabilities

The built-in engine generates India payroll in INR, with India-oriented EPF, ESI, professional tax, labour welfare fund and salary TDS features. Confirm coverage, wage bases, exemptions, rates, contribution periods, required identifiers and statutory export formats for the employer and establishment before using the results. Establishment and state rules can differ. Review the filing portal’s required import format before submitting any generated CSV. [Employees’ Provident Fund Organisation](https://www.epfindia.gov.in/), [Employees’ State Insurance Corporation](https://www.esic.gov.in/), [Income Tax Department salary TDS guidance](https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/tds-compliance).

The Income Tax Department documents a salary TDS transition that depends on the **payment date**, with payments from April 2026 covered by the new Act. Validate the applicable tax year, regime, withholding calculations and filing format for the pay date. Changing the workspace country or locale does not publish a payroll policy or provide updated statutory inputs. [Income Tax Department transition guidance](https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/tds-compliance).

For other jurisdictions, use a local payroll provider for calculation, filing and payment. Selecting a non-India region or non-INR currency prevents new runs in the built-in engine. Historical India payslips and finalized India reports retain their original amounts and formats. Examples of requirements a local provider must cover include the following.

| Jurisdiction | Validate with the local payroll provider |
| --- | --- |
| United Kingdom | PAYE, National Insurance and payroll reporting to HMRC. [HMRC](https://www.gov.uk/paye-for-employers) |
| United States | Federal income-tax withholding, Social Security and Medicare, employment-tax reporting and applicable state and local obligations. [IRS](https://www.irs.gov/businesses/small-businesses-self-employed/employment-taxes) |
| Canada | Federal and provincial withholding, applicable pension contributions and employment insurance. [Canada Revenue Agency](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4001/employers-guide-payroll-deductions-remittances.html) |
| Australia | PAYG withholding, superannuation and Single Touch Payroll. [Australian Taxation Office](https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers/engaging-a-worker/obligations-when-people-work-for-you) |
| United Arab Emirates | Applicable Wages Protection System obligations and establishment eligibility. [UAE Government](https://u.ae/en/information-and-services/jobs/employment-in-the-private-sector/payment-of-wages) |
