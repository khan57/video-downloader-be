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

    // Fetch the Instagram page
    const pageResponse = await axios.get(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'max-age=0',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
      maxRedirects: 10,
      timeout: 15000,
    });

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

  // Remove query parameters and fragments (sometimes help with caching)
  const urlObj = new URL(url);
  return urlObj.href.split('?')[0].split('#')[0];
}

/**
 * Extract video URL from HTML content
 * @param {string} html - HTML content of the Instagram page
 * @returns {string|null} - Video URL or null if not found
 */
function extractVideoUrl(html) {
  // Try various extraction methods in order of reliability

  // Method 1: og:video meta tag (most reliable)
  const ogVideoMatch = html.match(/<meta property="og:video" content="([^"]+)"/);
  if (ogVideoMatch && ogVideoMatch[1]) {
    return decodeHtmlEntities(ogVideoMatch[1]);
  }

  // Method 2: og:video:url
  const ogVideoUrlMatch = html.match(/<meta property="og:video:url" content="([^"]+)"/);
  if (ogVideoUrlMatch && ogVideoUrlMatch[1]) {
    return decodeHtmlEntities(ogVideoUrlMatch[1]);
  }

  // Method 3: video tag src attribute
  const videoSrcMatch = html.match(/<video[^>]*src="([^"]+)"/i);
  if (videoSrcMatch && videoSrcMatch[1]) {
    return decodeHtmlEntities(videoSrcMatch[1]);
  }

  // Method 4: Extract from JSON-LD or embedded JSON
  const jsonMatch = html.match(/"video":(\[.*?\])/);
  if (jsonMatch) {
    try {
      const videoArray = JSON.parse(jsonMatch[1]);
      if (Array.isArray(videoArray) && videoArray.length > 0 && videoArray[0].url) {
        return decodeHtmlEntities(videoArray[0].url);
      }
    } catch (e) {
      // Continue to next method
    }
  }

  // Method 5: Look for Instagram's video URLs in window.__data or similar structures
  const instagramVideoMatch = html.match(/"video_url":"([^"]+)"/);
  if (instagramVideoMatch && instagramVideoMatch[1]) {
    return decodeHtmlEntities(instagramVideoMatch[1]);
  }

  // Method 6: Generic MP4 URL as fallback
  const mp4Match = html.match(/https?:\/\/[^"'\s<]+\.mp4[^"'\s<]*/);
  if (mp4Match) {
    return mp4Match[0];
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
  const altMatch = html.match(/"video_url":"([^"]+)"|data-video-url="([^"]+)"/);
  if (altMatch && (altMatch[1] || altMatch[2])) {
    return decodeHtmlEntities(altMatch[1] || altMatch[2]);
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
  const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  if (ogTitleMatch && ogTitleMatch[1]) {
    return decodeHtmlEntities(ogTitleMatch[1]);
  }

  // Try regular title tag
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch && titleMatch[1]) {
    return decodeHtmlEntities(titleMatch[1]);
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
  const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
  if (ogImageMatch && ogImageMatch[1]) {
    return decodeHtmlEntities(ogImageMatch[1]);
  }

  // Try twitter:image
  const twitterImageMatch = html.match(/<meta name="twitter:image" content="([^"]+)"/);
  if (twitterImageMatch && twitterImageMatch[1]) {
    return decodeHtmlEntities(twitterImageMatch[1]);
  }

  // Try video poster attribute
  const posterMatch = html.match(/<video[^>]*poster="([^"]+)"/i);
  if (posterMatch && posterMatch[1]) {
    return decodeHtmlEntities(posterMatch[1]);
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
  };

  return str.replace(/&[^;]+;/g, (match) => map[match] || match);
}

module.exports = {
  extractInstagramVideo,
};
