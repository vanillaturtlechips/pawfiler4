export const fixImageUrl = (url: string): string => {
  if (!url) return url;
  
  const cfDomain = (import.meta.env.VITE_MEDIA_CLOUDFRONT_DOMAIN || 'https://dx0x4vrja13f5.cloudfront.net')
    .replace('https://', '').replace('http://', '');

  // S3 URL → CloudFront URL 변환
  url = url.replace(/https?:\/\/pawfiler-quiz-media\.s3[^/]*\.amazonaws\.com/, `https://${cfDomain}`);

  return url
    .replace(/YOUR_CLOUDFRONT_DOMAIN/g, cfDomain)
    .replace(/your_cloudfront_domain/g, cfDomain)
    .replace(/https?:\/\/YOUR_CLOUDFRONT_DOMAIN/g, `https://${cfDomain}`)
    .replace(/https?:\/\/your_cloudfront_domain/g, `https://${cfDomain}`);
};
