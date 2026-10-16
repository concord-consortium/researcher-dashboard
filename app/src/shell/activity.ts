import type { Stamp } from "./runs";

// REPORT-153's document; `writeCount` and `changed` are not read here.
export interface Activity { lastActivityAt?: Stamp }
