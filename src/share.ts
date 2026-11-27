/** 'manual': neither sharing nor copying works, the page must show the text to copy by hand. */
export type ShareResult = 'shared' | 'copied' | 'manual';

export async function share(text: string, url: string): Promise<ShareResult> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text, url });
      return 'shared';
    } catch (error) {
      // The person closed the share sheet: nothing more to do.
      if ((error as Error).name === 'AbortError') return 'shared';
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch {
    return 'manual';
  }
}
