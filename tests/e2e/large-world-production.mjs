// The production entry must ignore both experimental environment overrides.
process.env.PORT='3010';process.env.HOST='127.0.0.1';
process.env.MAP_EXPERIMENT_RADIUS='56';process.env.MAP_EXPERIMENT_SLOTS='16';
await import('../../dist/server/server/index.js');
