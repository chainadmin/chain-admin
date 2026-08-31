export function decodeStoredHtml(fileUrl: string | null): string | null {
  if (!fileUrl) return null;

  const urlEncoded = fileUrl.match(/^data:text\/html(?:;charset=utf-8)?,([\s\S]*)$/);
  if (urlEncoded) {
    try {
      return decodeURIComponent(urlEncoded[1]);
    } catch {
      return null;
    }
  }

  const base64 = fileUrl.match(/^data:text\/html;base64,([\s\S]*)$/);
  if (base64) {
    try {
      return Buffer.from(base64[1], 'base64').toString('utf8');
    } catch {
      return null;
    }
  }

  return null;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildLegacySignedArtifact(
  sourceHtml: string,
  signatureData: string,
  initialsData: string | null,
  signedAt: Date | string | null,
): string {
  const signedTimestamp = signedAt ? new Date(signedAt).toISOString() : 'Unknown';
  const appendix = `
    <section data-chain-legacy-signature-record="true" style="margin-top:32px;padding-top:20px;border-top:1px solid #ccc">
      <h2>Electronic Signature Record</h2>
      <p>Signed at: ${escapeHtmlAttribute(signedTimestamp)}</p>
      <p><strong>Signature</strong></p>
      <img alt="Electronic signature" style="max-width:320px;max-height:120px" src="${escapeHtmlAttribute(signatureData)}" />
      ${initialsData ? `<p><strong>Initials</strong></p><img alt="Electronic initials" style="max-width:180px;max-height:90px" src="${escapeHtmlAttribute(initialsData)}" />` : ''}
    </section>
  `;

  return sourceHtml.includes('</body>')
    ? sourceHtml.replace('</body>', `${appendix}</body>`)
    : `${sourceHtml}${appendix}`;
}

export function buildLegacyReferencedSignedArtifact(
  sourceReference: string | null,
  signatureData: string,
  initialsData: string | null,
  signedAt: Date | string | null,
): string {
  const reference = sourceReference || 'Original legacy document reference unavailable';
  const safeReference = escapeHtmlAttribute(reference);
  const referenceMarkup = /^data:(?:application\/pdf|image\/(?:png|jpeg|webp));base64,/i.test(reference)
    ? `<object aria-label="Original document" data="${safeReference}" style="width:100%;min-height:720px"></object>`
    : /^https?:\/\//i.test(reference)
      ? `<p><a href="${safeReference}" rel="noopener noreferrer">Open the original document reference</a></p>
         <p style="overflow-wrap:anywhere">${safeReference}</p>`
      : `<p style="overflow-wrap:anywhere">${safeReference}</p>`;

  return buildLegacySignedArtifact(
    `<html><body>
      <h1>Legacy Electronic Signature Receipt</h1>
      <p>The prior system retained this document as a reference rather than embedded HTML. The exact reference available at migration time is preserved below.</p>
      ${referenceMarkup}
    </body></html>`,
    signatureData,
    initialsData,
    signedAt,
  );
}