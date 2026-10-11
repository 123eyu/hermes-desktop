export const MEMORY_PROVIDER_METADATA: Record<
  string,
  { description: string; envVars: string[]; pip?: string }
> = {
  honcho: {
    description: "memory.providers.honcho",
    envVars: ["HONCHO_API_KEY"],
    pip: "honcho-ai",
  },
  hindsight: {
    description: "memory.providers.hindsight",
    envVars: ["HINDSIGHT_API_KEY", "HINDSIGHT_API_URL", "HINDSIGHT_BANK_ID"],
    pip: "hindsight-client",
  },
  mem0: {
    description: "memory.providers.mem0",
    envVars: ["MEM0_API_KEY"],
    pip: "mem0ai",
  },
  retaindb: {
    description: "memory.providers.retaindb",
    envVars: ["RETAINDB_API_KEY"],
  },
  supermemory: {
    description: "memory.providers.supermemory",
    envVars: ["SUPERMEMORY_API_KEY"],
    pip: "supermemory",
  },
  holographic: {
    description: "memory.providers.holographic",
    envVars: [],
  },
  openviking: {
    description: "memory.providers.openviking",
    envVars: ["OPENVIKING_ENDPOINT", "OPENVIKING_API_KEY"],
  },
  byterover: {
    description: "memory.providers.byterover",
    envVars: ["BRV_API_KEY"],
  },
  graphnosis: {
    description: "memory.providers.graphnosis",
    envVars: [],
  },
  recall: {
    description: "memory.providers.recall",
    envVars: [],
  },
  "recall-memory-hermes": {
    description: "memory.providers.recall",
    envVars: [],
  },
};
