import { LIMITS } from '@/lib/good/schema';
import { RestoreRejected, restoreNative } from '@/lib/player/export';

/**
 * Restores a native backup, replacing everything.
 *
 * A Route Handler for the same reason the GOOD upload is one: a real backup is
 * megabytes and Server Action bodies stop at one.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');

  if (!(file instanceof File)) {
    return Response.json({ error: 'no file' }, { status: 400 });
  }
  if (file.size > LIMITS.bytes) {
    return Response.json({ error: 'too large' }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    return Response.json({ error: 'not valid JSON' }, { status: 422 });
  }

  try {
    return Response.json({ restored: restoreNative(payload) });
  } catch (error) {
    if (error instanceof RestoreRejected) {
      return Response.json({ error: 'rejected', message: error.detail }, { status: 422 });
    }
    throw error;
  }
}
