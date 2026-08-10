-- Function to automatically create a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role_value user_role;
BEGIN
  -- Determine role based on metadata
  IF COALESCE((NEW.raw_user_meta_data->>'is_parent')::boolean, false) THEN
    user_role_value := 'parent';
  ELSE
    user_role_value := 'child';
  END IF;

  INSERT INTO public.profiles (id, role, username, display_name, parental_approval)
  VALUES (
    NEW.id,
    user_role_value,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    user_role_value = 'parent' -- Parents auto-approve themselves
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function when a new user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

