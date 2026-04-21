-- Ajout de la valeur MANAGER à l'enum UserRole
--
-- Contexte :
--   MANAGER (niveau 50) se positionne entre DIRECTION (60) et REVIEWER (40).
--   Utilisé pour : encadrants intermédiaires, owners d'espaces ticketing,
--   publication de runbooks, validation 1er niveau. Harmonisation de la
--   hiérarchie RBAC entre backend (apps/backend/src/common/enums.ts) et
--   shared (packages/shared/src/constants.ts) qui divergeaient avant.
--
-- IMPORTANT : ALTER TYPE ADD VALUE ne peut PAS être dans une transaction
-- (limitation PostgreSQL < 12, et même en 12+ le support transactionnel
-- dépend du context). On ne met donc PAS de BEGIN/COMMIT autour.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MANAGER';
