/**
 * Instagram Reels Extractor
 * Extracts video URLs from Instagram Reels/Posts using HTML scraping and meta tags
 */

const axios = require('axios');

/**
 * Extract video information from Instagram URL
 * @param {string} url - Instagram URL (reel, post, etc.)
 * @returns {Promise<Object>} - Video information with qualities
 */
async function extractInstagramVideo(url) {
  try {
    console.log(`[Instagram] Extracting: ${url}`);

    // Normalize URL to ensure it's in the correct format
    const normalizedUrl = normalizeInstagramUrl(url);

    // First try with the standard headers
    let pageResponse;
    try {
      pageResponse = await fetchInstagramPage(normalizedUrl);
    } catch (error) {
      console.error('[Instagram] Standard fetch failed:', error.message);
      // Try with alternative approach
      pageResponse = await fetchInstagramPageAlternative(normalizedUrl);
    }

    if (pageResponse.status !== 200) {
      throw new Error(`Instagram returned ${pageResponse.status}. The reel might be private or deleted.`);
    }

    const html = pageResponse.data;

    // Extract video URL from various meta tags and JSON structures
    const videoUrl = extractVideoUrl(html);
    if (!videoUrl) {
      throw new Error('Could not extract video URL from Instagram. The reel might be private or removed.');
    }

    // Extract title and thumbnail
    const title = extractTitle(html);
    const thumbnailUrl = extractThumbnail(html);

    // Instagram typically provides single quality, but we can note if it's HD
    const qualities = [
      {
        label: 'High Quality',
        url: videoUrl,
      },
    ];

    // Try to find alternative quality if available
    const alternativeUrl = extractAlternativeVideoUrl(html);
    if (alternativeUrl && alternativeUrl !== videoUrl) {
      qualities.push({
        label: 'Standard Quality',
        url: alternativeUrl,
      });
    }

    console.log(`[Instagram] Found ${qualities.length} quality options for: ${title}`);

    return {
      qualities,
      title,
      thumbnailUrl,
      platform: 'instagram',
    };
  } catch (error) {
    console.error('[Instagram] Extraction error:', error.message);
    throw error;
  }
}

/**
 * Fetch Instagram page with standard headers
 * @param {string} url - Instagram URL
 * @returns {Promise<Response>} - Page response
 */
async function fetchInstagramPage(url) {
  return axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'max-age=0',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1',
    },
    maxRedirects: 10,
    timeout: 10000,
    validateStatus: (status) => status < 500,
  });
}

/**
 * Fetch Instagram page with alternative headers
 * @param {string} url - Instagram URL
 * @returns {Promise<Response>} - Page response
 */
async function fetchInstagramPageAlternative(url) {
  return axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    maxRedirects: 10,
    timeout: 10000,
    validateStatus: (status) => status < 500,
  });
}

/**
 * Normalize Instagram URL to ensure it's in a consistent format
 * @param {string} url - Instagram URL
 * @returns {string} - Normalized URL
 */
function normalizeInstagramUrl(url) {
  // Convert instagr.am to instagram.com
  url = url.replace(/instagr\.am/i, 'instagram.com');

  // Ensure URL has protocol
  if (!url.startsWith('http')) {
    url = 'https://' + url;
  }

  // Remove query parameters and fragments but keep the path
  const urlObj = new URL(url);
  // Ensure trailing slash for consistency
  let pathname = urlObj.pathname;
  if (!pathname.endsWith('/')) {
    pathname += '/';
  }

  return `https://${urlObj.hostname}${pathname}`;
}

/**
 * Extract video URL from HTML content
 * @param {string} html - HTML content of the Instagram page
 * @returns {string|null} - Video URL or null if not found
 */
