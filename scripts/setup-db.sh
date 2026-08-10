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

# Run the migration (with or without password)
echo "Running database migration..."
if [ -z "$MYSQL_PASSWORD" ]; then
    # Try without password first (common for local dev)
    $MYSQL_CMD -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" < migrations/001_initial_schema.sql 2>/dev/null || {
        # If that fails, prompt for password
        read -sp "Enter MySQL password for $MYSQL_USER (or press Enter if no password): " MYSQL_PASSWORD
        echo ""
        if [ -z "$MYSQL_PASSWORD" ]; then
            $MYSQL_CMD -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" < migrations/001_initial_schema.sql
        else
            $MYSQL_CMD -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" < migrations/001_initial_schema.sql
        fi
    }
else
    $MYSQL_CMD -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" < migrations/001_initial_schema.sql
fi

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

