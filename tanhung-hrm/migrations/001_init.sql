-- TAN HUNG HRM — lược đồ CSDL khởi tạo (PostgreSQL 13+)
-- Tiền tệ lưu bằng bigint (đồng VND), thời gian lưu timestamptz.

/* ============ XÁC THỰC & BẢO MẬT ============ */
CREATE TABLE admin_account (
  id                  smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),          -- chỉ một tài khoản quản trị
  username            text NOT NULL,
  password_hash       text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  otp_email           text,
  idle_minutes        integer NOT NULL DEFAULT 30 CHECK (idle_minutes BETWEEN 5 AND 240),
  locked_until        timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE setup_tokens_used (
  token_hash text PRIMARY KEY,
  used_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash   text NOT NULL UNIQUE,
  csrf_token   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  revoke_reason text,
  ip           text,
  user_agent   text
);
CREATE INDEX sessions_active_idx ON sessions (expires_at) WHERE revoked_at IS NULL;

CREATE TABLE auth_events (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  event      text NOT NULL,
  success    boolean,
  ip         text,
  user_agent text,
  detail     text
);
CREATE INDEX auth_events_at_idx ON auth_events (at DESC);
CREATE INDEX auth_events_login_idx ON auth_events (event, success, ip, at);

CREATE TABLE otp_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  purpose        text NOT NULL CHECK (purpose IN ('password', 'email')),
  code_hash      text NOT NULL,                 -- HMAC-SHA256, không lưu mã OTP dạng thuần
  email          text NOT NULL,
  new_email      text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  attempts       integer NOT NULL DEFAULT 0,
  used_at        timestamptz,
  invalidated_at timestamptz
);
CREATE INDEX otp_requests_session_idx ON otp_requests (session_id, created_at DESC);

CREATE TABLE auth_tickets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  otp_id     uuid NOT NULL REFERENCES otp_requests(id) ON DELETE CASCADE,
  purpose    text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  payload    text,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);

