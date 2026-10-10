import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readExecutionProfile } from "./execution-profile.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build"].includes(command)) throw new Error("Expected dev or build.");
const managedLinux = readExecutionProfile() === "managed-linux";

if (managedLinux && command === "build") {
  const result = spawnSync("bash", [
    fileURLToPath(new URL("./build-verified.sh", import.meta.url)), ...args,
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

// Import in this process so the preview owner retains its PID and signals.
const cli = new URL(managedLinux
  ? "../node_modules/vite/bin/vite.js"
  : "../node_modules/vinext/dist/cli.js", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command,
  ...(!managedLinux && command === "dev" ? ["--port", "5173", "--strictPort"] : []), ...args];
if(!managedLinux&&command==="dev"){
 const {startLocalWatchRunner}=await import("./local-watch-runner.mjs");
 const portIndex=args.findIndex(arg=>arg==="--port"||arg==="-p");const port=portIndex>=0?args[portIndex+1]:(args.find(arg=>arg.startsWith("--port="))?.slice(7)||"5173");
 const stop=startLocalWatchRunner("http://127.0.0.1:"+port);
 process.once("exit",stop);
}
await import(cli.href);
