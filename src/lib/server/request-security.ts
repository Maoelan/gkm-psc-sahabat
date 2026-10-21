export const MAX_REQUEST_BYTES = 128 * 1024;

export function requestOriginAllowed(request: Request) {
	if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
	const origin = request.headers.get('origin');
	return !origin || origin === new URL(request.url).origin;
}

export class RequestBodyError extends Error {
	constructor(public status: number, message: string) { super(message); }
}

export async function boundedRequest(request: Request): Promise<Request> {
	const contentLength = Number(request.headers.get('content-length'));
	if (contentLength > MAX_REQUEST_BYTES) throw new RequestBodyError(413, 'Permintaan terlalu besar.');
	if (!request.body) return request;
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reject(new RequestBodyError(408, 'Pengiriman permintaan terlalu lama.'));
			void reader.cancel().catch(() => {});
		}, 10_000);
	});
	try {
		while (true) {
			const { done, value } = await Promise.race([reader.read(), deadline]);
			if (done) break;
			total += value.byteLength;
			if (total > MAX_REQUEST_BYTES) {
				void reader.cancel().catch(() => {});
				throw new RequestBodyError(413, 'Permintaan terlalu besar.');
			}
			chunks.push(value);
		}
		const body = new Uint8Array(total);
		let offset = 0;
		for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
		return new Request(request, { body });
	} finally {
		clearTimeout(timer);
		reader.releaseLock();
	}
}
