function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; background: #fafafa; color: #18181b; display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; padding: 24px; box-sizing: border-box; }
  main { max-width: 420px; width: 100%; background: #fff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 24px; text-align: center; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  p { font-size: 14px; color: #52525b; line-height: 1.5; }
  button { margin-top: 16px; background: #18181b; color: #fff; border: none; border-radius: 6px; padding: 10px 16px; font-size: 14px; cursor: pointer; }
  button:hover { background: #3f3f46; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

export function renderUnsubscribeConfirmPage(
  token: string,
  email: string,
): string {
  return page(
    'Unsubscribe',
    `<h1>Unsubscribe ${escapeHtml(email)}?</h1>
     <p>You'll stop receiving emails from us. This takes effect immediately.</p>
     <form method="post" action="/u/${encodeURIComponent(token)}">
       <button type="submit">Unsubscribe me</button>
     </form>`,
  );
}

export function renderUnsubscribeDonePage(email: string): string {
  return page(
    'Unsubscribed',
    `<h1>You're unsubscribed</h1>
     <p>${escapeHtml(email)} won't receive any further emails from us.</p>`,
  );
}

export function renderUnsubscribeInvalidPage(): string {
  return page(
    'Link not found',
    `<h1>This link is no longer valid</h1>
     <p>We couldn't find a matching subscription. If you're still receiving unwanted emails, please contact us directly.</p>`,
  );
}
