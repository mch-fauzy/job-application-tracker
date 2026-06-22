// Load .env into process.env so the config singleton and DB-backed tests
// can read DATABASE_URL (Vitest does not load .env on its own).
import 'dotenv/config';
import '@testing-library/jest-dom/vitest';
