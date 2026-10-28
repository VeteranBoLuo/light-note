-- Structure only. Explicit activation selects the existing form and fixes the future registration boundary.
CREATE TABLE IF NOT EXISTS signup_source_survey (
  id tinyint unsigned NOT NULL,
  form_id varchar(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  eligible_from timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  after_create_time timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  after_user_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  CONSTRAINT fk_signup_source_survey_form FOREIGN KEY (form_id) REFERENCES collection_forms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;
