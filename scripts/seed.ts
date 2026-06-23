// Seed CLI - run with: npm run db:seed
// Populates the database through the normal service path so every row gets a `created` audit row
// (and one `updated` row per status step). It never inserts into audit_log directly.
import 'dotenv/config'; // load .env so DATABASE_URL is set before the server-only config is read
import { applicationService } from '@/features/application/services/application';
import { buildSeedApplications, STATUS_JOURNEYS } from './seed-data';

async function seed(): Promise<void> {
  console.log('Seeding job application tracker...');
  const apps = buildSeedApplications();

  for (const input of apps) {
    const created = await applicationService.create(input);
    console.log(`  created: ${created.company} - ${created.role} [${created.id}]`);

    for (const status of STATUS_JOURNEYS[input.company] ?? []) {
      await applicationService.update(created.id, { status });
      console.log(`    -> ${status}`);
    }
  }

  console.log(`\nSeeded ${apps.length} applications with full audit history.`);
  process.exit(0);
}

seed().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
