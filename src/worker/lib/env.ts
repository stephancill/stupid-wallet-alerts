/** Env/bindings for the stupid wallet alerts Worker. */
export interface Env {
  WA_DB: D1Database;
  EMAIL: SendEmail;
  WA_API_KEY: string;
  WA_WEBHOOK_ID: string;
  WA_SIGNING_SECRET: string;
  APP_BASE_URL: string;
  EMAIL_FROM: string;
}
