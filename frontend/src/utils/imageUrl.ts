export const fixImageUrl = (url: string): string => {
  if (!url) return url;
  
  const cloudfront = import.meta.env.VITE_CLOUDFRONT_DOMAIN || 'https://d3r7vdedgc0gqv.cloudfront.net';
  
  return url
    .replace(/YOUR_CLOUDFRONT_DOMAIN/g, cloudfront.replace('https://', ''))
    .replace(/your_cloudfront_domain/g, cloudfront.replace('https://', ''))
    .replace(/http:\/\/YOUR_CLOUDFRONT_DOMAIN/g, cloudfront)
    .replace(/https:\/\/YOUR_CLOUDFRONT_DOMAIN/g, cloudfront)
    .replace(/http:\/\/your_cloudfront_domain/g, cloudfront)
    .replace(/https:\/\/your_cloudfront_domain/g, cloudfront);
};
