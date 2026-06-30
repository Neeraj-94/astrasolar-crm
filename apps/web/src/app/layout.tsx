import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AstraSolar CRM",
  description: "Internal CRM platform for AstraSolar.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/site.webmanifest",
};

/*
 * No-flash theme bootstrap.
 *
 * Astra brand is dark-first. If the user has saved a preference we honour it,
 * otherwise we default to dark regardless of the OS setting (matches the
 * legacy app, which always opened in the gold-on-dark theme).
 *
 * The script attaches BOTH the `.dark` class (shadcn convention) and removes
 * any stale `.light` class so CSS variables resolve to the dark palette
 * before React hydrates.
 */
const THEME_BOOTSTRAP = `(function(){try{
  var t = localStorage.getItem('astrasolar:theme');
  if (t !== 'light') t = 'dark';
  var el = document.documentElement;
  el.classList.remove('light','dark');
  el.classList.add(t);
} catch(_) { document.documentElement.classList.add('dark'); }
})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        {/* DM Sans — matches the legacy CEO chrome */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
