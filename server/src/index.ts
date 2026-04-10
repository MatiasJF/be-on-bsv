import { env } from "./env.js";
import { createApp } from "./app.js";

const app = createApp();

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[be-on-bsv] server listening on http://localhost:${env.PORT}  (env=${env.NODE_ENV}, bsv=${env.BSV_ENABLED ? "live" : "stub"})`,
  );
});
