#!/bin/bash

# Database setup script for MySQL
# Usage: ./scripts/setup-db.sh

set -e

echo "Setting up MySQL database for Game Engine..."

# Check if MySQL is available
if ! command -v mysql &> /dev/null; then
    if [ -f "/usr/local/bin/mysql" ]; then
        MYSQL_CMD="/usr/local/bin/mysql"
    else
        echo "Error: MySQL not found. Please install MySQL first."
        echo "You can install it with: brew install mysql"
        exit 1
    fi
else
    MYSQL_CMD="mysql"
fi

# Get database credentials from environment or prompt
MYSQL_HOST=${MYSQL_HOST:-localhost}
MYSQL_PORT=${MYSQL_PORT:-3306}
MYSQL_USER=${MYSQL_USER:-root}
MYSQL_DATABASE=${MYSQL_DATABASE:-gameengine}

echo "Database configuration:"
echo "  Host: $MYSQL_HOST"
echo "  Port: $MYSQL_PORT"
echo "  User: $MYSQL_USER"
echo "  Database: $MYSQL_DATABASE"
echo ""

# Resolve credentials once, up front. The old script prompted for a password
# inside a fallback for a single hardcoded migration file, which is why 002 was
# never applied — it simply wasn't referenced anywhere.
if [ -z "$MYSQL_PASSWORD" ]; then
    if ! $MYSQL_CMD -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -e "SELECT 1" >/dev/null 2>&1; then
        read -sp "Enter MySQL password for $MYSQL_USER (or press Enter if no password): " MYSQL_PASSWORD
        echo ""
    fi
fi

# Create the database before applying anything to it. Migration 001 used to do
# this with `CREATE DATABASE IF NOT EXISTS gameengine`, which is exactly the
# hardcoding `run_sql` now strips — so first-time setup has to create it here,
# under the name the operator actually asked for.
if [ -z "$MYSQL_PASSWORD" ]; then
    $MYSQL_CMD -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" \
        -e "CREATE DATABASE IF NOT EXISTS \`$MYSQL_DATABASE\`"
else
    $MYSQL_CMD -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" \
        -e "CREATE DATABASE IF NOT EXISTS \`$MYSQL_DATABASE\`"
fi

# Applies one migration to $MYSQL_DATABASE.
#
# This used to pipe the file in with no database selected at all, relying on the
# `USE gameengine;` that 14 of the 15 migrations carry. That meant `MYSQL_DATABASE`
# was printed in the banner above and then ignored: pointing this script at
# `gameengine_test` set up `gameengine` instead, silently. Strip the selection
# and name the database explicitly, so the two agree.
# `test/database/migration-database-selection.test.js` keeps every runner honest.
run_sql() {
    local stripped
    stripped=$(sed -E '/^[[:space:]]*USE[[:space:]]/d; /^[[:space:]]*CREATE DATABASE[[:space:]]/d' "$1")
    if [ -z "$MYSQL_PASSWORD" ]; then
        printf '%s\n' "$stripped" | $MYSQL_CMD -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" "$MYSQL_DATABASE"
    else
        printf '%s\n' "$stripped" | $MYSQL_CMD -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"
    fi
}

# Apply every migration in lexical order. Migrations are written to be
# re-runnable (IF NOT EXISTS / information_schema guards), so this is safe to
# run repeatedly.
echo "Running database migrations..."
shopt -s nullglob
migrations=(migrations/*.sql)
if [ ${#migrations[@]} -eq 0 ]; then
    echo "❌ No migration files found in migrations/."
    exit 1
fi

for migration in "${migrations[@]}"; do
    echo "  → $(basename "$migration")"
    if ! run_sql "$migration"; then
        echo "❌ Migration failed: $migration"
        exit 1
    fi
done

if [ $? -eq 0 ]; then
    echo "✅ Database setup completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Make sure your .env file has the correct MySQL credentials"
    echo "2. Run 'npm install' to install dependencies"
    echo "3. Run 'npm run dev' to start the development server"
else
    echo "❌ Database setup failed. Please check your MySQL credentials and try again."
    exit 1
fi

