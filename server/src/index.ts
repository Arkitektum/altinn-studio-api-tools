import { createApp } from "./app.js";
import { config } from "./config.js";

createApp().listen(config.port, config.host, () => {
    console.log(`altinn-studio-api-tools api  →  http://localhost:${config.port}/api`);
    console.log(`  apps      ${config.appHost}/{org}/{app}`);
    console.log(`  localtest ${config.localtestUrl}`);
    // Worth saying out loud, since it is the one setting that decides who else can use the tokens
    // this process is holding.
    console.log(`  bound to  ${config.host}${config.host === "127.0.0.1" ? " (this machine only)" : " (reachable from the network)"}`);
});
