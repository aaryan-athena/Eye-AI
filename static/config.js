/* API configuration — update BACKEND_URL after deploying to HF Spaces */
const CONFIG = {
  // Replace with your actual HF Spaces URL:
  // Format: https://YOUR-HF-USERNAME-SPACE-NAME.hf.space
  BACKEND_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:7860'
    : 'https://YOUR-HF-USERNAME-fundus-ai.hf.space',

  API_PREDICT: '/predict',
  API_HEALTH:  '/health',
};
