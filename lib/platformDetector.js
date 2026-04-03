/**
 * Platform Detector - Identifies the source platform of a video URL
 */

const PLATFORM_PATTERNS = {
  facebook: [
    /facebook\.com/i,
    /fb\.watch/i,
    /m\.facebook\.com/i,
  ],
  instagram: [
    /instagram\.com\/(p|reel|tv)\//i,
    /instagr\.am\//i,
    /instagram\.com\/reel\//i,
  ],
  youtube: [
    /youtube\.com\/watch/i,
    /youtu\.be\//i,
    /youtube\.com\/shorts\//i,
    /m\.youtube\.com/i,
  ],
  direct: [
    /\.(mp4|webm|mov|m4v|mkv|avi)(\?|#|$)/i,
  ],
};

/**
 * Detect the platform of a given video URL
 * @param {string} url - The video URL
 * @returns {string} - Platform identifier: 'facebook', 'instagram', 'youtube', 'direct', or 'unknown'
 */
function detectPlatform(url) {
  if (!url || typeof url !== 'string') {
    return 'unknown';
  }

  // Check direct video files first
  if (PLATFORM_PATTERNS.direct.some(pattern => pattern.test(url))) {
    return 'direct';
  }

  // Check other platforms
  for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
    if (platform === 'direct') continue;
    if (patterns.some(pattern => pattern.test(url))) {
      return platform;
    }
  }

  return 'unknown';
}

module.exports = {
  detectPlatform,
};
