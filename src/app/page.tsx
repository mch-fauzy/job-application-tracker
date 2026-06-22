export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold">Job Application Tracker</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Track every application through its pipeline with a full, immutable history of each change.
      </p>
    </main>
  );
}
