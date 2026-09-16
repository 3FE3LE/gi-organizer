import { stageUpload, previewStaged } from '@/lib/player/import';
import { LIMITS } from '@/lib/good/schema';
import { summarizeIssues } from '@/lib/inventory/model';

/**
 * Accepts a GOOD upload and returns a preview of what importing it would do.
 *
 * A Route Handler rather than a Server Action because action bodies are capped
 * at 1 MB and a real export is several times that. Raising
 * `serverActions.bodySizeLimit` would lift the cap for every action on the site
 * to accommodate this one endpoint.
 *
 * Nothing is written to the inventory here. The file is staged and the plan is
 * returned; applying it is a separate, explicit step.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');

  if (!(file instanceof File)) {
    return Response.json({ error: 'no file' }, { status: 400 });
  }
  if (file.size > LIMITS.bytes) {
    return Response.json(
      { error: 'too large', message: `${file.size} bytes exceeds the ${LIMITS.bytes} cap` },
      { status: 413 },
    );
  }

  try {
    const staged = await stageUpload(await file.arrayBuffer(), file.name);
    const { plan, summary } = await previewStaged(staged.token);

    return Response.json({
      token: staged.token,
      filename: file.name,
      bytes: staged.bytes,
      origin: plan.origin,
      coverage: plan.coverage,
      summary,
      suspect: plan.suspect,
      issues: summarizeIssues(plan.issues),
      ambiguous: plan.artifacts.verdicts
        .map((verdict, index) => ({ verdict, index }))
        .filter((entry) => entry.verdict.kind === 'ambiguous')
        .map((entry) => ({
          index: entry.index,
          candidateIds:
            entry.verdict.kind === 'ambiguous' ? entry.verdict.candidateIds : [],
        })),
    });
  } catch (error) {
    return Response.json(
      { error: 'unreadable', message: (error as Error).message },
      { status: 422 },
    );
  }
}
