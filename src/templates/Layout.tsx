export function Layout(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>imgchat - AI Image Generation</title>

  <!-- PWA -->
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#0a0a0a">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

  <!-- Open Graph -->
  <meta property="og:title" content="imgchat">
  <meta property="og:description" content="AI Image Generation Chat">
  <meta property="og:type" content="website">

  <!-- Styles -->
  <link rel="stylesheet" href="/dist/main.css">

  <!-- Plausible Analytics -->
  <script defer data-domain="imgchat.justright.fm" src="https://plausible.ljs.app/js/script.hash.js"></script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/dist/app.js"></script>
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }
  </script>
</body>
</html>`;
}
