// Disposable local relay for compose.validation.yaml. Never forwards messages.
import { SMTPServer } from "smtp-server";
const server = new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS"],
  onData(stream, _session, callback) {
    stream.on("data", () => {});
    stream.on("end", () => callback());
  },
});
server.listen(1025, "0.0.0.0");
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
