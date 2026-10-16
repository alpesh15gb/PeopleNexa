# Machine imports and Location Manager visibility

New eBioserver employee imports retain their immutable device code, inactive status, missing portal credentials and Assignment Pending state. When the eBio group roster uniquely matches a mapped device location, `Employee.locationId` records that location. `branchId` remains empty until assignment is completed.

Employee Master, employee listing, master read/write, options, photo updates and device-access employee checks use branch location as authoritative, with employee location used only while branchless. Location restrictions are combined with search and pending predicates; they are never overwritten by those filters. Device lists remain restricted by actual device branch location.

Import employees makes one GetEmployeeCodes request per distinct mapped group with at most four in flight. It does not make per-person detail requests or guess location from an employee-code prefix. Codes found in multiple locations remain admin-only until resolved; failed group roster requests defer all location assignments for that run. No employment-status changes occur.

After deployment, verify eBio topology/machine branches are mapped under the correct active PeopleNexa locations, then run Settings → eBioserver → Import employees once to repair existing unassigned machine imports. Existing branch assignments and existing location assignments are never overwritten. Test an imported employee under Admin → Employee Master → Assignment Pending and the corresponding Location Manager account; a different Location Manager must not see it. Location Manager can then complete the profile and assign a branch within their location.

This changes import ownership, not scheduling: it does not add a new automatic employee-roster poll. Existing machine-log ingestion and attendance reconciliation remain unchanged. Real eBioserver roster responses must be verified on the VPS.
