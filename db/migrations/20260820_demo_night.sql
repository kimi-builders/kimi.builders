-- Demo Night v0(第三步,P3 提前):线上报名 + 归档页。
-- 核心语义:到场名单公开 —— 报名即同意把自己的 handle 署进该场次的到场名单,
-- 名单按报名时间正序展示(先到场先署名),到场本身就是稀缺背书(战略支柱 1)。
-- events 的创建 / 改状态 / 回放链接回填在 v0 一律直接 SQL 运维,不建站内后台;
-- starts_at 按 UTC 存储与展示(页面标注 UTC),v0 不做时区换算。

CREATE TABLE IF NOT EXISTS demo_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(120) NOT NULL,
  starts_at DATETIME NOT NULL COMMENT '开场时间(UTC,页面原样展示并标注)',
  description TEXT COMMENT 'Markdown 短文本(议程 / 分享人 / 玩法)',
  location_note VARCHAR(200) NOT NULL DEFAULT '' COMMENT '如「线上 · 会议链接报名后可见」',
  stream_url VARCHAR(500) NULL COMMENT '直播/回放链接;NULL=未公开',
  status VARCHAR(16) NOT NULL DEFAULT 'upcoming' COMMENT 'upcoming/done(手工切换)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_demo_event_status_time (status, starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 报名记录:复合主键天然幂等(重复报名 INSERT IGNORE 不报错、不重复署名)。
-- 无软删:取消报名即物理删除,名单只反映当前在场的人。
CREATE TABLE IF NOT EXISTS demo_rsvps (
  event_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '报名时间 = 署名顺序',
  PRIMARY KEY (event_id, user_id),
  KEY idx_demo_rsvp_user (user_id),
  CONSTRAINT fk_demo_rsvp_event FOREIGN KEY (event_id) REFERENCES demo_events (id) ON DELETE CASCADE,
  CONSTRAINT fk_demo_rsvp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
