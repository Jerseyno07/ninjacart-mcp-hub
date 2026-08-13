// Structured console.log wrapper — Railway captures stdout as the log stream.
export function log(event, fields = {}) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...fields }));
}
