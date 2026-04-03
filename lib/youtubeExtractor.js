/**
 * YouTube Video Extractor
 * Uses youtube-dl-exec to extract video information and download URLs
 */

const { execSync } = require('child_process');
const axios = require('axios');

/**
 * Extract video information from YouTube URL
 * @param {string} url - YouTube video URL
 * @returns {Promise<Object>} - Video information with qualities
 */
async function extractYouTubeVideo(url) {
  try {
    console.log(`[YouTube] Extracting: ${url}`);

    // Use youtube-dl to get format information
    let videoInfo;
    try {
      const command = `yt-dlp -j --no-warnings "${url}"`;
      const output = execSync(command, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
      videoInfo = JSON.parse(output);
    } catch (error) {
      console.error('[YouTube] yt-dlp extraction failed:', error.message);
      throw new Error('Failed to extract YouTube video. Video might be private, age-restricted, or removed.');
    }

    if (!videoInfo) {
      throw new Error('Could not retrieve video information from YouTube');
    }

    const title = videoInfo.title || 'YouTube Video';
    const thumbnailUrl = videoInfo.thumbnail || '';

    // Extract and normalize qualities
    const qualities = extractQualities(videoInfo);

    if (qualities.length === 0) {
      throw new Error('No downloadable formats found for this YouTube video');
    }

    console.log(`[YouTube] Found ${qualities.length} quality options for: ${title}`);

    return {
      qualities,
      title,
      thumbnailUrl,
      platform: 'youtube',
    };
  } catch (error) {
    console.error('[YouTube] Extraction error:', error.message);
    throw error;
  }
}

/**
 * Extract and normalize video qualities from youtube-dl JSON output
 * @param {Object} videoInfo - Video information from youtube-dl
 * @returns {Array} - Normalized qualities array
 */
function extractQualities(videoInfo) {
  const qualities = [];
  const seenUrls = new Set();

  // Get formats from youtube-dl output
  const formats = videoInfo.formats || [];

  // Map quality levels: [height, label]
  const qualityMap = {
    1080: 'HD (1080p)',
    720: 'High (720p)',
    480: 'Medium (480p)',
    360: 'Low (360p)',
    240: 'Lowest (240p)',
  };

  // Group formats by height and select best codec
  const heightMap = new Map();

  formats.forEach(format => {
    // Skip formats without video or audio
    if (!format.url) return;
    if (format.vcodec === 'none' && format.acodec === 'none') return;

    const height = format.height || 0;
    const hasVideo = format.vcodec !== 'none';
    const hasAudio = format.acodec !== 'none';

    // Prefer formats with both video and audio
    const score = (hasVideo ? 2 : 0) + (hasAudio ? 1 : 0);

    if (!heightMap.has(height) || heightMap.get(height).score < score) {
      heightMap.set(height, {
        url: format.url,
        height,
        score,
        format,
      });
    }
  });

  // Convert map to array and sort by height descending
  const sortedHeights = Array.from(heightMap.values())
    .sort((a, b) => b.height - a.height);

  // Add qualities
  for (const item of sortedHeights) {
    const { url, height, format } = item;

    // Skip if URL already added
    if (seenUrls.has(url)) continue;

    // Get label for this height
    let label = qualityMap[height] || `${height}p`;

    // Add codec info if available
    if (format.vcodec !== 'none' && format.acodec !== 'none') {
      label += ' (Video+Audio)';
    } else if (format.vcodec !== 'none') {
      label += ' (Video only)';
    } else if (format.acodec !== 'none') {
      label += ' (Audio only)';
    }

    qualities.push({
      label,
      url,
      height: height || 0,
    });

    seenUrls.add(url);

    // Limit to top 5 quality options
    if (qualities.length >= 5) break;
  }

  return qualities;
}

module.exports = {
  extractYouTubeVideo,
};
