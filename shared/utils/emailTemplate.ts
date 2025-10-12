const DEFAULT_BACKGROUND = '#F2F4F6';
const DEFAULT_CONTENT_BACKGROUND = '#FFFFFF';
const DEFAULT_TEXT_COLOR = '#51545E';
const DEFAULT_PRIMARY_COLOR = '#22BC66';
const DEFAULT_ACCENT_COLOR = '#3869D4';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractLeadingStyleContent(html: string): { styles: string; content: string } {
  let remaining = html.trim();
  let styles = '';
  const styleRegex = /^<style[\s\S]*?<\/style>/i;

  while (true) {
    const match = remaining.match(styleRegex);
    if (!match) {
      break;
    }

    const rawBlock = match[0];
    const contentMatch = rawBlock.match(/^<style[^>]*>([\s\S]*?)<\/style>$/i);
    if (contentMatch) {
      styles += `\n${contentMatch[1].trim()}`;
    }

    remaining = remaining.slice(rawBlock.length).trimStart();
  }

  return { styles: styles.trim(), content: remaining.trim() };
}

function buildBaseStyles(options: {
  backgroundColor?: string | null;
  contentBackgroundColor?: string | null;
  textColor?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
}): string {
  const backgroundColor = (options.backgroundColor || '').trim() || DEFAULT_BACKGROUND;
  const contentBackgroundColor = (options.contentBackgroundColor || '').trim() || DEFAULT_CONTENT_BACKGROUND;
  const textColor = (options.textColor || '').trim() || DEFAULT_TEXT_COLOR;
  const primaryColor = (options.primaryColor || '').trim() || DEFAULT_PRIMARY_COLOR;
  const accentColor = (options.accentColor || '').trim() || DEFAULT_ACCENT_COLOR;

  return `
:root {
  color-scheme: light only;
}
body {
  width: 100% !important;
  height: 100% !important;
  margin: 0;
  -webkit-text-size-adjust: none;
  background-color: ${backgroundColor};
  color: ${textColor};
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
}
a {
  color: ${accentColor};
}
.email-wrapper {
  width: 100%;
  margin: 0;
  padding: 0;
  background-color: ${backgroundColor};
}
.email-content {
  width: 100%;
  margin: 0;
  padding: 0;
}
.email-body {
  width: 100%;
  margin: 0;
  padding: 0;
  background-color: ${backgroundColor};
}
.email-body_inner {
  width: 570px;
  margin: 0 auto;
  padding: 0;
  background-color: ${contentBackgroundColor};
  border: 1px solid #EAEAEC;
  border-radius: 8px;
  overflow: hidden;
}
.content-cell {
  padding: 45px;
}
.preheader {
  display: none;
  visibility: hidden;
  mso-hide: all;
  font-size: 1px;
  line-height: 1px;
  max-height: 0;
  max-width: 0;
  opacity: 0;
  overflow: hidden;
}
.button,
.button--green,
.button.button--green {
  background-color: ${primaryColor} !important;
  border-top: 10px solid ${primaryColor} !important;
  border-right: 18px solid ${primaryColor} !important;
  border-bottom: 10px solid ${primaryColor} !important;
  border-left: 18px solid ${primaryColor} !important;
  color: #ffffff !important;
  text-decoration: none !important;
  display: inline-block;
  border-radius: 3px;
  box-shadow: 0 2px 3px rgba(0, 0, 0, 0.16);
  -webkit-text-size-adjust: none;
  box-sizing: border-box;
}
.table,
table {
  border-collapse: collapse;
}
`; // ensure trailing newline for concatenation
}

function replaceCompanyLogo(html: string, options: { logoUrl?: string | null; agencyName?: string | null }): string {
  const placeholderMatcher = /\{\{\s*COMPANY_LOGO\s*\}\}/i;
  if (!placeholderMatcher.test(html)) {
    return html;
  }

  const logoUrl = (options.logoUrl || '').trim();
  if (!logoUrl) {
    return html.replace(/\{\{\s*COMPANY_LOGO\s*\}\}/gi, '');
  }

  const altText = options.agencyName ? `${options.agencyName} logo` : 'Company logo';
  const logoMarkup = `<div style="text-align: center; margin-bottom: 30px;"><img src="${logoUrl}" alt="${escapeHtml(altText)}" style="max-width: 220px; height: auto;" /></div>`;

  return html.replace(/\{\{\s*COMPANY_LOGO\s*\}\}/gi, logoMarkup);
}

export interface EmailBrandingOptions {
  logoUrl?: string | null;
  agencyName?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  backgroundColor?: string | null;
  contentBackgroundColor?: string | null;
  textColor?: string | null;
  previewText?: string | null;
}

export function finalizeEmailHtml(rawHtml: string, branding: EmailBrandingOptions = {}): string {
  if (!rawHtml) {
    return '';
  }

  let html = rawHtml;
  html = replaceCompanyLogo(html, branding);

  const trimmed = html.trim();
  if (!trimmed) {
    return '';
  }

  const looksLikeFullDocument = /<html[\s>]/i.test(trimmed);
  if (looksLikeFullDocument) {
    return trimmed;
  }

  const { styles, content } = extractLeadingStyleContent(trimmed);
  const baseStyles = buildBaseStyles(branding);
  const combinedStyles = [baseStyles.trim(), styles].filter(Boolean).join('\n');
  const styleTag = combinedStyles ? `<style>${combinedStyles}</style>` : '';
  const preheader = branding.previewText ? `<span class="preheader">${escapeHtml(branding.previewText)}</span>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
${styleTag}
</head>
<body>
${preheader}
<table class="email-wrapper" width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td align="center">
      <table class="email-content" width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td class="email-body" width="100%">
            <table class="email-body_inner" align="center" width="570" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td class="content-cell">
                  ${content}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
