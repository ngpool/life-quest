dakaimport { defineEnv, string } from 'void/env';

// Scaffolded from your .env files. Inference is conservative — review each
// entry and tighten types as needed (e.g. oneOf([...]), url(), .optional(),
// .default(value), or a Standard Schema validator from valibot/zod/arktype).
export default defineEnv({
  TYPESAFE_API_KEY: string().optional(),
});
