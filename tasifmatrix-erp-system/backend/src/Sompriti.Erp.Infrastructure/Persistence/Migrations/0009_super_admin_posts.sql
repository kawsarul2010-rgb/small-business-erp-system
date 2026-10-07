-- Posts: messages the super admin writes for the businesses (news, maintenance notices, how to
-- renew...). Businesses read them on the Announcements page.
--
--   show_on                ALL (website and Android app), WEB (website only), APP (Android app only)
--   target_business_uuids  NULL: every business; otherwise only the listed businesses
--   admins_only            only the admins of those businesses see it
--   is_published           false: a draft, seen by nobody but the super admin
--   published_date         first published; newest first, and "new" for anyone who has not looked since
--
-- Only the database owner (the super admin) writes posts; businesses only read them.

CREATE TABLE super_admin_post (
    uuid                   uuid PRIMARY KEY,
    title                  varchar(150) NOT NULL,
    body                   text NOT NULL CHECK (length(body) <= 5000),
    show_on                varchar(10) NOT NULL DEFAULT 'ALL' CHECK (show_on IN ('ALL', 'WEB', 'APP')),
    target_business_uuids  uuid[] NULL,
    admins_only            boolean NOT NULL DEFAULT false,
    is_pinned              boolean NOT NULL DEFAULT false,
    is_published           boolean NOT NULL DEFAULT true,
    published_date         timestamptz NULL,
    revision               uuid NOT NULL,
    created_date           timestamptz NOT NULL,
    updated_date           timestamptz NOT NULL,
    created_by_user_uuid   uuid NOT NULL,
    updated_by_user_uuid   uuid NOT NULL,
    created_by_user_name   varchar(100) NOT NULL,
    updated_by_user_name   varchar(100) NOT NULL,
    CONSTRAINT ck_super_admin_post_published CHECK (NOT is_published OR published_date IS NOT NULL)
);
CREATE INDEX ix_super_admin_post_published ON super_admin_post (is_published, published_date DESC);

REVOKE INSERT, UPDATE, DELETE ON super_admin_post FROM erp_tenant;

-- When the person last opened the Announcements page; newer posts count as unread.
ALTER TABLE app_user ADD COLUMN posts_seen_at timestamptz NULL;
