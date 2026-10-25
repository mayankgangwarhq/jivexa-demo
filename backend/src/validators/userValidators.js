const { z } = require('zod');

const ageSchema = z.preprocess((val) => {
  if (val === '' || val === null || val === undefined) return undefined;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') return undefined;
    const num = Number(trimmed);
    if (!isNaN(num)) return num;
  }
  return val;
}, z
  .number({ error: 'Age must be a valid number' })
  .min(10, { error: 'Age must be at least 10' })
  .max(120, { error: 'Age must be at most 120' })
  .optional()
);

const signupSchema = z.object({
  name: z
    .string({ error: 'Full name is required' })
    .trim()
    .min(3, { error: 'Name must be at least 3 characters long' })
    .max(80, { error: 'Name must be at most 80 characters long' }),

  age: ageSchema,

  email: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
    z.string({ error: 'Email is required' }).email({ error: 'Invalid email address' })
  ),

  password: z
    .string({ error: 'Password is required' })
    .min(8, { error: 'Password must be at least 8 characters long' })
    .max(64, { error: 'Password must be at most 64 characters long' })
    .regex(/[A-Z]/, { error: 'Password must contain at least one uppercase letter' })
    .regex(/[a-z]/, { error: 'Password must contain at least one lowercase letter' })
    .regex(/[0-9]/, { error: 'Password must contain at least one number' })
    .regex(/[^A-Za-z0-9]/, { error: 'Password must contain at least one special character' }),

  role: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return 'PATIENT';
      if (typeof val === 'string') return val.trim().toUpperCase();
      return val;
    },
    z.enum(['PATIENT', 'DOCTOR', 'PHARMACY', 'AMBULANCE_PARTNER', 'ADMIN'], {
      error: 'Invalid user role specified'
    }).default('PATIENT')
  ).default('PATIENT'),

  phone: z.string().trim().optional(),
  phoneNumber: z.string().trim().optional(),
  healthId: z.string().trim().optional()
});

const loginSchema = z.object({
  email: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
    z.string({ error: 'Email is required' }).email({ error: 'Invalid email address' })
  ),

  password: z
    .string({ error: 'Password is required' })
    .min(1, { error: 'Password cannot be empty' })
});

const updateProfileSchema = z.object({
  name: z
    .string({ error: 'Name must be a valid string' })
    .trim()
    .min(3, { error: 'Name must be at least 3 characters long' })
    .max(80, { error: 'Name must be at most 80 characters long' })
    .optional(),

  age: ageSchema,

  email: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
    z.string({ error: 'Email must be a valid string' }).email({ error: 'Invalid email address' })
  ).optional()
});

module.exports = {
  signupSchema,
  loginSchema,
  updateProfileSchema
};
