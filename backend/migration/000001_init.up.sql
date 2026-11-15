CREATE TABLE services (
    id                     TEXT     NOT NULL PRIMARY KEY,
    name                   TEXT     NOT NULL,
    name_key               TEXT     NOT NULL,
    check_type             TEXT     NOT NULL CHECK (check_type IN ('http', 'tcp')),
    http_method            TEXT,
    http_url               TEXT,
    http_query_params      TEXT     NOT NULL DEFAULT '[]',
    http_headers           TEXT     NOT NULL DEFAULT '[]',
    http_body_type         TEXT     NOT NULL DEFAULT 'none' CHECK (http_body_type IN ('none', 'json', 'text', 'form')),
    http_body_content      TEXT     NOT NULL DEFAULT '',
    json_rules             TEXT     NOT NULL DEFAULT '[]',
    json_rule_mode         TEXT     NOT NULL DEFAULT 'any' CHECK (json_rule_mode IN ('any', 'all')),
    cert_check_enabled     INTEGER  NOT NULL DEFAULT 0,
    cert_min_days_left     INTEGER,
    ignore_cert_errors     INTEGER  NOT NULL DEFAULT 0,
    tcp_host               TEXT,
    tcp_port               INTEGER,
    check_interval_seconds INTEGER  NOT NULL,
    timeout_seconds        INTEGER  NOT NULL,
    retry_count            INTEGER  NOT NULL,
    retry_interval_seconds INTEGER  NOT NULL,
    alerts_enabled         INTEGER  NOT NULL DEFAULT 1,
    unhealthy_message      TEXT     NOT NULL DEFAULT '',
    recovery_message       TEXT     NOT NULL DEFAULT '',
    shown_on_public_view   INTEGER  NOT NULL DEFAULT 0,
    paused                 INTEGER  NOT NULL DEFAULT 0,
    created_at             DATETIME NOT NULL,
    updated_at             DATETIME NOT NULL,
    CHECK (
        (check_type = 'http' AND http_method IS NOT NULL AND http_url IS NOT NULL
            AND tcp_host IS NULL AND tcp_port IS NULL)
        OR
        (check_type = 'tcp' AND tcp_host IS NOT NULL AND tcp_port IS NOT NULL
            AND http_method IS NULL AND http_url IS NULL)
    )
);

CREATE UNIQUE INDEX services_name_key ON services (name_key);

CREATE TABLE service_states (
    service_id              TEXT     NOT NULL PRIMARY KEY REFERENCES services (id) ON DELETE CASCADE,
    status                  TEXT     NOT NULL DEFAULT 'not_yet_checked'
        CHECK (status IN ('not_yet_checked', 'healthy', 'unhealthy')),
    last_checked_at         DATETIME,
    last_status_change_at   DATETIME,
    failure_code            TEXT
        CHECK (failure_code IN ('timed_out', 'could_not_connect', 'non_2xx_status', 'json_rule_matched',
                                'invalid_or_missing_json', 'too_many_redirects', 'certificate_problem')),
    failure_http_status     INTEGER,
    failure_json_rule_field TEXT,
    CHECK (failure_code IS NULL OR status = 'unhealthy')
);

CREATE TABLE targets (
    id                   TEXT     NOT NULL PRIMARY KEY,
    service_id           TEXT     NOT NULL REFERENCES services (id) ON DELETE CASCADE,
    name                 TEXT     NOT NULL DEFAULT '',
    type                 TEXT     NOT NULL CHECK (type IN ('email', 'webhook')),
    value                TEXT     NOT NULL,
    value_key            TEXT     NOT NULL,
    headers              TEXT     NOT NULL DEFAULT '[]',
    last_delivery_failed INTEGER  NOT NULL DEFAULT 0,
    created_at           DATETIME NOT NULL,
    updated_at           DATETIME NOT NULL
);

CREATE UNIQUE INDEX targets_service_contact ON targets (service_id, type, value_key);

CREATE TABLE app_settings (
    id                  INTEGER  NOT NULL PRIMARY KEY CHECK (id = 1),
    public_view_enabled INTEGER  NOT NULL DEFAULT 0,
    updated_at          DATETIME NOT NULL
);

INSERT INTO app_settings (id, public_view_enabled, updated_at)
VALUES (1, 0, strftime('%Y-%m-%d %H:%M:%f+00:00', 'now'));
