export function LoginPrompt() {
  const loginUrl = `https://justright.fm/login?returnTo=${encodeURIComponent(window.location.href)}`;

  return (
    <div class="login-prompt">
      <div class="login-card">
        <h1>imgchat</h1>
        <p>AI-powered image generation and editing</p>
        <p class="login-info">Sign in with your Just Right FM account to continue</p>
        <a href={loginUrl} class="login-button">
          Sign In
        </a>
      </div>
    </div>
  );
}
