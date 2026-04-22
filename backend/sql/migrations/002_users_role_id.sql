-- Links users to roles table for RBAC (idempotent for existing DBs).
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id);

UPDATE users u
SET role_id = (SELECT id FROM roles WHERE role_key = 'manager' LIMIT 1)
WHERE u.role_id IS NULL;

UPDATE users u
SET role_id = r.id
FROM roles r
WHERE u.email = 'admin@drivee.demo' AND r.role_key = 'admin';

UPDATE users u
SET role_id = r.id
FROM roles r
WHERE u.email = 'manager@drivee.demo' AND r.role_key = 'manager';

UPDATE users u
SET role_id = r.id
FROM roles r
WHERE u.email = 'marketer@drivee.demo' AND r.role_key = 'marketer';

UPDATE users u
SET role_id = r.id
FROM roles r
WHERE u.email = 'executive@drivee.demo' AND r.role_key = 'executive';

ALTER TABLE users ALTER COLUMN role_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