/* ============ DỮ LIỆU NHÂN SỰ & TIỀN LƯƠNG ============ */
CREATE TABLE app_settings (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data        jsonb NOT NULL,
  initialized boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE employees (
  id           text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  code         text NOT NULL CHECK (length(code) BETWEEN 1 AND 32),
  name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  dob          date,
  gender       text,
  address      text,
  cccd         text CHECK (cccd IS NULL OR cccd ~ '^[0-9]{9,12}$'),
  cccd_date    date,
  cccd_place   text,
  phone        text,
  position     text,
  start_date   date,
  salary       bigint NOT NULL CHECK (salary >= 0),
  ins_salary   bigint NOT NULL DEFAULT 0 CHECK (ins_salary >= 0),
  ins_join     boolean NOT NULL DEFAULT false,
  ins_custom   boolean NOT NULL DEFAULT false,
  ins_rates    jsonb,
  fuel_default bigint NOT NULL DEFAULT 0 CHECK (fuel_default >= 0),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left')),
  left_date    date,
  note         text,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
-- Không trùng mã nhân viên (trong số nhân viên chưa xóa)
CREATE UNIQUE INDEX employees_code_uniq ON employees (code) WHERE deleted_at IS NULL;

CREATE TABLE salary_history (
  employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  from_month  text NOT NULL CHECK (from_month ~ '^[0-9]{4}-[0-9]{2}$'),
  salary      bigint NOT NULL CHECK (salary >= 0),
  ins_salary  bigint NOT NULL DEFAULT 0 CHECK (ins_salary >= 0),
  PRIMARY KEY (employee_id, from_month)
);

CREATE TABLE payroll_periods (
  month         text PRIMARY KEY CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status        text NOT NULL DEFAULT 'none' CHECK (status IN ('none', 'review', 'locked')),
  std_days      numeric,
  locked_at     timestamptz,
  prev_snapshot jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Không trùng bản ghi chấm công của cùng nhân viên trong cùng ngày (khóa chính)
CREATE TABLE attendance (
  employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date   date NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('num', 'P', 'K', 'time')),
  value       numeric(6,4) CHECK (value IS NULL OR (value >= 0 AND value <= 1)),
  time_in     time,
  time_out    time,
  PRIMARY KEY (employee_id, work_date),
  CHECK ((kind = 'num' AND value IS NOT NULL) OR (kind IN ('P', 'K') AND value IS NULL) OR (kind = 'time' AND time_in IS NOT NULL AND time_out IS NOT NULL AND time_out > time_in))
);

CREATE TABLE late_records (
  id          text PRIMARY KEY,
  employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month       text NOT NULL REFERENCES payroll_periods(month),
  work_date   date,
  minutes     integer NOT NULL CHECK (minutes > 0 AND minutes <= 1440 * 31),
  note        text,
  CHECK (work_date IS NULL OR to_char(work_date, 'YYYY-MM') = month)
);
CREATE INDEX late_records_month_idx ON late_records (month);

CREATE TABLE overtime_records (
  id          text PRIMARY KEY,
  employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month       text NOT NULL REFERENCES payroll_periods(month),
  work_date   date NOT NULL,
  minutes     integer NOT NULL CHECK (minutes > 0 AND minutes <= 1440),
  note        text,
  CHECK (to_char(work_date, 'YYYY-MM') = month)
);
CREATE INDEX overtime_records_month_idx ON overtime_records (month);

-- Mỗi phiếu ứng có id duy nhất (gửi lại cùng phiếu không tạo bản ghi trùng) và thuộc đúng một tháng
CREATE TABLE salary_advances (
  id           text PRIMARY KEY,
  employee_id  text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month        text NOT NULL REFERENCES payroll_periods(month),
  advance_date date NOT NULL,
  week         smallint NOT NULL CHECK (week BETWEEN 1 AND 5),
  amount       bigint NOT NULL CHECK (amount > 0),
  note         text,
  CHECK (to_char(advance_date, 'YYYY-MM') = month)
);
CREATE INDEX salary_advances_month_idx ON salary_advances (month);

CREATE TABLE bonuses (
  id          text PRIMARY KEY,
  employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month       text NOT NULL REFERENCES payroll_periods(month),
  type        text,
  name        text NOT NULL,
  amount      bigint NOT NULL CHECK (amount > 0),
  bhxh        boolean NOT NULL DEFAULT false,
  note        text
);
CREATE INDEX bonuses_month_idx ON bonuses (month);

CREATE TABLE deductions (
  id          text PRIMARY KEY,
  employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month       text NOT NULL REFERENCES payroll_periods(month),
  name        text NOT NULL,
  amount      bigint NOT NULL CHECK (amount > 0),
  confirmed   boolean NOT NULL DEFAULT false,
  note        text
);
CREATE INDEX deductions_month_idx ON deductions (month);

CREATE TABLE monthly_allowances (
  employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month       text NOT NULL REFERENCES payroll_periods(month),
  cc_mode     text CHECK (cc_mode IN ('auto', 'grant', 'deny')),
  cc_note     text,
  fuel        bigint CHECK (fuel IS NULL OR fuel >= 0),
  PRIMARY KEY (employee_id, month)
);

-- Bảng lương đã chốt: ảnh chụp cố định từng nhân viên, mỗi nhân viên một dòng/tháng (không tính lương hai lần).
-- Không có khóa ngoại tới employees để lịch sử không đổi khi hồ sơ thay đổi.
CREATE TABLE payroll_snapshots (
  month       text NOT NULL REFERENCES payroll_periods(month) ON DELETE CASCADE,
  employee_id text NOT NULL,
  code        text NOT NULL,
  name        text NOT NULL,
  net         bigint NOT NULL,
  data        jsonb NOT NULL,
  PRIMARY KEY (month, employee_id)
);

CREATE TABLE payroll_events (
  id      bigserial PRIMARY KEY,
  month   text NOT NULL REFERENCES payroll_periods(month) ON DELETE CASCADE,
  at      timestamptz NOT NULL DEFAULT now(),
  action  text NOT NULL,
  note    text,
  net     bigint,
  changes jsonb
);
CREATE INDEX payroll_events_month_idx ON payroll_events (month, at);

CREATE TABLE audit_log (
  id        bigserial PRIMARY KEY,
  at        timestamptz NOT NULL DEFAULT now(),
  action    text NOT NULL,
  entity    text,
  entity_id text,
  summary   text,
  detail    jsonb,
  ip        text
);
CREATE INDEX audit_log_at_idx ON audit_log (at DESC);

/* ============ BẢO VỆ THÁNG ĐÃ CHỐT Ở CẤP CSDL ============ */
-- Mọi thay đổi dữ liệu nguồn của tháng đã chốt bị từ chối, kể cả khi gọi SQL trực tiếp.
-- Chỉ thao tác khôi phục sao lưu (SET LOCAL hrm.restore = 'on') được phép bỏ qua.
CREATE FUNCTION hrm_guard_locked_month() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE months text[] := '{}'; m text;
BEGIN
  IF current_setting('hrm.restore', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_TABLE_NAME = 'attendance' THEN
    IF TG_OP <> 'INSERT' THEN months := months || to_char(OLD.work_date, 'YYYY-MM'); END IF;
    IF TG_OP <> 'DELETE' THEN months := months || to_char(NEW.work_date, 'YYYY-MM'); END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN months := months || OLD.month; END IF;
    IF TG_OP <> 'DELETE' THEN months := months || NEW.month; END IF;
  END IF;
  FOREACH m IN ARRAY months LOOP
    IF EXISTS (SELECT 1 FROM payroll_periods WHERE month = m AND status = 'locked') THEN
      RAISE EXCEPTION 'Tháng % đã chốt lương — không thể thay đổi', m USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER guard_attendance BEFORE INSERT OR UPDATE OR DELETE ON attendance FOR EACH ROW EXECUTE FUNCTION hrm_guard_locked_month();
CREATE TRIGGER guard_late BEFORE INSERT OR UPDATE OR DELETE ON late_records FOR EACH ROW EXECUTE FUNCTION hrm_guard_locked_month();
CREATE TRIGGER guard_ot BEFORE INSERT OR UPDATE OR DELETE ON overtime_records FOR EACH ROW EXECUTE FUNCTION hrm_guard_locked_month();
CREATE TRIGGER guard_adv BEFORE INSERT OR UPDATE OR DELETE ON salary_advances FOR EACH ROW EXECUTE FUNCTION hrm_guard_locked_month();
CREATE TRIGGER guard_bonus BEFORE INSERT OR UPDATE OR DELETE ON bonuses FOR EACH ROW EXECUTE FUNCTION hrm_guard_locked_month();
CREATE TRIGGER guard_ded BEFORE INSERT OR UPDATE OR DELETE ON deductions FOR EACH ROW EXECUTE FUNCTION hrm_guard_locked_month();
CREATE TRIGGER guard_allow BEFORE INSERT OR UPDATE OR DELETE ON monthly_allowances FOR EACH ROW EXECUTE FUNCTION hrm_guard_locked_month();

-- Ảnh chụp bảng lương chỉ được ghi trong thao tác chốt/mở khóa (hoặc khôi phục)
CREATE FUNCTION hrm_guard_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('hrm.snapshot_write', true) = 'on' OR current_setting('hrm.restore', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION 'Bảng lương đã chốt không được sửa trực tiếp' USING ERRCODE = 'P0001';
END $$;
CREATE TRIGGER guard_snapshot BEFORE INSERT OR UPDATE OR DELETE ON payroll_snapshots FOR EACH ROW EXECUTE FUNCTION hrm_guard_snapshot();
