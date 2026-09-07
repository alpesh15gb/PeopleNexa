-- Keep one immutable raw event for each device/user/timestamp before adding
-- database-enforced idempotency for concurrent device re-uploads.
DELETE FROM "DeviceLog"
WHERE "id" IN (
    SELECT "id"
    FROM (
        SELECT "id", ROW_NUMBER() OVER (
            PARTITION BY "deviceId", "userId", "punchTime"
            ORDER BY "createdAt", "id"
        ) AS row_number
        FROM "DeviceLog"
        WHERE "userId" IS NOT NULL AND "punchTime" IS NOT NULL
    ) duplicates
    WHERE duplicates.row_number > 1
);

DELETE FROM "RealtimeLog"
WHERE "id" IN (
    SELECT "id"
    FROM (
        SELECT "id", ROW_NUMBER() OVER (
            PARTITION BY "realtimeDeviceId", "userId", "punchTime"
            ORDER BY "createdAt", "id"
        ) AS row_number
        FROM "RealtimeLog"
        WHERE "userId" IS NOT NULL AND "punchTime" IS NOT NULL
    ) duplicates
    WHERE duplicates.row_number > 1
);

CREATE UNIQUE INDEX "DeviceLog_deviceId_userId_punchTime_key"
ON "DeviceLog" ("deviceId", "userId", "punchTime");

CREATE UNIQUE INDEX "RealtimeLog_realtimeDeviceId_userId_punchTime_key"
ON "RealtimeLog" ("realtimeDeviceId", "userId", "punchTime");
