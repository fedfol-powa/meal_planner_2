// Loaded with NODE_OPTIONS=--import by local-database.test.ts: records every outgoing TCP connection and
// DNS lookup of the process (and of its Vitest workers) in PROBE_FILE. Empty file: nothing was reached.
import { appendFileSync } from 'node:fs';
import dns from 'node:dns';
import net from 'node:net';

const file = process.env.PROBE_FILE;
const record = (what) => file && appendFileSync(file, `${what}\n`);
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
	const first = args[0];
	const options = Array.isArray(first) ? first[0] : first;
	if (options && typeof options === 'object' && options.port !== undefined) record(`connect ${options.host ?? ''}:${options.port}`);
	else if (typeof first === 'number') record(`connect ${args[1] ?? ''}:${first}`);
	return connect.apply(this, args);
};
const lookup = dns.lookup;
dns.lookup = function (host, ...rest) {
	record(`lookup ${host}`);
	return lookup.call(this, host, ...rest);
};
