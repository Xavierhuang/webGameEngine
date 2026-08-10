-- Fix the constraint to allow children without parents initially
-- They can be assigned a parent later
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS child_has_parent;

-- Remove the constraint entirely - we'll handle parent assignment in the app
-- Children can be created without parents and assigned later

