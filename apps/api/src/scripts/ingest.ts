import { closePool } from '../db/pool';
import { runIngestion } from '../ingestion/run';

runIngestion()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
