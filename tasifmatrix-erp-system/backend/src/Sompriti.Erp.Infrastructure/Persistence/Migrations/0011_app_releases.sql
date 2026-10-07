-- Versions of the Android app, entered by the super admin after Google Play has published them.
-- The app sends its own version and learns whether a newer one exists:
--   MINOR  "an update is available" - the person may update later
--   MAJOR  the app cannot be used until it is updated from Google Play
-- One MAJOR release newer than the installed version is enough to require the update.

CREATE TABLE app_release (
    uuid                  uuid PRIMARY KEY,
    platform              varchar(20)  NOT NULL DEFAULT 'ANDROID' CHECK (platform IN ('ANDROID')),
    version_name          varchar(20)  NOT NULL CHECK (version_name ~ '^[0-9]{1,4}(\.[0-9]{1,4}){0,3}$'),
    update_type           varchar(10)  NOT NULL CHECK (update_type IN ('MINOR', 'MAJOR')),
    release_notes         varchar(1000) NULL,
    is_published          boolean      NOT NULL DEFAULT true,
    revision              uuid NOT NULL,
    created_date          timestamptz NOT NULL,
    updated_date          timestamptz NOT NULL,
    created_by_user_uuid  uuid NOT NULL,
    updated_by_user_uuid  uuid NOT NULL,
    created_by_user_name  varchar(100) NOT NULL,
    updated_by_user_name  varchar(100) NOT NULL,
    CONSTRAINT ux_app_release_version UNIQUE (platform, version_name)
);

-- Businesses (and signed-out phones) only read releases; the super admin writes them.
REVOKE INSERT, UPDATE, DELETE ON app_release FROM erp_tenant;
