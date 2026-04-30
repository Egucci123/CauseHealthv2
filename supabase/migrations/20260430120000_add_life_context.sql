-- Adds life_context jsonb column to profiles. Holds working-class lifestyle
-- onboarding answers (work type, schedule, kids, cooking time, food budget,
-- insurance, PCP) so the AI can tailor wellness plans / doctor prep to the
-- user's actual life — no fast-food-free assumptions, no 90-minute meal preps,
-- no "see your doctor" advice for someone without insurance.
--
-- Stored as a single jsonb so the schema stays flexible as we add more
-- lifestyle context dimensions over time.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS life_context JSONB;

COMMENT ON COLUMN public.profiles.life_context IS
  'Universal lifestyle context: workType, workSchedule, hoursWorkedPerWeek, kidsAtHome, livingSituation, cookHomeFrequency, cookingTimeAvailable, typicalLunch, weeklyFoodBudget, eatOutPlaces, insuranceType, hasPCP, lastPhysical. Consumed by generate-wellness-plan and generate-doctor-prep for tailoring without hardcoding disease-specific logic.';
