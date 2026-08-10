-- Fix the age constraint - make it nullable or remove it
-- Age can be set later, not required at signup
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS valid_age;

-- New constraint: Age is optional, but if provided must be valid
ALTER TABLE public.profiles
ADD CONSTRAINT valid_age CHECK (
  age IS NULL OR (age >= 4 AND age <= 18)
);



