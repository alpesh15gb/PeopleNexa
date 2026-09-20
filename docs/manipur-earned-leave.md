# Manipur earned leave configuration

Create a versioned `leave_policy` draft at the tenant scope or a location scope. A location policy resolves ahead of the tenant policy at the same effective date. The policy period allocation snapshots the selected configuration, calculated workdays, earned amount, availability date, and tier rule; it does not alter earlier allocations, requests, or payroll records.

Use this rule on the earned-leave type:

```json
{
  "workedDayAccrual": {
    "source": "attendance_status",
    "tiers": [
      { "minDays": 0, "maxDays": 13, "daysEarned": 0 },
      { "minDays": 14, "maxDays": 24, "daysEarned": 1 },
      { "minDays": 25, "maxDays": 31, "daysEarned": 2 }
    ],
    "joiningMonthClaimDeferral": "next_month"
  }
}
```

The source is intentionally explicit: `present`, `late`, and `permission` attendance statuses count as one worked day, while `half_day` counts as 0.5. Absences do not count. Roster and paid-day sources are not inferred, so the tenant cannot accidentally receive a different definition of worked days.

All period and availability boundaries use IST calendar dates. A worker joining on the 14th can earn one day after reaching the configured tier, but that joining-month credit has an availability date of the first day of the next IST month. Submit the draft for shadow preview, activate it, then open its policy period to make the immutable allocations. The preview reports worked days, accrual, availability, and the deferral.