function extractVideoUrl(html) {
  // Method 1: og:video meta tag (most reliable)
  let match = html.match(/<meta\s+property=["']og:video["']\s+content=["']([^"']+)["']/i);
  if (match && match[1]) {
    const url = decodeHtmlEntities(match[1]);
    if (isValidUrl(url)) return url;
  }

  // Method 2: og:video:url
  match = html.match(/<meta\s+property=["']og:video:url["']\s+content=["']([^"']+)["']/i);
  if (match && match[1]) {
    const url = decodeHtmlEntities(match[1]);
    if (isValidUrl(url)) return url;
  }

  // Method 3: video tag src attribute
  match = html.match(/<video[^>]*src=["']([^"']+)["']/i);
  if (match && match[1]) {
    const url = decodeHtmlEntities(match[1]);
    if (isValidUrl(url)) return url;
  }

  // Method 4: Extract from JSON-LD or embedded JSON
  match = html.match(/"video"\s*:\s*(\[.*?\])/s);
  if (match) {
    try {
      const videoArray = JSON.parse(match[1]);
      if (Array.isArray(videoArray) && videoArray.length > 0) {
        if (videoArray[0].url) {
          const url = decodeHtmlEntities(videoArray[0].url);
          if (isValidUrl(url)) return url;
        }
      }
    } catch (e) {
      // Continue to next method
    }
  }

  // Method 5: Look for Instagram's media URL patterns
  match = html.match(/["']playable_content_url["']\s*:\s*["']([^"']+)["']/);
  if (match && match[1]) {
    const url = decodeHtmlEntities(match[1]);
    if (isValidUrl(url)) return url;
  }

  // Method 6: Look for video_url in any context
  match = html.match(/["']video_url["']\s*:\s*["']([^"']+)["']/);
  if (match && match[1]) {
    const url = decodeHtmlEntities(match[1]);
    if (isValidUrl(url)) return url;
  }

  // Method 7: Generic media URL patterns
  match = html.match(/["']media_url["']\s*:\s*["']([^"']+\.mp4[^"']*)["']/);
  if (match && match[1]) {
    const url = decodeHtmlEntities(match[1]);
    if (isValidUrl(url)) return url;
  }

  // Method 8: Look for any MP4 URL in the HTML
  match = html.match(/https?:\/\/[^"'\s<>\n]+\.mp4[^\s"'<>\n]*/i);
  if (match) {
    return match[0];
  }

  return null;
}

/**
 * Extract alternative video URL if available
 * @param {string} html - HTML content
 * @returns {string|null} - Alternative video URL or null
 */
function extractAlternativeVideoUrl(html) {
  // Try to find video URLs in script tags or data attributes
  const matches = html.match(/https?:\/\/[^"'\s<>\n]+\.mp4[^\s"'<>\n]*/gi);
  if (matches && matches.length > 1) {
    // Return second URL if it exists and is different
    return matches[1];
  }
  return null;
}

/**
 * Extract video title from HTML
 * @param {string} html - HTML content
 * @returns {string} - Video title
 */
function extractTitle(html) {
  // Try og:title
  let match = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  if (match && match[1]) {
    return decodeHtmlEntities(match[1]);
  }

  // Try regular title tag
  match = html.match(/<title\s*>([^<]+)<\/title>/i);
  if (match && match[1]) {
    return decodeHtmlEntities(match[1]);
  }

  // Try twitter:title
  match = html.match(/<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i);
  if (match && match[1]) {
    return decodeHtmlEntities(match[1]);
  }

  return 'Instagram Video';
}

/**
 * Extract thumbnail URL from HTML
 * @param {string} html - HTML content
 * @returns {string} - Thumbnail URL
 */
function extractThumbnail(html) {
  // Try og:image
  let match = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (match && match[1]) {
    return decodeHtmlEntities(match[1]);
  }

  // Try twitter:image
  match = html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i);
  if (match && match[1]) {
    return decodeHtmlEntities(match[1]);
  }

  // Try instagram image
  match = html.match(/<meta\s+property=["']instagram:image["']\s+content=["']([^"']+)["']/i);
  if (match && match[1]) {
    return decodeHtmlEntities(match[1]);
  }

  // Try video poster attribute
  match = html.match(/<video[^>]*poster=["']([^"']+)["']/i);
  if (match && match[1]) {
    return decodeHtmlEntities(match[1]);
  }

  return '';
}

/**
 * Decode HTML entities in strings
 * @param {string} str - String with HTML entities
 * @returns {string} - Decoded string
 */
function decodeHtmlEntities(str) {
  if (!str) return str;

  const map = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#47;': '/',
  };

  return str.replace(/&[^;]+;/g, (match) => map[match] || match);
}

/**
 * Check if a string is a valid URL
 * @param {string} url - String to check
 * @returns {boolean} - True if valid URL
 */
function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    new URL(url);
    return url.includes('http');
  } catch {
    return false;
  }
}

module.exports = {
  extractInstagramVideo,
};
