import { defineEnv, string } from 'void/env';

export default defineEnv({
  TYPESAFE_API_KEY: string().optional(),
});
