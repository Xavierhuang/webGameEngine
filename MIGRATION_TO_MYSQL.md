# Migration from Supabase to MySQL

This document describes the migration from Supabase (PostgreSQL) to MySQL.

## Changes Made

### 1. Database Layer
- **Replaced**: Supabase PostgreSQL database
- **With**: MySQL database
- **Location**: `lib/mysql/client.ts` and `lib/mysql/server.ts`
- **Schema**: Converted from PostgreSQL to MySQL in `migrations/001_initial_schema.sql`

### 2. Authentication System
- **Replaced**: Supabase Auth
- **With**: Custom JWT-based authentication
- **Location**: 
  - `lib/auth/jwt.ts` - JWT token generation and verification
  - `lib/auth/password.ts` - Password hashing with bcrypt
  - `app/api/auth/login/route.ts` - Login endpoint
  - `app/api/auth/signup/route.ts` - Signup endpoint
  - `app/api/auth/logout/route.ts` - Logout endpoint

### 3. Realtime Collaboration
- **Replaced**: Supabase Realtime
- **With**: WebSocket-based collaboration
- **Location**: `lib/realtime/collaboration.ts`
- **Note**: Requires a WebSocket server (not included in this migration)

### 4. API Routes
All API routes have been updated to use MySQL:
- `app/api/projects/route.ts`
- `app/api/projects/[id]/route.ts`
- `app/api/ai/chat/route.ts`

### 5. Pages
All pages have been updated to use the new authentication:
- `app/auth/login/page.tsx`
- `app/auth/signup/page.tsx`
- `app/auth/forgot-password/page.tsx`
- `app/projects/page.tsx`
- `app/projects/new/page.tsx`
- `app/editor/[id]/page.tsx`

### 6. Dependencies
**Removed**:
- `@supabase/supabase-js`
- `@supabase/auth-helpers-nextjs`
- `@supabase/auth-ui-react`
- `@supabase/auth-ui-shared`
- `supabase` (CLI)

**Added**:
- `mysql2` - MySQL client
- `bcryptjs` - Password hashing
- `jsonwebtoken` - JWT tokens
- `@types/bcryptjs` - TypeScript types
- `@types/jsonwebtoken` - TypeScript types

## Environment Variables

Create a `.env` file with the following variables:

```env
# MySQL Database Configuration
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=gameengine

# JWT Secret (generate a random string for production)
JWT_SECRET=your-secret-key-change-this-in-production
JWT_EXPIRES_IN=7d

# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# WebSocket URL (for collaboration)
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

## Database Setup

1. Install MySQL (if not already installed)
2. Create the database:
   ```bash
   mysql -u root -p < migrations/001_initial_schema.sql
   ```
   Or manually:
   ```sql
   CREATE DATABASE gameengine;
   USE gameengine;
   -- Then run the SQL from migrations/001_initial_schema.sql
   ```

## Key Differences

### UUID Generation
- **PostgreSQL**: Used `gen_random_uuid()` function
- **MySQL**: Uses `UUID()` function or application-generated UUIDs (via `crypto.randomUUID()`)

### JSON Support
- **PostgreSQL**: Used `JSONB` type
- **MySQL**: Uses `JSON` type (similar functionality)

### Row-Level Security
- **PostgreSQL**: Had RLS policies
- **MySQL**: Security is handled at the application level through authentication checks

### Authentication
- **Supabase**: Managed authentication with email/password, OAuth, etc.
- **Custom**: JWT-based authentication with email/password only (can be extended)

## Migration Notes

1. **User IDs**: The system now uses separate `users` and `profiles` tables. The `users` table stores authentication info, while `profiles` stores user profile data.

2. **Profile Creation**: A database trigger automatically creates a profile when a user is created.

3. **Realtime**: The WebSocket implementation requires a separate WebSocket server. For now, the collaboration feature will work in a degraded mode if the WebSocket server is not available.

4. **Password Reset**: The password reset functionality is not yet implemented. It's marked as TODO in the forgot-password page.

## Next Steps

1. Install dependencies: `npm install`
2. Set up MySQL database
3. Run migrations
4. Configure environment variables
5. (Optional) Set up WebSocket server for realtime collaboration
6. Test the application

## Breaking Changes

- All Supabase-specific features are removed
- Authentication flow has changed (now uses JWT cookies)
- Database queries use raw SQL instead of Supabase's query builder
- Realtime features require a separate WebSocket server

