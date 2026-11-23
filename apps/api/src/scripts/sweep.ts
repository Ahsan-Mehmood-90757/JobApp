import { closePool } from '../db/pool';
import { runSweep } from '../ingestion/sweep';

runSweep()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
