import type {
  DataCatalogRepository,
  DatasetCatalogRecord,
  DatasetIdentity,
  IngestionRunRecord
} from "@fantasyfb/contracts";

export type DatasetHealth = Pick<
  DatasetCatalogRecord,
  | "datasetId"
  | "validationStatus"
  | "freshnessStatus"
  | "importStatus"
  | "errorStatus"
  | "lastKnownSuccessfulUpdate"
>;

/**
 * The sole application-facing index for external datasets and ingestion health.
 * It deliberately stores no provider response shape: callers receive normalized
 * provenance and health only.
 */
export class DataCatalog {
  constructor(private readonly repository: DataCatalogRepository) {}

  async register(record: DatasetCatalogRecord): Promise<DatasetCatalogRecord> {
    assertDatasetRecord(record);
    const previous = await this.repository.findLastValid(identityOf(record));
    const lastKnownSuccessfulUpdate =
      record.validationStatus === "valid" && record.importStatus === "completed"
        ? record.retrievedAt
        : previous?.lastKnownSuccessfulUpdate;
    const withLastSuccess: DatasetCatalogRecord = lastKnownSuccessfulUpdate
      ? { ...record, lastKnownSuccessfulUpdate }
      : record;
    return this.repository.upsertDataset(withLastSuccess);
  }

  async lastValidDataset(identity: DatasetIdentity): Promise<DatasetCatalogRecord | undefined> {
    return this.repository.findLastValid(identity);
  }

  async recordRun(run: IngestionRunRecord): Promise<void> {
    if (run.completedAt < run.startedAt) {
      throw new Error("An ingestion run cannot finish before it starts.");
    }
    await this.repository.recordIngestionRun(run);
  }

  async health(identity: DatasetIdentity): Promise<DatasetHealth | undefined> {
    const dataset = await this.repository.findLastValid(identity);
    if (!dataset) return undefined;
    const {
      datasetId,
      validationStatus,
      freshnessStatus,
      importStatus,
      errorStatus,
      lastKnownSuccessfulUpdate
    } = dataset;
    const health: DatasetHealth = {
      datasetId,
      validationStatus,
      freshnessStatus,
      importStatus
    };
    return {
      ...health,
      ...(errorStatus ? { errorStatus } : {}),
      ...(lastKnownSuccessfulUpdate ? { lastKnownSuccessfulUpdate } : {})
    };
  }
}

function identityOf(record: DatasetCatalogRecord): DatasetIdentity {
  return {
    source: record.source,
    sourceIdentifier: record.sourceIdentifier,
    ...(record.season !== undefined ? { season: record.season } : {}),
    ...(record.week !== undefined ? { week: record.week } : {})
  };
}

function assertDatasetRecord(record: DatasetCatalogRecord): void {
  if (!record.datasetId || !record.source || !record.sourceIdentifier || !record.datasetVersion) {
    throw new Error("Dataset ID, source, source identifier, and version are required.");
  }
  if (record.recordCount < 0 || !Number.isInteger(record.recordCount)) {
    throw new Error("Dataset record count must be a non-negative integer.");
  }
  if (record.validationStatus === "valid" && record.importStatus !== "completed") {
    throw new Error("A valid dataset must have completed ingestion.");
  }
}
export function createDataCatalog(repository: DataCatalogRepository): DataCatalog {
  return new DataCatalog(repository);
}
