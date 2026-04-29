export default function handler(_request, response) {
  const rawUrl = process.env.SUPABASE_URL || "";
  const url = rawUrl.startsWith("//")
    ? `https:${rawUrl}`
    : rawUrl && !/^https?:\/\//i.test(rawUrl)
      ? `https://${rawUrl}`
      : rawUrl;

  const config = {
    url,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "",
  };

  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json(config);
}
