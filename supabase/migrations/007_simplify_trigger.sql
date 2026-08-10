-- Simplify the trigger to avoid blocking user creation
-- If profile creation fails, user creation should still succeed
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Try to create profile, but don't fail if it doesn't work
  -- User creation is more important than profile creation
  BEGIN
    INSERT INTO public.profiles (id, role, username, display_name, parental_approval)
    VALUES (
      NEW.id,
      COALESCE(
        CASE WHEN (NEW.raw_user_meta_data->>'is_parent')::boolean THEN 'parent'::user_role ELSE 'child'::user_role END,
        'child'::user_role
      ),
      COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
      COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
      COALESCE((NEW.raw_user_meta_data->>'is_parent')::boolean, false)
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      -- Silently fail - don't block user creation
      NULL;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



