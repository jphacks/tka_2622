# Supabase Auth and private inventory setup

This application uses cookie-based Supabase Auth sessions and owner-scoped RLS for user profiles, inventory items, handling plans, and private item images.

## Environment

Configure these variables in the local environment and the deployment environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `DASHSCOPE_API_KEY` for Qwen item analysis

The inventory/Auth routes use the publishable key with the signed-in user's cookie session. They do not use the service-role key. Keep any existing `SUPABASE_SERVICE_ROLE_KEY` server-only; never prefix it with `NEXT_PUBLIC_`.

## One-time Supabase setup

1. Review `supabase/migrations/20261017100000_create_private_user_inventory.sql` together with the existing migrations. It adds `user_profiles`, `user_items`, `handling_plans`, owner-only RLS policies, a plan-save function, and a private `item-images` bucket. It does not alter the public station or merchant tables.
2. Apply the migration in the Supabase project only after the project owner explicitly approves the remote database change. This repository work has not applied it remotely.
3. In Supabase Dashboard, open **Authentication → Providers → Email** and disable **Allow new users to sign up**. The application intentionally has no public registration screen.
4. Create accounts administratively in **Authentication → Users → Add user**. Share credentials using a secure channel and require a password change if that option is available in the project.
5. Keep the `item-images` bucket private. The migration stops if a bucket with that name already exists as public.

Once the migration is applied and an administrator has created a user, that user can sign in at `/login`, complete residence/station onboarding, and use the private inventory workflow.

## Data and session boundaries

- `proxy.ts` refreshes cookie sessions and provides optimistic redirects. Protected pages and each user-specific API also verify the user with `auth.getUser()`.
- RLS remains the database authorization boundary; all inventory queries include the authenticated owner identifier as an additional guard.
- Uploaded object paths are generated from the authenticated user ID and random UUIDs. Original filenames are not used.
- Do not expose access tokens, the service-role key, or private image URLs in logs or public source control.
