console.log('VITE_API_BASE_URL:', process.env.VITE_API_BASE_URL);
console.log('All VITE_ vars:', Object.keys(process.env).filter(k => k.startsWith('VITE_')));
