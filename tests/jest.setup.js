// Stub required environment variables so config/env.js validation passes in tests.
// Real secrets are never needed for unit tests — only presence/format is validated.
process.env.NODE_ENV            = "test";
process.env.MONGODB_URI         = "mongodb://localhost:27017/test";
process.env.JWT_ACCESS_SECRET   = "test_access_secret_at_least_32_chars_xxxx";
process.env.JWT_REFRESH_SECRET  = "test_refresh_secret_at_least_32_chars_xxx";
process.env.BCRYPT_PEPPER       = "test_pepper_at_least_32_chars_long_xxxx";
process.env.CORS_ORIGIN         = "http://localhost:19006";
process.env.EMAIL_USER          = "test@example.com";
process.env.EMAIL_PASS          = "test_email_password";
