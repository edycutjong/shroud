-- Deterministic Seed Dataset for Shroud
-- Includes 4 approved compliant users and 1 revoked user for test scenarios

INSERT INTO public.shroud_asp_users (user_address, kyc_status, merkle_index)
VALUES 
  ('GD111111111111111111111111111111111111111111111111111111', 'approved', 0),
  ('GD222222222222222222222222222222222222222222222222222222', 'approved', 1),
  ('GD333333333333333333333333333333333333333333333333333333', 'approved', 2),
  ('GD444444444444444444444444444444444444444444444444444444', 'approved', 3),
  ('GD555555555555555555555555555555555555555555555555555555', 'revoked', NULL)
ON CONFLICT (user_address) DO UPDATE 
SET kyc_status = EXCLUDED.kyc_status,
    merkle_index = EXCLUDED.merkle_index;
