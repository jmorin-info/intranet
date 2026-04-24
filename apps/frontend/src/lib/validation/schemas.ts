/**
 * Schémas Zod réutilisables pour les formulaires de l'intranet.
 *
 * Contient :
 *  - les règles ANSSI / ISO 27001 A.5.17 pour les mots de passe
 *    (alignées sur AuthService.resetPasswordWithToken côté backend)
 *  - des helpers email / TOTP / champs courts
 *  - des schemas composés réutilisés par plusieurs pages
 *
 * Convention : chaque schema porte un type dérivé `z.infer` exporté.
 */
import { z } from 'zod';

// --- Règles ANSSI mot de passe (12+ caractères, 1 maj, 1 min, 1 chiffre, 1 spécial) -----
const SPECIAL_CHARS_RE = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/;

export const passwordSchema = z
  .string()
  .min(12, 'Minimum 12 caractères')
  .regex(/[A-Z]/, 'Au moins une majuscule')
  .regex(/[a-z]/, 'Au moins une minuscule')
  .regex(/[0-9]/, 'Au moins un chiffre')
  .regex(SPECIAL_CHARS_RE, 'Au moins un caractère spécial');

export const emailSchema = z
  .string()
  .min(1, 'Email requis')
  .email('Adresse email invalide');

// Code TOTP MFA — 6 chiffres
export const totpSchema = z
  .string()
  .regex(/^\d{6}$/, 'Le code doit contenir 6 chiffres');

// --- (auth) login ----------------------------------------------------------
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Mot de passe requis'),
  mfaCode: z
    .string()
    .regex(/^\d{6}$/, 'Le code doit contenir 6 chiffres')
    .optional()
    .or(z.literal('')),
});
export type LoginFormData = z.infer<typeof loginSchema>;

// --- (auth) forgot-password -----------------------------------------------
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

// --- (auth) reset-password ------------------------------------------------
export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirmation requise'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

// --- (app) mfa setup ------------------------------------------------------
export const mfaCodeSchema = z.object({
  code: totpSchema,
});
export type MfaCodeFormData = z.infer<typeof mfaCodeSchema>;

// --- (app) profile : change password --------------------------------------
export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, 'Mot de passe actuel requis'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirmation requise'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })
  .refine((d) => d.newPassword !== d.oldPassword, {
    message: 'Le nouveau mot de passe doit être différent de l’ancien',
    path: ['newPassword'],
  });
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

// --- (app) news compose ---------------------------------------------------
export const newsComposeSchema = z.object({
  title: z.string().min(3, 'Titre requis (min. 3 caractères)').max(200, '200 caractères max'),
  content: z.string().min(10, 'Contenu requis (min. 10 caractères)'),
  category: z.string().min(1, 'Catégorie requise'),
});
export type NewsComposeFormData = z.infer<typeof newsComposeSchema>;

// --- (app) tickets : création ticket --------------------------------------
export const ticketCreateSchema = z.object({
  title: z.string().min(3, 'Titre requis (min. 3 caractères)').max(200, '200 caractères max'),
  description: z.string().min(10, 'Description requise (min. 10 caractères)'),
  category: z.string().min(1, 'Catégorie requise'),
  priority: z.enum(['low', 'medium', 'high', 'critical'], {
    errorMap: () => ({ message: 'Priorité invalide' }),
  }),
});
export type TicketCreateFormData = z.infer<typeof ticketCreateSchema>;

// --- (app) documents/new --------------------------------------------------
export const documentNewSchema = z.object({
  title: z.string().min(3, 'Titre requis (min. 3 caractères)'),
  reference: z.string().min(1, 'Référence requise'),
  category: z.string().min(1, 'Catégorie requise'),
  classification: z.enum(['public', 'internal', 'confidential', 'restricted'], {
    errorMap: () => ({ message: 'Classification invalide' }),
  }),
});
export type DocumentNewFormData = z.infer<typeof documentNewSchema>;

// --- (app) admin/users : modal création -----------------------------------
export const adminUserCreateSchema = z.object({
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  email: emailSchema,
  password: passwordSchema,
  role: z.string().min(1, 'Rôle requis'),
});
export type AdminUserCreateFormData = z.infer<typeof adminUserCreateSchema>;

// --- (app) admin/departments ----------------------------------------------
export const departmentCreateSchema = z.object({
  name: z.string().min(2, 'Nom requis (min. 2 caractères)'),
  code: z
    .string()
    .min(2, 'Code requis (min. 2 caractères)')
    .max(10, '10 caractères max')
    .regex(/^[A-Z0-9_-]+$/, 'Le code doit être en MAJUSCULES (lettres, chiffres, _ ou -)'),
});
export type DepartmentCreateFormData = z.infer<typeof departmentCreateSchema>;

// --- (app) admin/config : bannière ---------------------------------------
export const bannerCreateSchema = z.object({
  title: z.string().min(2, 'Titre requis').max(120, '120 caractères max'),
  message: z.string().min(2, 'Message requis').max(500, '500 caractères max'),
  level: z.enum(['info', 'warning', 'critical'], {
    errorMap: () => ({ message: 'Niveau invalide' }),
  }),
  linkUrl: z
    .string()
    .url('URL invalide')
    .optional()
    .or(z.literal('')),
});
export type BannerCreateFormData = z.infer<typeof bannerCreateSchema>;

// --- (app) satisfaction --------------------------------------------------
export const satisfactionSchema = z.object({
  rating: z
    .number({ invalid_type_error: 'Note requise' })
    .int('Note invalide')
    .min(1, 'Note minimum : 1')
    .max(5, 'Note maximum : 5'),
  comment: z.string().max(2000, '2000 caractères max').optional().or(z.literal('')),
});
export type SatisfactionFormData = z.infer<typeof satisfactionSchema>;

// --- (app) admin/access-reviews : campagne -------------------------------
export const accessReviewCreateSchema = z.object({
  name: z.string().min(3, 'Nom requis (min. 3 caractères)').max(200),
  dueDate: z
    .string()
    .min(1, 'Date d’échéance requise')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Date invalide')
    .refine((v) => Date.parse(v) > Date.now(), 'La date doit être dans le futur'),
  scope: z.string().min(1, 'Périmètre requis'),
});
export type AccessReviewCreateFormData = z.infer<typeof accessReviewCreateSchema>;

// --- (app) admin/external-access -----------------------------------------
export const externalAccessCreateSchema = z.object({
  email: emailSchema,
  scope: z.string().min(1, 'Périmètre requis'),
  expiresAt: z
    .string()
    .min(1, 'Date d’expiration requise')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Date invalide')
    .refine((v) => Date.parse(v) > Date.now(), 'La date doit être dans le futur'),
});
export type ExternalAccessCreateFormData = z.infer<typeof externalAccessCreateSchema>;
