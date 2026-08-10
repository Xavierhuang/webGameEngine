-- Fix the profile trigger to handle errors gracefully
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role_value user_role;
  username_value TEXT;
BEGIN
  -- Determine role based on metadata
  IF COALESCE((NEW.raw_user_meta_data->>'is_parent')::boolean, false) THEN
    user_role_value := 'parent';
  ELSE
    user_role_value := 'child';
  END IF;

  -- Get username from metadata or generate one
  username_value := COALESCE(
    NEW.raw_user_meta_data->>'username',
    'user_' || substr(NEW.id::text, 1, 8)
  );

  -- Insert profile with error handling
  -- Skip profile creation if it fails (don't block user creation)
  BEGIN
    INSERT INTO public.profiles (id, role, username, display_name, parental_approval, parent_id)
    VALUES (
      NEW.id,
      user_role_value,
      username_value,
      username_value,
      (user_role_value = 'parent')::boolean, -- Parents auto-approve themselves
      CASE WHEN user_role_value = 'child' THEN NULL ELSE NULL END -- No parent for now
    )
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username,
      display_name = EXCLUDED.display_name;
  EXCEPTION
    WHEN OTHERS THEN
      -- Log error but don't fail user creation
      -- Profile can be created later manually if needed
      RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
      -- Return NEW anyway so user creation succeeds
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

