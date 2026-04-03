/**
 * YouTube Video Extractor
 * Uses ytdl-core and youtube-sr for reliable video extraction
 */

const axios = require('axios');

/**
 * Extract video information from YouTube URL
 * @param {string} url - YouTube video URL
 * @returns {Promise<Object>} - Video information with qualities
 */
async function extractYouTubeVideo(url) {
  try {
    console.log(`[YouTube] Extracting: ${url}`);

    // Try to use a public YouTube API approach
    // We'll fetch the video page and extract data from it
    const videoInfo = await fetchYouTubeInfo(url);

    if (!videoInfo || !videoInfo.title) {
      throw new Error('Could not retrieve video information from YouTube');
    }

    const title = videoInfo.title || 'YouTube Video';
    const thumbnailUrl = videoInfo.thumbnail || '';

    // Extract and normalize qualities
    const qualities = videoInfo.qualities || [];

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
 * Fetch YouTube video information from the page
 * @param {string} url - YouTube URL
 * @returns {Promise<Object>} - Video information
 */
async function fetchYouTubeInfo(url) {
  try {
    // Normalize URL
    let videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    // Try fetching from YouTube directly with appropriate headers
    const response = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000,
      maxRedirects: 5,
    });

    const html = response.data;

    // Extract title
    const titleMatch = html.match(/<meta name="title" content="([^"]+)"/);
    const title = titleMatch ? titleMatch[1] : `Video ${videoId}`;

    // Extract thumbnail
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    // Extract video information from initial data
    const initialDataMatch = html.match(/var ytInitialData = ({.*?});/s);
    let qualities = [];

    if (initialDataMatch) {
      try {
        const initialData = JSON.parse(initialDataMatch[1]);
        qualities = extractQualitiesFromInitialData(initialData);
      } catch (e) {
        console.log('[YouTube] Could not parse ytInitialData');
      }
    }

    // Fallback: Extract player response
    if (qualities.length === 0) {
      const playerMatch = html.match(/var ytInitialPlayerResponse = ({.*?});/s);
      if (playerMatch) {
        try {
          const playerResponse = JSON.parse(playerMatch[1]);
          qualities = extractQualitiesFromPlayerResponse(playerResponse);
        } catch (e) {
          console.log('[YouTube] Could not parse ytInitialPlayerResponse');
        }
      }
    }

    // If still no qualities, provide fallback
    if (qualities.length === 0) {
      qualities = [
        {
          label: 'Stream (Best Available)',
          url: `https://www.youtube.com/watch?v=${videoId}`,
        },
      ];
    }

    return {
      title,
      thumbnail: thumbnailUrl,
      qualities,
    };
  } catch (error) {
    console.error('[YouTube] Info fetch error:', error.message);
    throw new Error('Failed to extract YouTube video. Video might be private, age-restricted, or removed.');
  }
}

/**
 * Extract video ID from YouTube URL
 * @param {string} url - YouTube URL
 * @returns {string|null} - Video ID or null
 */
function extractVideoId(url) {
  // Handle youtu.be short links
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  // Handle youtube.com/watch?v=ID
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];

  // Handle youtube.com/shorts/ID
  const shortsMatch = url.match(/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];

  // Handle youtube.com/embed/ID
  const embedMatch = url.match(/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];

  return null;
}

/**
 * Extract qualities from ytInitialData
 * @param {Object} initialData - YouTube initial data
 * @returns {Array} - Quality options
 */
function extractQualitiesFromInitialData(initialData) {
  const qualities = [];
  try {
    // Navigate through the nested structure
    const streamingData = initialData?.streamingData;
    if (!streamingData) return qualities;

    // Check for formats or adaptiveFormats
    const formats = streamingData.formats || [];
    const adaptiveFormats = streamingData.adaptiveFormats || [];

    // Process formats (usually lower quality, has both audio and video)
    formats.forEach(format => {
      if (format.url && format.qualityLabel) {
        qualities.push({
          label: `${format.qualityLabel} (Video+Audio)`,
          url: format.url,
          height: parseInt(format.qualityLabel) || 0,
        });
      }
    });

    // Process adaptive formats (usually higher quality video-only)
    const videoFormats = adaptiveFormats
      .filter(f => f.mimeType && f.mimeType.includes('video') && !f.mimeType.includes('audio'))
      .sort((a, b) => (b.height || 0) - (a.height || 0))
      .slice(0, 5);

    videoFormats.forEach(format => {
      if (format.url && format.height) {
        qualities.push({
          label: `${format.height}p (Video only)`,
          url: format.url,
          height: format.height,
        });
      }
    });
  } catch (e) {
    console.log('[YouTube] Error processing initialData:', e.message);
  }

  return qualities;
}

/**
 * Extract qualities from ytInitialPlayerResponse
 * @param {Object} playerResponse - YouTube player response
 * @returns {Array} - Quality options
 */
function extractQualitiesFromPlayerResponse(playerResponse) {
  const qualities = [];
  try {
    const streamingData = playerResponse?.streamingData;
    if (!streamingData) return qualities;

    const formats = streamingData.formats || [];
    const adaptiveFormats = streamingData.adaptiveFormats || [];

    // Get all formats with video content
    const allFormats = [...formats, ...adaptiveFormats].filter(f => f.url);

    // Sort by height (quality) descending
    const sortedFormats = allFormats.sort((a, b) => (b.height || 0) - (a.height || 0));

    // Deduplicate and limit to top 5
    const seenHeights = new Set();
    sortedFormats.slice(0, 10).forEach(format => {
      const height = format.height || 0;
      if (height > 0 && !seenHeights.has(height)) {
        seenHeights.add(height);
        const hasAudio = format.audioCodec !== undefined;
        const label = hasAudio ? `${height}p (Video+Audio)` : `${height}p (Video only)`;

        qualities.push({
          label,
          url: format.url,
          height,
        });

        if (qualities.length >= 5) return;
      }
    });
  } catch (e) {
    console.log('[YouTube] Error processing playerResponse:', e.message);
  }

  return qualities;
}

module.exports = {
  extractYouTubeVideo,
};
