import { and, eq } from "drizzle-orm";
import { createDatabase } from "../src/index.js";
import { dataSources, datasetVersions, nflTeams, players } from "../src/schema.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log("DATABASE_URL is not set; skipping fixture seed.");
  process.exit(0);
}

const database = createDatabase(databaseUrl);
const [team] = await database
  .insert(nflTeams)
  .values({ name: "Sample City Samplebirds", abbreviation: "SMP" })
  .onConflictDoUpdate({ target: nflTeams.abbreviation, set: { name: "Sample City Samplebirds" } })
  .returning();
if (!team) throw new Error("Fixture team was not returned.");

const existingPlayer = await database
  .select({ id: players.id })
  .from(players)
  .where(and(eq(players.fullName, "Sample Player"), eq(players.teamId, team.id)))
  .limit(1);
if (existingPlayer.length === 0) {
  await database
    .insert(players)
    .values({ fullName: "Sample Player", position: "WR", teamId: team.id });
}

const [source] = await database
  .insert(dataSources)
  .values({
    name: "FantasyFB fixture data",
    sourceIdentifier: "development-fixture",
    licenseOrUsageNote: "Clearly labeled development fixture only; not production football data."
  })
  .onConflictDoUpdate({
    target: [dataSources.name, dataSources.sourceIdentifier],
    set: {
      licenseOrUsageNote: "Clearly labeled development fixture only; not production football data."
    }
  })
  .returning();
if (!source) throw new Error("Fixture data source was not returned.");

const existingDataset = await database
  .select({ id: datasetVersions.id })
  .from(datasetVersions)
  .where(
    and(eq(datasetVersions.dataSourceId, source.id), eq(datasetVersions.version, "development-v1"))
  )
  .limit(1);
if (existingDataset.length === 0) {
  await database.insert(datasetVersions).values({
    dataSourceId: source.id,
    visibility: "sample",
    version: "development-v1",
    retrievedAt: new Date(),
    validationStatus: "valid",
    freshnessStatus: "valid",
    recordCount: 1,
    licenseOrUsageNote: "Clearly labeled development fixture only; not production football data."
  });
}

console.log("Seeded sample-only fixture records. No private league or licensed data was created.");
